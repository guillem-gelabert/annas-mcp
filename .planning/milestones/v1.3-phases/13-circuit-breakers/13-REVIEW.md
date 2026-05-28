---
phase: 13-circuit-breakers
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/tools/article-tools.ts
  - tests/article-tools.test.ts
findings:
  critical: 3
  warning: 5
  info: 0
  total: 8
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-20
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

This phase adds circuit breaker behaviour to the batch DOI download path: a base-URL re-discovery CB (CB-01/02/03) and a CDN host denylist CB (CB-04/05/06). The single-DOI path is unchanged. The overall design is sound, but three correctness bugs were found in `downloadOneSource` involving the interplay between stream destruction, async error propagation, and timeout clearing, plus a state-update omission in the batch base-URL CB. The test suite has one dead-assertion test that provides no real coverage for its stated purpose.

---

## Critical Issues

### CR-01: `baseUrl` outer variable never updated after re-discovery — every concurrent DOI hits the dead mirror unnecessarily

**File:** `src/tools/article-tools.ts:239-274`

`baseUrl` is read once from `manager.resolveBaseUrl()` at line 239 and closed over by every `lookupOne` invocation. When `rediscoveryPromise` resolves to `newBaseUrl` (line 273), that value is used only for the local retry at lines 274–275. `baseUrl` in the outer scope remains stale.

Because `Promise.allSettled` launches all `lookupOne` calls concurrently, every DOI that triggers `isLikelyOfflineBaseUrlError` makes a failed round-trip to the dead mirror, awaits the shared `rediscoveryPromise`, and then retries correctly. This means N failed network calls to the dead mirror (one per DOI) instead of one. For large batches this is a correctness defect — the CB is supposed to prevent fan-out to a known-bad mirror, but it only deduplicates the re-discovery call, not the failed initial calls.

**Fix:**
```typescript
// Line 273 — after awaiting the new base URL, write it back
const newBaseUrl = await rediscoveryPromise;
baseUrl = newBaseUrl;   // ← add this line so subsequent lookupOne calls skip the dead mirror
const retryService = new ArticleService(
  { ...dependencies.config, baseUrl: newBaseUrl },
  dependencies.fetchImpl,
);
```

---

### CR-02: `writeStream.destroy(err)` in the stream body IIFE causes double-`reject` — a successful `rename` can race with the thrown error

**File:** `src/tools/article-tools.ts:530-566`

In the magic-bytes check (line 533), size-limit check (line 545), and truncated-response check (line 558), the pattern is:

```typescript
writeStream.destroy(magicErr);          // schedules writeStream "error" event → reject(magicErr)
await rm(tmpFilePath, { force: true });
throw magicErr;                         // bubbles to catch at 564 → writeStream.destroy() + reject(magicErr) again
```

The `writeStream.on("error")` handler at line 511 calls `reject(err)` and triggers another `rm`. The `catch` at line 564 calls `writeStream.destroy()` (no-arg) which emits `finish` if any data was flushed — the `finish` handler at line 496 can then call `rename` and `resolve(filePath)`, racing with all the `reject` calls.

Practically: if a few bytes were written before the magic-bytes check fires, `finish` may run before all `reject` paths, causing the Promise to resolve with a path to a partial/invalid tmp file that got renamed to the final path (the outer `catch` at line 570 deletes `tmpFilePath`, which is now gone, so the corrupt final file is left on disk).

**Fix:** Replace the triple-call pattern with a single rejection path via the IIFE's own `catch`. Never call `writeStream.destroy(err)` inside the IIFE when you're about to `throw` — let the `catch` block handle destruction:

```typescript
// Inside the async IIFE — replace:
const magicErr = new Error("…");
writeStream.destroy(magicErr);
await rm(tmpFilePath, { force: true });
throw magicErr;

// With:
throw new Error("Downloaded file does not appear to be a valid PDF (magic bytes check failed)");
// The catch at line 564 handles writeStream.destroy() and reject()
```

Then in the `catch` block (line 564), call `writeStream.destroy(err)` (with the error argument) so the stream emits `error` rather than `finish`, preventing the rename race:

```typescript
} catch (err) {
  writeStream.destroy(err as Error);   // emits "error", not "finish"
  reject(err);
}
```

