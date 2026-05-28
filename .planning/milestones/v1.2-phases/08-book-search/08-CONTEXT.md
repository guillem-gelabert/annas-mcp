# Phase 8: Book Search - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the `book_search` MCP tool: users can search Anna's Archive for books by title, author, ISBN, or keywords and receive structured results with full metadata (language, format, publisher, title, authors, size, MD5 hash, page URL). The tool uses `BaseUrlManager` with offline retry. Phase 8 is search-only — download is Phase 9.

</domain>

<decisions>
## Implementation Decisions

### Module File Structure
- **D-01:** New `src/anna/book-service.ts` — clean separation mirroring `article-service.ts`; do NOT extend `ArticleService`
- **D-02:** New `src/tools/book-tools.ts` — mirrors `article-tools.ts` structure; do NOT append to `article-tools.ts`
- **D-03:** Add `bookSearchUrl()` constructor to `src/anna/client.ts` alongside `articleSearchUrl()` and other URL helpers
- **D-04:** Extract `withResolvedBaseUrl` to a shared module in Phase 8 (do not wait for Phase 9 REF-01). Placement is at Claude's discretion.

### TypeScript Types and Zod Schemas
- **D-05:** Define `Book` interface in `src/anna/types.ts` alongside `Article` interface
- **D-06:** Define `bookSchema` and `bookSearchOutputSchema` in `src/tools/book-tools.ts` alongside the input schema (mirrors `articleSearchOutputSchema` placement)
- **D-07:** Use `pageUrl` field name (TypeScript camelCase) — not Go's `url` — for consistency with the `Article` type

### HTML Parsing
- **D-08:** Add standalone `parseBookSearchResults` function to `src/anna/parse.ts` — independent of `parseArticleSearchResults`, same file
- **D-09:** No format normalization — return the raw HTML string value for `format`; consistent with how article fields are returned
- **D-10:** Missing optional book fields (language, publisher, etc.) → `undefined` (not `""`) — consistent with `Article` type

### Claude's Discretion
- Exact placement of extracted `withResolvedBaseUrl` helper (suggested: `src/anna/tool-utils.ts` to keep `base-url-manager.ts` focused on URL discovery)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing implementation to mirror
- `src/tools/article-tools.ts` — Primary reference: MCP tool registration, input/output Zod schemas, `withResolvedBaseUrl` pattern, error handling
- `src/anna/article-service.ts` — Service layer pattern to mirror for BookService
- `src/anna/client.ts` — URL constructor pattern; add `bookSearchUrl` here
- `src/anna/parse.ts` — Parser pattern; add `parseBookSearchResults` here
- `src/anna/types.ts` — Type placement; add `Book` interface here

### Requirements
- `.planning/REQUIREMENTS.md` — BSRCH-01, BSRCH-02, BSRCH-03 are the acceptance criteria for this phase
- `.planning/research/GO-BOOK-TOOLS.md` — Go upstream book_search endpoint, HTML selector notes, Book struct definition

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BaseUrlManager` + `withResolvedBaseUrl` (currently in `article-tools.ts`): offline retry wrapper used by both article tools; book_search needs the same pattern
- `AnnasClient.fetchText()`: HTTP fetch with browser User-Agent + 20s timeout — reusable for book search HTML scraping
- `parseSize()`, `absoluteUrl()`, `parseHashFromHref()`, `ARTICLE_LINK_SELECTOR`: all in `parse.ts`, all reusable by book parser
- `fastDownloadUrl()` in `client.ts`: already handles the fast_download API call (relevant for Phase 9 but defined now)
- `cheerio` library: already installed and used for HTML parsing

### Established Patterns
- Search uses `GET /search?q={query}&content={type}` — book_search uses `content=book_any` (same endpoint, different param)
- Tools export: `handleBookSearch`, `registerBookTools`, input/output schemas — follow the same export shape as article-tools.ts
- `structuredContent` pattern: all tools return both `content[0].text` (JSON string) and `structuredContent` (Zod-typed object)
- Error handling: catch-all returns `textResult(error.message, true)`; empty results return early with a message string

### Integration Points
- `src/server.ts`: calls `registerArticleTools` and `registerBaseUrlTools`; add `registerBookTools` call here
- `ArticleToolDependencies` interface: book tools need an equivalent `BookToolDependencies` interface (config + fetchImpl + baseUrlManager)

</code_context>

<specifics>
## Specific Ideas

- The `withResolvedBaseUrl` extraction in Phase 8 means Phase 9 REF-01 scope narrows to file-utils only (`validateDownloadUrl`, `sanitizeFilename`, `safeJoinPath`)
- book_search URL: `${origin}/search?q=${encodeURIComponent(query)}&content=book_any` — confirmed from Go research

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 8-Book Search*
*Context gathered: 2026-05-19*
