# Phase 12: Batch Execution - Research

**Researched:** 2026-05-20
**Domain:** TypeScript async parallelism, Promise.allSettled, MCP tool handler refactoring
**Confidence:** HIGH

## Summary

Phase 12 replaces a one-line stub (`"batch not yet implemented"`) in `handleArticleDownload` with a two-stage parallel pipeline. The design is fully locked by CONTEXT.md: `Promise.allSettled()` for lookups then downloads, a pre-flight `resolveDownloadRoot` call, and per-item error isolation without ever setting `CallToolResult.isError`. All types, helpers, and schemas needed already exist from Phase 11.

The codebase is small and well-understood. No new packages are required. The only open question is how to handle `withResolvedBaseUrl` in the batch path — the single-DOI path uses it to get both a resolved URL and automatic mirror fallback, but the batch needs a shared `BaseUrlManager` instance, not one per DOI.

**Primary recommendation:** Refactor `handleArticleDownload` to delegate to `handleSingleArticleDownload` (extracted) or `handleBatchArticleDownload` (new), sharing one `BaseUrlManager` instance created once at the top. Use `Promise.allSettled` for both stages. No new dependencies.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Parallel DOI resolution | API / Backend (MCP handler) | — | All lookups happen inside the MCP server process, not browser |
| Per-item error isolation | API / Backend (MCP handler) | — | Handler assembles the result array; MCP client reads structured content |
| Download parallelism | API / Backend (MCP handler) | File System | saveArticleFile already handles write; batch just fans out calls |
| Cache pre-check (checkDownloadCache) | API / Backend (MCP handler) | File System | Checked per-DOI before deciding whether to call saveArticleFile |
| Download root validation | API / Backend (MCP handler) | — | resolveDownloadRoot called once as pre-flight |

## Standard Stack

### Core

No new packages. The implementation is pure TypeScript using built-in Promise APIs.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Promise.allSettled` | ES2020 built-in | Fan out N async calls; isolate failures | Native to Bun 1.x / Node 22; no dep needed |
| `zod/v4` | already in project | Input types already defined in Phase 11 | Project-standard schema library |

### Supporting (already in project)

| Asset | Location | Purpose |
|-------|----------|---------|
| `ArticleBatchResult` | `article-tools.ts:104` | Per-item result type (doi + article? + sources? + error?) |
| `articleBatchDownloadOutputSchema` | `article-tools.ts:100` | Output schema already exported |
| `ArticleToolDependencies` | `article-tools.ts:106` | Shared dep bag passed to all helpers |
| `saveArticleFile` | `article-tools.ts:244` | File write helper, reuse directly |
| `resolveDownloadRoot` | `file-utils.ts:3` | Pre-flight path validation |
| `checkDownloadCache` / `recordDownloadCache` | `file-utils.ts:110,132` | Cache lookup/record, same as single-DOI |
| `withResolvedBaseUrl` | `tool-utils.ts:10` | Mirror-aware service factory (see Pitfall 1 below) |
| `ArticleService.resolveArticleDownload` | `article-service.ts:72` | Per-DOI lookup to parallelize |
| `textResult` / `jsonText` | `article-tools.ts:112,119` | Response formatting helpers |
| `ArticleNotFoundError` | `article-service.ts:11` | Typed lookup failure; maps to per-item error string |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Promise.allSettled` | `Promise.all` | `Promise.all` short-circuits on first rejection — violates BATCH-03 |
| `Promise.allSettled` | `p-limit` / throttled queue | Adds a dependency; REQUIREMENTS.md explicitly states "unlimited parallelism is fine for typical batch sizes" |
| Two-stage pipeline | Interleaved lookup+download per DOI | Race conditions on cache; harder to reason about; not aligned with CONTEXT.md decisions |

**Installation:** No new packages required. [VERIFIED: codebase — no package.json changes needed]

## Package Legitimacy Audit

No external packages are introduced in this phase. This section is not applicable.

## Architecture Patterns

### System Architecture Diagram

