# Phase 9: Book Download - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the `book_download` MCP tool: given an MD5 hash (from book_search), return the fast_download URL for the book and optionally save the file to disk. Simultaneously, extract shared security utilities (`validateDownloadUrl`, `sanitizeFilename`, `safeJoinPath`, `getFileExtension`) to `src/anna/file-utils.ts` so they are importable by both article and book tools without duplication.

No SciDB fallback for books — fast_download only. Extension derived from the book's format field (e.g., "EPUB" → ".epub"), not from HTTP headers. Magic bytes check is NOT applied (multi-format: EPUB, DJVU, MOBI, etc.).

</domain>

<decisions>
## Implementation Decisions

### Module File Structure
- **D-01:** `book_download` handler and registration go in existing `src/tools/book-tools.ts` alongside `book_search` — mirrors how `article_search` and `article_download` both live in `article-tools.ts`
- **D-02:** New `src/anna/file-utils.ts` — extract `validateDownloadUrl`, `sanitizeFilename`, `safeJoinPath`, `getFileExtension` from `article-tools.ts`; both `article-tools.ts` and `book-tools.ts` import from here
- **D-03:** `BookService.resolveBookDownload(hash: string): Promise<BookDownloadResolution>` added to `src/anna/book-service.ts` — calls fast_download API and returns `{ book, fastDownloadUrl }`
- **D-04:** `book_download` input takes `hash` (required), `title` (optional, for filename), `format` (optional, for extension), `download?: boolean`, `downloadPath?: string` — caller passes title/format from prior `book_search` result (matches Go approach)

### TypeScript Types and Zod Schemas
- **D-05:** Add `BookDownloadResolution` interface to `src/anna/types.ts`: `{ book: Book; fastDownloadUrl: string; }`
- **D-06:** `bookDownloadInputSchema` exported from `book-tools.ts`: `{ hash: z.string().trim().min(1), title?: z.string(), format?: z.string(), download?: z.boolean(), downloadPath?: z.string() }`
- **D-07:** `bookDownloadOutputSchema` exported from `book-tools.ts`: `{ book: bookSchema, fastDownloadUrl: z.string(), filePath: z.string().optional() }`

### Download Logic
- **D-08:** No SciDB fallback — fast_download only. If fast_download returns error or empty URL, return MCP error
- **D-09:** File extension = `format` input (if provided) lowercased with leading dot (e.g., "EPUB" → ".epub"); fallback to ".bin" if format is absent/unrecognized
- **D-10:** No magic bytes validation — books are multi-format (EPUB, DJVU, MOBI, etc.); content-type HTML check STILL applies (detect login redirect / error pages)
- **D-11:** Download timeout: 30 seconds (books have no long-running SciDB path — single source)
- **D-12:** 100 MB cap retained (same as article download)
- **D-13:** `saveBookFile` private function in `book-tools.ts` — analogous to `saveArticleFile` but without magic bytes check and with format-based extension

### REF-01 File Utils Extraction
- **D-14:** `src/anna/file-utils.ts` exports: `validateDownloadUrl`, `sanitizeFilename`, `safeJoinPath`, `getFileExtension`
- **D-15:** `article-tools.ts` updated to import these four functions from `"../anna/file-utils"` instead of defining them locally; local definitions deleted
- **D-16:** `book-tools.ts` imports the same four from `"../anna/file-utils"` — no duplication of security-critical code

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing implementation to extend
- `src/tools/article-tools.ts` — Primary reference: `saveArticleFile`, `validateDownloadUrl`, `sanitizeFilename`, `safeJoinPath`, `getFileExtension` to extract; `handleArticleDownload` pattern to mirror for `handleBookDownload`
- `src/tools/book-tools.ts` — Target file: add `handleBookDownload`, `registerBookTools` update, `saveBookFile`, input/output schemas
- `src/anna/book-service.ts` — Add `resolveBookDownload` method
- `src/anna/types.ts` — Add `BookDownloadResolution` interface
- `src/anna/client.ts` — `fastDownloadUrl` and `fetchFastDownload` already exist; reuse for books
- `src/anna/file-utils.ts` — NEW file; receives extracted functions from article-tools.ts

### Requirements
- `.planning/REQUIREMENTS.md` — REF-01, BDWN-01 through BDWN-05 are the acceptance criteria for this phase
- `.planning/research/GO-BOOK-TOOLS.md` — Go book_download two-step API, format/extension handling, no-SciDB note

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AnnasClient.fetchFastDownload(hash)` — already calls `/dyn/api/fast_download.json`; reuse directly for books
- `fastDownloadUrl(config, hash)` — URL builder already in `client.ts`
- `validateDownloadUrl`, `sanitizeFilename`, `safeJoinPath`, `getFileExtension` — currently private in `article-tools.ts` lines ~192–256; moving to `file-utils.ts`
- `saveArticleFile` in `article-tools.ts` — template for `saveBookFile`; differences: no PDF magic bytes check, format-based extension instead of content-disposition-based

### Established Patterns
- `handleArticleDownload` pattern: resolve metadata → if `download: true`, call save function → return structuredContent
- `structuredContent` always returned even when `filePath` is undefined
- Error handling: `ArticleNotFoundError` check before catch-all; book equivalent: no `BookNotFoundError` needed (hash is direct input, no lookup)
- Zod import: `import * as z from "zod/v4"` — project standard

### Integration Points
- `src/server.ts`: `registerBookTools` already wired; Phase 9 only adds a new tool registered inside the same `registerBookTools` function call (or as a second `server.registerTool` call)
- `src/tools/article-tools.ts`: imports will change from local definitions to `"../anna/file-utils"` imports

</code_context>

<specifics>
## Specific Ideas

- `resolveBookDownload` in BookService: call `this.client.fetchFastDownload(hash)`, check `data.download_url`, return `{ book: { hash }, fastDownloadUrl: data.download_url }`
- `saveBookFile` signature: `(fastDownloadUrl: string, title: string, format: string, downloadPath: string, fetchImpl?: FetchLike): Promise<string>`
- Extension helper (inline in book-tools.ts or in file-utils.ts): `format.toLowerCase().replace(/^\.?/, '.')` with fallback `.bin`

</specifics>

<deferred>
## Deferred Ideas

- BDWN-EXT-01: SciDB fallback for books — explicitly out of scope
- Magic bytes check for specific formats (EPUB zip magic, etc.) — out of scope for v1.2

</deferred>

---

*Phase: 9-Book Download*
*Context gathered: 2026-05-19*
