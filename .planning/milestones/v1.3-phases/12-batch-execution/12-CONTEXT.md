# Phase 12: Batch Execution - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the batch execution path inside `handleArticleDownload`: replace the "batch not yet implemented" stub with parallel resolution and download. All DOIs in the `dois` array are looked up concurrently; downloads (when `download: true`) run in parallel after lookups settle. Each result carries its own success or error state so one failure never suppresses the rest.

</domain>

<decisions>
## Implementation Decisions

### Parallel Execution Structure
- Use `Promise.allSettled()` for parallel DOI lookups — isolates per-article failures per BATCH-03
- Two-stage pipeline: all lookups `Promise.allSettled()` first, then downloads `Promise.allSettled()` for resolved articles
- `resolveDownloadRoot` called once as a pre-flight before parallel lookups — same path applies to all articles; fail entire batch early if the path is invalid

### Error Isolation in Response
- Failed DOI result shape: omit `article` and `sources` — only `doi` and `error` fields present for failed items
- Never set `CallToolResult.isError: true` for partial failures — per-item `error` field carries the state; caller inspects the array
- Per-article download failures (`saveArticleFile` throws) are captured as per-item `error` — other articles still return their results

### Handler Refactoring
- Extract single-DOI path to a named private `handleSingleArticleDownload(args, deps)` helper for readability
- Batch orchestration in a private `handleBatchArticleDownload(args, deps)` function in the same file (testable in isolation)
- Reuse existing `saveArticleFile` for batch downloads — already in scope, no changes needed

### Claude's Discretion
- Exact internal variable naming and promise chain structure within the batch helper
- Whether to pass the pre-resolved `effectivePath` into the batch helper or resolve it inside the helper

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleArticleDownload` (article-tools.ts:156) — entry point; currently contains the "batch not yet implemented" stub at line 161–163
- `saveArticleFile` (article-tools.ts:244) — private helper; reuse directly for per-article file writes
- `checkDownloadCache` / `recordDownloadCache` (file-utils.ts) — same cache pattern as single-DOI path
- `resolveDownloadRoot` (file-utils.ts) — call once before batch, not per-article
- `withResolvedBaseUrl` (tool-utils.ts) — used by the existing single-DOI path; available for batch but each article lookup is independent
- `ArticleBatchResult` type + `articleBatchDownloadOutputSchema` — already exported from article-tools.ts (Phase 11)
- `ArticleService.resolveArticleDownload(doi)` — the per-DOI lookup to parallelize

### Established Patterns
- All handler helpers use `ArticleToolDependencies` as the second argument
- `textResult(msg, isError)` helper for error responses
- `jsonText(value)` for structured JSON text content
- `BaseUrlManager` created once and shared across a handler call

### Integration Points
- `handleArticleDownload` routes to the batch helper when `"dois" in args && args.dois`
- `registerArticleTools` wires the handler — no changes needed to registration
- `article-tools.test.ts` imports `handleArticleDownload` — existing tests must remain green

</code_context>

<specifics>
## Specific Ideas

- Test corpus of 11 real DOIs available for integration testing (from Phase 11 context) — use these for manual smoke testing, not automated unit tests
- Unit test approach: mock `fetchImpl` with controlled timing; assert all lookup calls start before any resolve (proves parallelism)
- Error isolation test: 3 DOIs — 1 failing to resolve, 2 succeeding — verifies both error capture and success alongside failure

</specifics>

<deferred>
## Deferred Ideas

- Streaming results via AsyncIterator as each DOI resolves — explicitly out of scope
- Configurable concurrency limits — out of scope per REQUIREMENTS.md
- Circuit breakers (base_url and CDN denylist) — Phase 13

</deferred>