```
handleArticleDownload(args, deps)
  |
  +--[doi present]---> handleSingleArticleDownload(args, deps)
  |                        (existing logic extracted verbatim)
  |
  +--[dois present]--> handleBatchArticleDownload(args, deps)
         |
         |-- 1. resolveDownloadRoot (pre-flight, once)
         |        throws -> return textResult(isError: true)
         |
         |-- 2. Create shared BaseUrlManager (once)
         |
         |-- 3. Stage 1: Promise.allSettled(
         |        dois.map(doi => resolveOneDoi(doi, manager, deps))
         |      )
         |        fulfilled -> ArticleDownloadResolution
         |        rejected  -> per-item error string
         |
         |-- 4. Stage 2 (if download: true):
         |        Promise.allSettled(
         |          resolvedItems.map(item => downloadOneArticle(item, effectivePath, deps))
         |        )
         |        fulfilled -> filePath string
         |        rejected  -> per-item error string (overrides; article data still included)
         |
         |-- 5. Assemble ArticleBatchResult[] array
         |        failed lookup  -> { doi, error }  (no article/sources)
         |        failed download-> { doi, article, sources, error }
         |        success        -> { doi, article, sources, filePath? }
         |
         v
     return { content: [jsonText(...)], structuredContent: { results } }
     isError: NEVER set (even on partial failure)
```

### Recommended Project Structure

No new files needed. All additions go into `src/tools/article-tools.ts`:

```
src/tools/article-tools.ts
  handleArticleDownload()         <- router only (2 branches)
  handleSingleArticleDownload()   <- extracted from current impl (private)
  handleBatchArticleDownload()    <- new (private)
  resolveOneDoi()                 <- inner helper (private)
  saveArticleFile()               <- unchanged
  downloadOneSource()             <- unchanged
```

### Pattern 1: Two-Stage Promise.allSettled Pipeline

**What:** Fan out all DOI lookups in parallel; after all settle, fan out downloads for the resolved subset.
**When to use:** When failures must be isolated per-item and partial success must be preserved.

```typescript
// [ASSUMED] — illustrative; exact variable names are Claude's discretion per CONTEXT.md

async function handleBatchArticleDownload(
  args: { dois: string[]; download?: boolean; downloadPath?: string },
  deps: ArticleToolDependencies,
): Promise<CallToolResult> {
  // Pre-flight: validate download path once
  let effectivePath: string | undefined;
  if (args.download) {
    try {
      effectivePath = resolveDownloadRoot(deps.config.downloadPath, args.downloadPath);
    } catch (error) {
      return textResult(error instanceof Error ? error.message : "Invalid download path", true);
    }
  }

  // Shared manager — one BaseUrlManager for the whole batch
  const manager = deps.baseUrlManager ?? new BaseUrlManager(deps.config, deps.fetchImpl);

  // Stage 1: parallel lookups
  const lookupResults = await Promise.allSettled(
    args.dois.map((doi) => resolveOneDoi(doi, manager, deps)),
  );

  // Stage 2: parallel downloads for resolved items
  const results: ArticleBatchResult[] = await Promise.allSettled(
    // ... map settled results to download calls
  ).then(...);

  return {
    content: [{ type: "text", text: jsonText({ results }) }],
    structuredContent: { results },
  };
}
```

### Pattern 2: Per-Item Error Shape Discipline

**What:** Distinguish failed-lookup shape (doi + error only) from failed-download shape (doi + article + sources + error).
**Why:** CONTEXT.md decision: omit `article` and `sources` for items where the DOI lookup itself failed. For download failures the article data IS present — the file write failed, not the lookup.

```typescript
// Lookup failure: minimal shape
{ doi: "10.xxx/yyy", error: "No article found for DOI: 10.xxx/yyy" }

// Download failure: article data present, error added
{ doi: "10.xxx/yyy", article: {...}, sources: [...], error: "All download sources failed: ..." }

// Success (no download)
{ doi: "10.xxx/yyy", article: {...}, sources: [...] }

// Success (with download)
{ doi: "10.xxx/yyy", article: {...}, sources: [...], filePath: "/path/to/paper.pdf" }
```

### Pattern 3: withResolvedBaseUrl in Batch Context

**What:** `withResolvedBaseUrl` wraps a single service call with mirror-fallback logic. In the batch, calling it once per DOI is fine — they all share the same `BaseUrlManager` instance, which caches the resolved URL internally.