---

### CR-03: Download timeout is cleared at the HTTP response-header phase, not the full body phase — large downloads can hang indefinitely

**File:** `src/tools/article-tools.ts:457-476`

`clearTimeout(timeoutId)` is called at line 476 immediately after `await fetchFn(...)` resolves — i.e., after the HTTP response headers arrive. The body stream is then consumed in the `for await` loop. For slow CDN sources, a server can send headers quickly and then stall the body transfer indefinitely. After line 476, the `AbortController` is no longer connected to any active timeout, so the `MAX_BYTES` guard is the only circuit breaker, and it only fires when data does arrive (not when it stalls).

For `fast_download` (8 s timeout) this is the most critical: a CDN that sends headers within 1 s but stalls the body will hold the connection open forever with no timeout.

**Fix:** Move `clearTimeout(timeoutId)` to after the stream is fully consumed — specifically to the `finally` block where the controller is unregistered:

```typescript
} finally {
  clearTimeout(timeoutId);                          // ← move here, was at line 476
  if (cdnState && source.type === "fast_download") {
    cdnState.abortMap.get(host)?.delete(controller);
  }
}
```

Remove the `clearTimeout(timeoutId)` at line 476. The controller's `abort()` call fires after `timeoutMs` regardless — if headers arrive the timeout still ticks, and `controller.signal` is connected to the `fetchFn` call so any mid-body stall will abort the stream read.

---

## Warnings

### WR-01: `fetchCallCount` test assertion is dead code — the CDN-no-fetch assertion is never made

**File:** `tests/article-tools.test.ts:295-327`

The test "returns cached file path without fetching file when DOI was previously downloaded" declares `fetchCallCount` and `fetchedUrls` variables but the only assertion is `expect(fetchCallCount).toBeGreaterThan(0)` — a trivially-true assertion that fires whether or not the CDN was fetched. The comment on line 319 says "The important assertion: no fetch to download.example CDN" but no such assertion exists. The `fetchedUrls` array (line 321) is never populated or asserted. If the caching logic broke and the CDN was actually fetched, the mock would throw (`Unexpected URL`), causing the test to fail with an error rather than a clean assertion failure. This does not catch regressions cleanly.

**Fix:**
```typescript
// Remove fetchCallCount and fetchedUrls; track CDN calls directly
let cdnFetched = false;
const fetchMock: FetchLike = async (input) => {
  const url = String(input);
  if (url.includes("download.example")) {
    cdnFetched = true;                        // ← explicit tracking
    throw new Error("CDN should not be called on cache hit");
  }
  // … rest of mock unchanged
};
// After handleArticleDownload:
expect(cdnFetched).toBe(false);
```

---

### WR-02: `response.body as any` suppresses async-iterator type safety

**File:** `src/tools/article-tools.ts:518`

```typescript
for await (const chunk of response.body as any) {
```

`ReadableStream` is not `AsyncIterable` in the Fetch API spec; Node.js 18+ exposes `Symbol.asyncIterator` on `ReadableStream`, but this is a Node.js-specific extension. If the runtime's `Response.body` doesn't implement `AsyncIterator` the error will be `TypeError: response.body is not async iterable`, surfacing at runtime rather than compile time. The cast also hides any future type regression.

**Fix:** Assert the correct type or use a helper that's explicit about the Node.js assumption:
```typescript
const body = response.body as unknown as AsyncIterable<Uint8Array>;
for await (const chunk of body) {
```
And add a comment: `// Node.js 18+ exposes ReadableStream as AsyncIterable<Uint8Array>`.

---

### WR-03: `rediscoveryFailed` flag is set inside a `.catch()` continuation but checked synchronously before awaiting — timing gap under concurrent load

**File:** `src/tools/article-tools.ts:259-270`

```typescript
if (rediscoveryFailed) {
  throw new Error("Mirror re-discovery failed; cannot resolve remaining DOIs.");
}
if (!rediscoveryPromise) {
  rediscoveryPromise = manager.updateBaseUrl()
    .then(…)
    .catch((err) => {
      rediscoveryFailed = true;     // set in microtask
      throw err;
    });
}
const newBaseUrl = await rediscoveryPromise;
```

