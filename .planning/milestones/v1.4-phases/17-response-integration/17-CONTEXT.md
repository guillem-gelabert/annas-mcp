# Phase 17: Response Integration - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning
**Source:** Autonomous discuss (derived from ROADMAP + codebase analysis)

<domain>
## Phase Boundary

Wire `fetchCrossRefTitle` (Phase 15) and `computeConfidence` (Phase 16) into both the single-DOI and batch `article_download` handlers in `src/tools/article-tools.ts`. Add a `verification` object to every `article_download` response. No existing fields change. CrossRef failures produce `confidence: "unverified"` and never block sources.

</domain>

<decisions>
## Implementation Decisions

### Response Shape
- New field: `verification: { crossrefTitle: string | null, annasTitle: string | null, confidence: ConfidenceLevel }` — added to both single-DOI result and each per-article batch result
- `annasTitle` = `resolution.article.title ?? null`
- `crossrefTitle` = result of `fetchCrossRefTitle(doi)` — or `null` on any failure
- `confidence` = result of `computeConfidence(annasTitle ?? "", crossrefTitle)` — but if `annasTitle` is null, passes `""` to normalization (result is `"unverified"` if crossrefTitle is also null, or `"low"` if crossrefTitle has words)
- The `verification` field must always be present (never omitted), even on CrossRef failure

### Parallelism
- Single-DOI: run `fetchCrossRefTitle(doi)` in parallel with the Anna's Archive lookup (`Promise.all`)
- Batch: run `fetchCrossRefTitle(doi)` in parallel with each Anna's Archive lookup per DOI (add to `lookupOne`, or run a second parallel sweep after lookups settle)
- Preferred: run CrossRef in parallel with Anna's Archive per DOI — both fire simultaneously in `lookupOne`, CrossRef result used to build `verification` after both settle

### Error Handling (graceful degradation — VER-09)
- Wrap `fetchCrossRefTitle` in a try/catch in the handler layer; on any rejection → `crossrefTitle = null`
- Since `fetchCrossRefTitle` already swallows TimeoutError and TypeError, unexpected errors (re-thrown from Phase 15 WR-02 fix) must be caught here too
- Result: CrossRef can never cause `article_download` to fail

### Schema Changes
- Add `verificationSchema` Zod object to `article-tools.ts`:
  ```ts
  const verificationSchema = z.object({
    crossrefTitle: z.string().nullable(),
    annasTitle: z.string().nullable(),
    confidence: z.enum(["high", "low", "unverified"]),
  });
  ```
- Update `articleDownloadOutputSchema` to add `.verification` (required)
- Update `articleBatchResultSchema` to add `.verification` (optional — error results may omit it)
- **Do NOT remove or rename any existing fields** — additive only (VER-10)

### Batch Verification Shape
- Successful batch results: include `verification`
- Failed batch results (error field set): omit `verification` — only `{ doi, error }` for failed items
- This matches the existing pattern: failed items already omit `article` and `sources`

### FetchImpl Threading
- `fetchCrossRefTitle` already accepts an optional `fetchImpl` parameter
- Pass `dependencies.fetchImpl` to `fetchCrossRefTitle` for consistent mocking in tests
- `fetchImpl` in `ArticleToolDependencies` is already `FetchLike` — same type

### Claude's Discretion
- Whether to extract a helper function (e.g., `buildVerification`) for DRY across single/batch paths
- Internal variable names
- Whether `annasTitle` defaults to `""` or `null` when `article.title` is undefined (use `null` externally, `""` when calling computeConfidence)

</decisions>

<code_context>
## Existing Code Insights

### Files to Modify
- `src/tools/article-tools.ts` — add `verificationSchema`, update `articleDownloadOutputSchema` and `articleBatchResultSchema`, wire CrossRef in `handleSingleArticleDownload` and `handleBatchArticleDownload`

### Files to Import From
- `src/anna/crossref-client.ts` — `fetchCrossRefTitle(doi, fetchImpl)`
- `src/anna/confidence.ts` — `computeConfidence(annasTitle, crossrefTitle)`, `ConfidenceLevel`

### Key Constraints (from codebase)
- `ArticleToolDependencies.fetchImpl` is already `FetchLike | undefined` — no interface change needed
- Batch handler uses `rediscoveryPromise` for CB deduplication — CrossRef is independent and does not touch CB state
- `ArticleBatchResult` is exported as a type — updating its Zod schema updates the type via `z.infer`

### Test File
- `tests/article-tools.test.ts` — add verification field assertions; mock `fetchCrossRefTitle`
- Existing 99 tests must all continue to pass (VER-11)
- New tests inject a mock fetchImpl that returns a CrossRef-shaped response

</code_context>

<specifics>
## Specific Ideas

- Run CrossRef in parallel with Anna's Archive per DOI:
  ```ts
  const [resolution, crossrefTitle] = await Promise.all([
    service.resolveArticleDownload(doi),
    fetchCrossRefTitle(doi, fetchImpl).catch(() => null),
  ]);
  ```
- Build verification:
  ```ts
  const annasTitle = resolution.article.title ?? null;
  const verification = {
    crossrefTitle,
    annasTitle,
    confidence: computeConfidence(annasTitle ?? "", crossrefTitle),
  };
  ```

</specifics>

<deferred>
## Deferred Ideas

- Configurable CrossRef timeout (deferred per STATE.md)
- Stop-word filtering for Jaccard (not required)
- Caching CrossRef results (not in v1.4 scope)

</deferred>

---

*Phase: 17-response-integration*
*Context gathered: 2026-05-27 — autonomous discuss from ROADMAP + codebase*