**Correct approach:** Create one `BaseUrlManager` before the `Promise.allSettled`, pass it to each DOI's lookup. The manager's internal cache means only the first call hits the filesystem or network; subsequent calls return the cached URL. Mirror fallback (re-discovery) is invoked per call if needed, but the Phase 13 circuit breaker concern is explicitly out of scope here.

```typescript
// Each DOI lookup can safely call withResolvedBaseUrl with the shared manager
const { results: resolution } = await withResolvedBaseUrl(
  deps,
  manager,           // shared instance — url is cached after first resolution
  (cfg, fi) => new ArticleService(cfg, fi),
  (service) => service.resolveArticleDownload(doi),
);
```

[VERIFIED: codebase — BaseUrlManager.resolveBaseUrl() at base-url-manager.ts reads from disk cache; multiple calls in a process are cheap]

### Anti-Patterns to Avoid

- **Creating a new `BaseUrlManager` per DOI inside `Promise.allSettled`:** Each instance would independently resolve the mirror URL, causing redundant disk reads and potential race conditions on cache writes. Create once, share.
- **Setting `isError: true` on partial failures:** CONTEXT.md explicitly prohibits this. Only set `isError: true` if the entire batch fails (e.g., invalid download path pre-flight).
- **Running downloads before all lookups settle:** The two-stage pipeline is mandatory. Do not interleave.
- **Calling `resolveDownloadRoot` inside each DOI's download promise:** Same path applies to all; call once before the fan-out.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parallel execution with failure isolation | Custom settled-results tracker | `Promise.allSettled()` | Built-in, handles rejection isolation exactly per BATCH-03 |
| File download with fallback | Custom retry loop | Existing `saveArticleFile` | Already handles source fallback, magic bytes check, temp file, rename-on-complete |
| Download path validation | Path checks inline | `resolveDownloadRoot` | Already handles absolute path requirement, containment check |
| Cache lookup | Manual JSON read per DOI | `checkDownloadCache` / `recordDownloadCache` | Thread-safe enough for this use case; reuse established pattern |

**Key insight:** Phase 12 is almost entirely orchestration. The hard problems (file download, path safety, cache, mirror resilience) are already solved. The batch layer is glue code only.

## Common Pitfalls

### Pitfall 1: BaseUrlManager Shared State vs. Per-Call Isolation
**What goes wrong:** Creating a fresh `BaseUrlManager` inside each DOI's lookup lambda. Each instance resolves the URL independently — N disk reads, potential concurrent writes to the cache file.
**Why it happens:** Copy-paste from the single-DOI path where a new manager is created at handler entry.
**How to avoid:** Create the manager once before `Promise.allSettled` in `handleBatchArticleDownload`, same as for single-DOI but hoisted above the fan-out.
**Warning signs:** Tests that mock `BaseUrlManager` see it constructed N times instead of once.

### Pitfall 2: Test for Stub Must Be Updated
**What goes wrong:** The test `"batch stub returns non-error result for dois input"` (article-tools.test.ts:373) asserts `result.content[0].text === "batch not yet implemented"`. After Phase 12, this test fails because the stub is replaced.
**Why it happens:** The stub test was written for Phase 11 only.
**How to avoid:** Replace the stub test with proper batch behavior tests. Don't try to keep the stub test green — it documents behavior that Phase 12 intentionally removes.
**Warning signs:** If this test passes after implementation, the batch path is not being reached.

### Pitfall 3: `ArticleBatchResult` Schema Allows Both `article` and `error`
**What goes wrong:** The zod schema at `article-tools.ts:92` has both `article` and `error` as optional. This is correct for download-failure items (article data present + error). But lookup-failure items must NOT include `article` or `sources` — the schema doesn't enforce this constraint; the handler must.
**Why it happens:** Zod marks both optional; it will happily accept either shape.
**How to avoid:** Assemble the result object explicitly — for lookup failures, only spread `{ doi, error }`. For download failures, spread `{ doi, ...resolution.article, sources, error }`.
**Warning signs:** A test asserting lookup-failure response has no `article` key passes incorrectly because the handler accidentally includes an empty article object.