Between the `if (!rediscoveryPromise)` check and the `rediscoveryFailed = true` assignment, there is a microtask gap. If two `lookupOne` calls both fail `isLikelyOfflineBaseUrlError` at the same time:

1. Call A: `rediscoveryFailed === false`, `rediscoveryPromise === null` → creates promise, awaits it
2. Call B: `rediscoveryFailed === false`, `rediscoveryPromise !== null` → awaits existing promise
3. Promise rejects: `rediscoveryFailed = true`
4. Both A and B see the rejection from `await rediscoveryPromise` and throw

This is actually correct behaviour — both calls propagate the rejection. But any Call C that enters the function after steps 1–2 but before step 3 will reach `await rediscoveryPromise` and also receive the rejection directly, which is also correct. The `rediscoveryFailed` fast-path only saves the `await` for calls entering after step 3. There is no incorrectness, but the flag is providing an optimisation that only fires for calls that start after the rejection resolves — which in `Promise.allSettled` is nearly never, since all calls start at the same time. Document or remove the flag.

**Fix:** Either add a comment explaining the fast-path is for sequential/queued callers:
```typescript
// rediscoveryFailed is a fast-fail optimisation for callers queued AFTER the rejection settles.
// Concurrent callers will see the rejection directly via `await rediscoveryPromise`.
```
Or remove `rediscoveryFailed` entirely and rely on the promise rejection alone:
```typescript
if (!rediscoveryPromise) {
  rediscoveryPromise = manager.updateBaseUrl().then(() => manager.resolveBaseUrl());
}
const newBaseUrl = await rediscoveryPromise; // rejection propagates to all concurrent callers
```

---

### WR-04: `results` array may contain `undefined` slots — the filter comment says "should not occur in practice" but the condition is reachable

**File:** `src/tools/article-tools.ts:284-330`

```typescript
const results: (ArticleBatchResult | undefined)[] = new Array(args.dois.length);
```

A slot remains `undefined` if a DOI index is neither filled by the lookup-failure path (line 293) nor by the download path (lines 316/319) nor by the no-download path (line 325). This can happen if `resolvedItems` contains an entry but `downloadSettled[i]` doesn't have a corresponding settled item — e.g., if the `Promise.allSettled` for downloads returns fewer items than `resolvedItems`. In practice `resolvedItems.map(...)` produces the same length as `downloadSettled`, so slots always fill. But the `filter` at line 330 silently drops any gap:

```typescript
const orderedResults = results.filter((r): r is ArticleBatchResult => r !== undefined);
```

A bug elsewhere that creates a length mismatch would silently return fewer results than DOIs, with no indication of which DOI was dropped. The comment "should not occur in practice" confirms this is known undefined territory.

**Fix:** Replace the silent filter with an assertion or an explicit error entry:
```typescript
const orderedResults: ArticleBatchResult[] = results.map((r, i) => {
  if (r === undefined) {
    // Should never happen; guard against logic errors producing dropped slots
    return { doi: args.dois[i]!, error: "Internal error: result slot was not populated" };
  }
  return r;
});
```

---

### WR-05: CDN CB test (CB-04/05/06) does not assert that the denylist prevented a second CDN attempt for doi1

**File:** `tests/article-tools.test.ts:659-740`

The CB-04/05/06 test verifies `paper2CDNAttempted === true` (CDN was tried for doi2) and that both DOIs have `filePath` (fell back to scidb). It does not assert that doi1's CDN host was actually denylisted — only that doi1 eventually succeeded. A regression in `denylistHost` (e.g., the set is not checked) would not be caught: the test would still pass because doi1 falls back to scidb via normal error handling, not via the denylist path. The distinction between "skipped because denylisted" and "failed and retried" is not verified.

**Fix:** Add a minimal observable side-effect check. One way is to count CDN attempts per DOI:
```typescript
let doi1CdnAttempts = 0;
// In the CDN paper1 mock:
if (url === "https://cdn1.example.com/paper1.pdf") {
  doi1CdnAttempts++;
  throw new TypeError("fetch failed");
}
// After result assertions:
expect(doi1CdnAttempts).toBe(1); // CDN was attempted exactly once, not retried
```
Combined with `paper2CDNAttempted` this establishes both sides of the denylist behaviour.

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
