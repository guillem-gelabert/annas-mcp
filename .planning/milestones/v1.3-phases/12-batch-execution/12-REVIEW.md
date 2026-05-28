---
phase: 12-batch-execution
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/tools/article-tools.ts
  - tests/article-tools.test.ts
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: fixed
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-20
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Two source files reviewed: the main article tools handler (`src/tools/article-tools.ts`) implementing single and batch DOI resolution/download, and its test suite. The batch download logic is the primary new work. The implementation is broadly sound — `Promise.allSettled` fan-out, pre-flight path validation, and per-source fallback are all correct in structure. However, two correctness bugs were found in the download pipeline (one causing widespread CDN download failures, one causing false PDF rejections on short first chunks), the `article_download` tool is missing its output schema registration, and batch results are emitted in non-input order.

---

## Critical Issues

### CR-01: `redirect: "error"` breaks CDN downloads unconditionally

**File:** `src/tools/article-tools.ts:396`
**Issue:** `fetchFn` is called with `redirect: "error"`, which causes the Fetch API to throw a `TypeError` (treated as a network error) on any HTTP redirect. CDN-hosted PDFs routinely use redirect chains (302/301). This means every `fast_download` source URL that redirects — the common case — immediately throws and falls through to the slower `scidb` fallback. The `scidb` source is a page URL, not a direct download, so it will typically return HTML and fail the `content-type` check. In practice this makes file download nearly non-functional unless the CDN returns the file with no redirect.

**Fix:** Change `redirect` to `"follow"` (the default). The magic-bytes check already guards against HTML/non-PDF responses, so redirect safety is maintained by content validation rather than redirect blocking.

```typescript
const response = await fetchFn(source.url, {
  signal: controller.signal,
  redirect: "follow",  // was "error" — CDN downloads use redirects
  headers: {
    "User-Agent": BROWSER_USER_AGENT,
  },
});
```

---

### CR-02: Short first chunk bypasses PDF magic-bytes check

**File:** `src/tools/article-tools.ts:444-451`
**Issue:** The magic-bytes validation reads `chunkArray.slice(0, 5)` and checks `firstBytes.startsWith("%PDF-")`. If the very first chunk delivered by the stream is fewer than 5 bytes (valid for chunked transfer encoding or a slow CDN), `firstBytes` will be a string shorter than 5 characters and will never equal `"%PDF-"`, causing a valid PDF to be rejected with "magic bytes check failed". The file is then discarded, `writeStream.destroy()` is called, and the source is marked as failed.

**Fix:** Accumulate bytes across chunks until at least 5 are available before performing the check.

```typescript
let headerBuf = new Uint8Array(0);
let firstChunkChecked = false;

for await (const chunk of response.body as any) {
  const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk));

  if (!firstChunkChecked) {
    // Accumulate until we have at least 5 bytes
    const merged = new Uint8Array(headerBuf.length + bytes.length);
    merged.set(headerBuf);
    merged.set(bytes, headerBuf.length);
    headerBuf = merged;

    if (headerBuf.length >= 5) {
      const magic = new TextDecoder().decode(headerBuf.slice(0, 5));
      if (!magic.startsWith("%PDF-")) {
        writeStream.destroy();
        await rm(tmpFilePath, { force: true });
        throw new Error("Downloaded file does not appear to be a valid PDF (magic bytes check failed)");
      }
      firstChunkChecked = true;
    }
  }
  // ... rest of loop unchanged
}

// Guard: if stream ended before 5 bytes arrived (truncated response)
if (!firstChunkChecked) {
  writeStream.destroy();
  await rm(tmpFilePath, { force: true });
  throw new Error("Downloaded file too small to verify PDF header");
}
```

---

## Warnings

### WR-01: `article_download` tool registered without `outputSchema`

**File:** `src/tools/article-tools.ts:318-331`
**Issue:** `article_search` is registered with `outputSchema: articleSearchOutputSchema` (line 309). `article_download` is registered without an `outputSchema` at all. Both `articleDownloadOutputSchema` and `articleBatchDownloadOutputSchema` are defined and exported (lines 86–102) but never passed to `registerTool`. MCP clients that use the output schema for structured content validation or display will receive no schema for download results.

**Fix:** Pass the appropriate output schema. Since the handler dispatches to either single or batch, the batch schema is the superset (it always has a `results` array). Alternatively register a union schema or use `articleBatchDownloadOutputSchema` as the declared output:

```typescript
server.registerTool(
  "article_download",
  {
    title: "Article Download",
    description: "...",
    inputSchema: articleDownloadInputSchema,
    outputSchema: articleBatchDownloadOutputSchema,  // add this
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
    },
  },
  (args) => handleArticleDownload(args, dependencies),
);
```

---