### Pitfall 4: Cache Race in Concurrent Downloads
**What goes wrong:** Two DOIs in the same batch resolve to the same article (same hash, different DOIs). Both cache checks return null; both write the file; second write shadows first; cache records last one only.
**Why it happens:** `checkDownloadCache` / `recordDownloadCache` reads then writes a JSON file without a lock. Concurrent `Promise.allSettled` downloads can interleave the read-write.
**Why it's acceptable:** In practice, duplicate DOIs in one batch are rare. The file write is atomic (tmp → rename). The worst case is two files for the same content, and the cache records one path. No data loss; no corruption.
**How to avoid if needed:** Deduplicate by DOI before the fan-out. (Not required for this phase — just document the behavior.)
**Warning signs:** Tests with duplicate DOIs in the same batch see non-deterministic file counts.

### Pitfall 5: `ArticleNotFoundError` vs. Generic Error in Per-Item Error Message
**What goes wrong:** Wrapping `Promise.allSettled` rejections without checking error type. `ArticleNotFoundError` has a user-friendly message ("No article found for DOI: ..."). Generic network errors may have internal detail or be too terse.
**Why it happens:** `allSettled` puts any rejection in `reason` — easy to just do `String(reason)`.
**How to avoid:** Check `error instanceof Error ? error.message : String(error)` — consistent with the existing single-DOI error handling pattern throughout the file.

## Code Examples

### Example: Assembling per-item results from Promise.allSettled

```typescript
// [ASSUMED] — illustrative pattern; exact form is Claude's discretion

const lookupSettled = await Promise.allSettled(
  args.dois.map((doi) =>
    withResolvedBaseUrl(
      deps,
      manager,
      (cfg, fi) => new ArticleService(cfg, fi),
      (service) => service.resolveArticleDownload(doi),
    ).then((r) => ({ doi, resolution: r.results })),
  ),
);

// Map settled results to intermediate typed objects
const resolved: Array<{ doi: string; resolution: ArticleDownloadResolution }> = [];
const initialResults: ArticleBatchResult[] = [];

for (let i = 0; i < args.dois.length; i++) {
  const doi = args.dois[i];
  const settled = lookupSettled[i];
  if (settled.status === "fulfilled") {
    resolved.push({ doi, resolution: settled.value.resolution });
  } else {
    const msg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
    initialResults.push({ doi, error: msg }); // no article, no sources — per CONTEXT.md
  }
}
```

### Example: Existing test pattern to follow for batch tests

The existing tests in `article-tools.test.ts` establish the mock pattern:

```typescript
// Pattern: URL-routing fetchMock
const fetchMock: FetchLike = async (input) => {
  const url = String(input);
  if (url.includes("/scidb/")) return response(scidbHtml);
  if (url.includes("/md5/")) return response(detailHtml);
  if (url.includes("/dyn/api/fast_download.json")) return Response.json({ download_url: "https://cdn.example/paper.pdf" });
  throw new Error(`Unexpected URL: ${url}`);
};
```

For batch parallelism tests, the same pattern extends to multiple DOIs. To assert concurrent execution, use a counter tracking in-flight calls:

