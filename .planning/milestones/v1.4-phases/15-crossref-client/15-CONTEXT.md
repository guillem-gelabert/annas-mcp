# Phase 15: CrossRef Client - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

A standalone CrossRef fetch function that retrieves the canonical paper title for any DOI. Lives in `src/anna/crossref-client.ts` as a new isolated module with no dependencies on the existing Anna's Archive pipeline. Returns `string | null` — the `message.title[0]` value on success, `null` on any failure.

</domain>

<decisions>
## Implementation Decisions

### Module Structure
- File: `src/anna/crossref-client.ts` — mirrors `client.ts` naming convention
- Export: standalone async function `fetchCrossRefTitle(doi: string, fetchImpl?: FetchLike): Promise<string | null>`
- No new type exports — return type is `string | null`, no alias needed
- Test file: `tests/crossref-client.test.ts`

### Request Identity
- User-Agent: `annas-mcp-ts/1.4 (mailto:noreply@example.com)` — hardcoded constant
- Version string: hardcoded `annas-mcp-ts/1.4` (not read from package.json)
- Timeout: hardcoded `5000` ms constant via `AbortSignal.timeout(5000)`
- All failures return `null`: timeout, non-200 status, network error, parse error — no distinction

### Claude's Discretion
- Internal constant names (e.g., `CROSSREF_TIMEOUT_MS`, `CROSSREF_USER_AGENT`)
- URL construction: `https://api.crossref.org/works/${encodeURIComponent(doi)}`
- Whether to log anything on failure (prefer silent null return, consistent with codebase)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FetchLike` type in `src/anna/types.ts` — use for `fetchImpl` parameter
- `AbortSignal.timeout()` pattern used in `src/anna/base-url-manager.ts` (line 198) and `src/anna/client.ts` (line 98)
- `BROWSER_USER_AGENT` constant pattern in `src/anna/client.ts` — follow same approach for `CROSSREF_USER_AGENT`

### Established Patterns
- Injected `fetchImpl` with `fetch` as default: used in `AnnasClient`, `BaseUrlManager`, `ArticleService`, `BookService`
- Standalone function (not class): `fetchImpl` injection at function-call level, not constructor
- All network failures resolve silently — no throws, consistent with informational verification design

### Integration Points
- Phase 16 (Confidence Logic) will import `fetchCrossRefTitle` from `src/anna/crossref-client.ts`
- Phase 17 (Response Integration) consumes confidence logic output — this module is not touched again after Phase 15

</code_context>

<specifics>
## Specific Ideas

- CrossRef API endpoint: `https://api.crossref.org/works/{doi}` — extract `message.title[0]` from JSON response
- User-Agent exact string: `annas-mcp-ts/1.4 (mailto:noreply@example.com)` — CrossRef etiquette format

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