### WR-02: Batch results are not emitted in input DOI order

**File:** `src/tools/article-tools.ts:250-292`
**Issue:** The `results` array is populated in two separate passes. Failed lookups are pushed in the first loop (line 259) as they are encountered. Successful items are pushed in a second loop (lines 282–291). The final array is therefore: `[all lookup failures, all successful items]` — not input order. A caller correlating by position rather than the `doi` field will receive incorrect mappings. The test at line 447 (`sc.results[0]` is the failing DOI) passes only because `failingDoi` happened to be first in the input array, masking the ordering bug.

**Fix:** Pre-allocate a results array indexed by position, then fill each slot at its original index:

```typescript
const results: (ArticleBatchResult | undefined)[] = new Array(args.dois.length);

// In lookup loop:
for (let i = 0; i < lookupSettled.length; i++) {
  if (settled.status === "fulfilled") {
    resolvedItems.push({ doi, resolution: settled.value.resolution, index: i });
  } else {
    results[i] = { doi, error: msg };
  }
}

// In download/no-download loop, write to results[originalIndex]
```

---

### WR-03: `getFileExtension` always called with empty headers object

**File:** `src/tools/article-tools.ts:349`
**Issue:** `getFileExtension({})` is called with a hardcoded empty object, never the actual response headers. The function contains logic to parse `content-disposition` and `content-type` headers (file-utils.ts lines 77–93), but that logic is permanently dead. Since the HTTP response object is available at that point in the calling scope, this appears to be an oversight from refactoring.

Note: the function always returns `".pdf"` regardless of input due to the fallback at line 92 in `file-utils.ts`, so there is no current misbehavior — but the header-inspection logic is entirely unreachable.

**Fix:** Either pass the actual response headers or remove the header-parsing logic from `getFileExtension` and simplify it to return `".pdf"` directly:

```typescript
// Option A: pass real headers (if response is in scope — it is at line 349 callsite in saveArticleFile)
const extension = getFileExtension(Object.fromEntries(response.headers));

// Option B: simplify the function since all paths return ".pdf"
export function getFileExtension(): string {
  return ".pdf";
}
```

---

### WR-04: `writeStream.destroy()` called without explicit error in magic-check and size-limit branches

**File:** `src/tools/article-tools.ts:448-450, 458-460`
**Issue:** In both the magic-bytes rejection branch (line 448) and the size-limit branch (line 458), `writeStream.destroy()` is called without an error argument. The stream's `"error"` event is only emitted when `destroy(err)` receives an error. Without an error argument, destroy triggers an `"close"` event path. However, the outer Promise's `reject` is attached to `writeStream.on("error", ...)` — not `"close"`. The thrown error is caught by the IIFE's `catch (err)` at line 468 which calls `reject(err)`, so rejection does happen — but only after the async cleanup (`await rm(...)`) completes inside the IIFE. Meanwhile `writeStream.destroy()` without an error emits `"close"`, which does not trigger the `"error"` listener, so there is no double-rejection. The flow is technically correct but fragile: if future code adds a `"close"` or `"finish"` listener expecting the normal path, it would race with the error path.

**Fix:** Pass the error to `destroy` to make intent explicit and prevent a future `"finish"` handler from firing after the error:

```typescript
const magicErr = new Error("Downloaded file does not appear to be a valid PDF (magic bytes check failed)");
writeStream.destroy(magicErr);
await rm(tmpFilePath, { force: true });
throw magicErr;
```

---

## Info

### IN-01: Unused variable `fetchedUrls` in cache test

**File:** `tests/article-tools.test.ts:321`
**Issue:** `const fetchedUrls: string[] = []` is declared but never populated or asserted on. The variable was likely intended to track which URLs were fetched to verify no download URL was called on a cache hit, but the assertion using it was never written.

**Fix:** Either remove the dead variable or complete the intended assertion:

```typescript
// Remove entirely, or complete intent:
const fetchedUrls: string[] = [];
const trackingFetch: FetchLike = async (input, init) => {
  fetchedUrls.push(String(input));
  return fetchMock(input, init);
};
// ... use trackingFetch instead of fetchMock
expect(fetchedUrls.every(url => !url.includes("download.example"))).toBe(true);
```

---

### IN-02: Complex inline type alias in `handleBatchArticleDownload`

**File:** `src/tools/article-tools.ts:234-235`
**Issue:** The `ResolvedItem` and `FailedItem` type aliases are declared inline inside the function body using `type` declarations inside a non-type scope. `FailedItem` is declared but never referenced (the code uses anonymous inline shapes). Both add noise without benefit.

**Fix:** Remove the unused `FailedItem` type alias and either remove `ResolvedItem` or promote it to module scope alongside `ArticleBatchResult`.

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