```typescript
// [ASSUMED] — verify pattern works with Bun test runner
let inFlight = 0;
let maxConcurrent = 0;
const fetchMock: FetchLike = async (input) => {
  inFlight++;
  maxConcurrent = Math.max(maxConcurrent, inFlight);
  await Promise.resolve(); // yield to let other promises start
  inFlight--;
  // ... return appropriate response
};
// After: expect(maxConcurrent).toBeGreaterThan(1)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sequential per-DOI loop | `Promise.allSettled` fan-out | Phase 12 (this phase) | All N lookups start simultaneously |
| Stub returning "not yet implemented" | Real batch handler | Phase 12 (this phase) | BATCH-01, BATCH-02, BATCH-03 satisfied |

**Deprecated/outdated:**
- The stub `return { content: [{ type: "text", text: "batch not yet implemented" }] }` at `article-tools.ts:162` — this is the sole target of this phase.
- The test `"batch stub returns non-error result for dois input"` (line 373) — documents stub behavior; must be replaced with real behavior tests.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `withResolvedBaseUrl` called once per DOI inside `Promise.allSettled` with a shared `BaseUrlManager` is safe — the manager's URL cache prevents redundant disk reads | Architecture Patterns: Pattern 3 | If BaseUrlManager is not safe for concurrent callers, lookups could race on cache writes. Mitigation: resolve URL once before the fan-out and pass the resolved URL directly. |
| A2 | The test for concurrency (tracking in-flight count via counter + `Promise.resolve()` yield) works as expected in Bun's test runner | Code Examples | If Bun doesn't yield on `Promise.resolve()` in this context, the concurrency assertion may be unreliable. Mitigation: test is informative, not blocking — structural correctness (allSettled used) is verifiable by code review. |
| A3 | Cache write collisions on duplicate DOIs in the same batch produce no data loss (file rename is atomic; JSON cache records last writer) | Common Pitfalls: Pitfall 4 | If the filesystem is not atomic for rename on the test platform, two concurrent writes to the same path could corrupt a file. Risk is very low on macOS/Linux with Bun. |

**If this table is empty:** It is not empty — 3 assumptions flagged above.

## Open Questions

1. **How should `withResolvedBaseUrl`'s mirror-fallback interact with concurrent batch calls?**
   - What we know: Each `withResolvedBaseUrl` call will attempt mirror re-discovery independently if it encounters an offline-URL error. With N concurrent DOI lookups, this could trigger N re-discovery attempts.
   - What's unclear: Whether this causes actual problems in Phase 12, or whether it's the Phase 13 circuit breaker concern.
   - Recommendation: Accept the naive behavior in Phase 12 — multiple re-discovery attempts are wasteful but not incorrect. Phase 13 adds the circuit breaker to prevent this. Alternatively, resolve the base URL once before the fan-out (call `manager.resolveBaseUrl()` eagerly) and reuse the result — this avoids the race entirely.

2. **Should the batch path use `withResolvedBaseUrl` at all, or construct `ArticleService` directly?**
   - What we know: The single-DOI path uses `withResolvedBaseUrl` for mirror fallback. The batch path could construct the service directly with the pre-resolved URL.
   - What's unclear: Whether losing per-DOI mirror fallback is acceptable in Phase 12.
   - Recommendation: Keep `withResolvedBaseUrl` per DOI for now — consistent behavior with single-DOI path. Phase 13 will refactor the mirror-fallback layer for batch anyway.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. This phase adds no new tools, services, CLIs, runtimes, databases, or external APIs. All dependencies are already installed and confirmed working (Bun 1.3.14, Node 22.20.0, existing test suite passes: 17/17).

## Validation Architecture

`nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is skipped per config.

## Security Domain

This phase introduces no new authentication, session handling, access control, cryptography, or network endpoints. The existing security controls (HTTPS-only download URLs, private IP rejection in `validateDownloadUrl`, path containment in `safeJoinPath`, magic bytes PDF check) are all in `saveArticleFile` and `file-utils.ts` — they are reused unchanged. No new ASVS categories are introduced.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase] `src/tools/article-tools.ts` — full source read; stub location confirmed at line 161-163
- [VERIFIED: codebase] `src/anna/article-service.ts` — `resolveArticleDownload` signature and implementation
- [VERIFIED: codebase] `src/anna/file-utils.ts` — `resolveDownloadRoot`, `checkDownloadCache`, `recordDownloadCache` signatures
- [VERIFIED: codebase] `tests/article-tools.test.ts` — existing test patterns; stub test at line 373 confirmed
- [VERIFIED: codebase] `src/anna/tool-utils.ts` — `withResolvedBaseUrl` implementation
- [VERIFIED: codebase] `.planning/phases/12-batch-execution/12-CONTEXT.md` — all design decisions locked
- [VERIFIED: codebase] `.planning/REQUIREMENTS.md` — BATCH-01, BATCH-02, BATCH-03 scope

### Secondary (MEDIUM confidence)
- MDN Web Docs — `Promise.allSettled` is ES2020, available in all modern JS runtimes including Bun 1.x

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing assets verified in codebase
- Architecture: HIGH — locked by CONTEXT.md; pattern is straightforward `Promise.allSettled`
- Pitfalls: HIGH — derived from direct codebase reading plus known JS async patterns
- Test patterns: HIGH — existing tests read directly; Bun concurrency assertion is ASSUMED

**Research date:** 2026-05-20
**Valid until:** Stable — this is a closed codebase with locked design; valid for the duration of Phase 12 execution
