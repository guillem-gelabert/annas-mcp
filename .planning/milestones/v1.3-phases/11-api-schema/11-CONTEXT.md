# Phase 11: API Schema - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `article_download` Zod schemas and handler to accept either `doi: string` (existing, single) or `dois: string[]` (new, batch) as mutually exclusive inputs. Existing single-DOI callers receive the identical response shape as today. New batch callers receive `{ results: [{ doi, article, sources, filePath?, error? }] }`. No new MCP tool is registered — tool count stays at 5.

</domain>

<decisions>
## Implementation Decisions

### Input Schema — Mutual Exclusion
- Use `doi?: string` (existing) + `dois?: string[]` (new) on the same `z.object()` with `.refine(exactly one must be provided)`
- Apply existing DOI regex (`/^10\.\d{4,}[^\s]*$/`) to each `dois` array element via `z.array(z.string().regex(...))`
- Minimum array length: `min(1)` only — no upper cap
- Refine error message: `"Provide either doi (single) or dois (array), not both"`

### Batch Output Shape
- Single-DOI response: unchanged `{ article, sources, filePath? }` — COMPAT-01 satisfied exactly
- Batch response top-level: `{ results: [BatchResult] }`
- Per-item `BatchResult` shape: `{ doi: string, article, sources, filePath?, error?: string }`
- `doi` is echoed in each result item so callers can match results to input DOIs

### Schema Exports and Handler Routing
- Keep existing `articleDownloadOutputSchema` unchanged (single path)
- Add new `articleBatchDownloadOutputSchema` covering the `{ results: [...] }` shape
- Export new `ArticleBatchResult` type from `article-tools.ts` for use in tests
- Handler routing: explicit `if ("dois" in args && args.dois)` → batch path, else → single path
- MCP `outputSchema` registration: keep registering `articleDownloadOutputSchema` (single); batch output typed via `CallToolResult` content field

### Claude's Discretion
- Internal schema for the `articleBatchResultSchema` item shape — can be defined locally or exported depending on what tests need
- Exact Zod chaining style for the refine (`.superRefine` vs `.refine`) — follow whichever produces the cleaner error message

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `articleDownloadInputSchema` (lines 48–62, article-tools.ts) — base schema to extend
- `articleDownloadOutputSchema` (lines 64–68) — keep unchanged for single path
- `handleArticleDownload` (line 120) — split into single/batch paths in this phase (batch execution added in Phase 12)
- `articleSchema`, `downloadSourceSchema` — reuse in batch result item schema

### Established Patterns
- All schemas use `z.object()` with optional fields and `.describe()` for MCP documentation
- No existing `.refine()`, `.superRefine()`, or `z.union()` in the codebase — this will be the first
- Output schemas are exported separately from handler functions
- `CallToolResult` with `structuredContent` field for structured MCP output

### Integration Points
- `registerArticleTools` (line 169) — where the `outputSchema` is wired; needs updating only if batch changes the registered schema
- `articleDownloadInputSchema` is imported and used in tests — schema change must not break existing test signatures

</code_context>

<specifics>
## Specific Ideas

- Test corpus available from conversation: 11 real DOIs to validate against Anna's Archive API once Phase 12 adds batch execution:
  10.1002/etc.5620131021, 10.1002/etc.5620130618, 10.1080/10643389.2012.671746, 10.1016/j.jclepro.2015.02.040, 10.1016/j.jclepro.2018.11.146, 10.1016/j.resconrec.2018.12.026, 10.3390/resources9030034, 10.1016/j.scitotenv.2022.155339, 10.3390/su15129478, 10.1016/j.jped.2024.10.008, 10.17159/sajs.2025/18211
- These are for integration testing in Phase 12/13 — Phase 11 tests should be unit tests only (schema validation)

</specifics>

<deferred>
## Deferred Ideas

- Streaming results via AsyncIterator or SSE — explicitly out of scope
- Per-item structured error `{ code, message }` — string error is sufficient for v1.3
- Max array length cap — deferred; no throttling needed for typical batch sizes
- `book_download` batch equivalent — follow-on milestone if pattern proves valuable

</deferred>
