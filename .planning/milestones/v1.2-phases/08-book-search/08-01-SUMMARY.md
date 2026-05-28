---
phase: "08"
plan: "01"
subsystem: anna-core
tags: [book-search, types, parser, service, refactor]
dependency_graph:
  requires: []
  provides:
    - src/anna/types.ts#Book
    - src/anna/client.ts#bookSearchUrl
    - src/anna/client.ts#AnnasClient.getBookSearchUrl
    - src/anna/tool-utils.ts#withResolvedBaseUrl
    - src/anna/tool-utils.ts#WithBaseUrlDeps
    - src/anna/parse.ts#parseBookSearchResults
    - src/anna/book-service.ts#BookService
    - src/anna/book-service.ts#BookNotFoundError
  affects:
    - src/tools/article-tools.ts (imports withResolvedBaseUrl from tool-utils.ts)
tech_stack:
  added: []
  patterns:
    - Mirror ArticleService with BookService (D-01)
    - Generic withResolvedBaseUrl<S, T> for shared offline retry (D-04)
    - || undefined for optional cheerio text fields (D-10)
    - Raw format string without normalization (D-09)
key_files:
  created:
    - src/anna/tool-utils.ts
    - src/anna/book-service.ts
  modified:
    - src/anna/types.ts
    - src/anna/client.ts
    - src/anna/parse.ts
    - src/tools/article-tools.ts
decisions:
  - "Placed withResolvedBaseUrl in src/anna/tool-utils.ts (Claude's discretion per CONTEXT.md D-04)"
  - "Updated article-tools.ts call sites to use 4-argument generic signature immediately (avoids stale local copy)"
metrics:
  duration_minutes: 5
  completed_date: "2026-05-19T14:23:33Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 4
---

# Phase 8 Plan 1: Book Foundation — Types, URL Builder, Parser, Service Summary

**One-liner:** Book data layer with generic `withResolvedBaseUrl<S,T>` extracted to `tool-utils.ts`, `Book` interface, `bookSearchUrl` using `content=book_any`, `parseBookSearchResults` extracting language/format/publisher from meta string, and `BookService.searchBooks()`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Book interface, bookSearchUrl, withResolvedBaseUrl extraction | 09b5771 | src/anna/types.ts, src/anna/client.ts, src/anna/tool-utils.ts, src/tools/article-tools.ts |
| 2 | parseBookSearchResults and BookService | 6d0061c | src/anna/parse.ts, src/anna/book-service.ts |

## What Was Built

### src/anna/types.ts
Added `Book` interface with 8 optional fields: `language`, `format`, `size`, `title`, `publisher`, `authors`, `pageUrl`, `hash`. No `doi`, `journal`, or `downloadUrl` fields — those are article-specific or Phase 9 scope.

### src/anna/client.ts
Added `bookSearchUrl` pure function using `URLSearchParams` with `content: "book_any"`. Added `getBookSearchUrl(query)` instance method to `AnnasClient` class.

### src/anna/tool-utils.ts (new)
Generic `withResolvedBaseUrl<S, T>` with `WithBaseUrlDeps` interface. Extracted verbatim from the private `article-tools.ts` function, generalized with a `makeService: (config, fetchImpl) => S` factory parameter. Preserves identical offline retry logic and error message.

### src/tools/article-tools.ts
Removed local `withResolvedBaseUrl` definition. Added import from `../anna/tool-utils`. Updated both call sites (`handleArticleSearch`, `handleArticleDownload`) to use the 4-argument generic signature with `(cfg, fi) => new ArticleService(cfg, fi)` factory.

### src/anna/parse.ts
Added `parseBookSearchResults(html, baseOrigin): Book[]` using same `ARTICLE_LINK_SELECTOR` and `PRIMARY_RESULT_LINK_CLASS` selectors as the article parser. Added private (unexported) `parseLanguage` and `parseFormat` helpers. Uses `|| undefined` for `authors` and `publisher` (D-10).

### src/anna/book-service.ts (new)
`BookNotFoundError` and `BookService` class mirroring `article-service.ts`. `searchBooks(query)` calls `this.client.fetchText(this.client.getBookSearchUrl(query))` then `parseBookSearchResults(html, this.client.baseOrigin)`. No DOI branch — books use plain keyword queries only.

## Deviations from Plan

### Auto-refactored (Pitfall 4 prevention)
**Found during:** Task 1
**Issue:** RESEARCH.md Pitfall 4 warned that after extracting `withResolvedBaseUrl`, `article-tools.ts` must be updated immediately to avoid two copies drifting.
**Fix:** Updated both `handleArticleSearch` and `handleArticleDownload` call sites in `article-tools.ts` to use the new 4-argument generic signature. Removed the local function definition.
**Files modified:** src/tools/article-tools.ts
**Commits:** 09b5771

None outside of the planned scope — plan executed cleanly with the article-tools.ts update included as expected by the research document.

## Known Stubs

None — all fields are wired to real HTML extraction or properly return `undefined`.

## Threat Flags

No new threat surface introduced. `bookSearchUrl` uses `URLSearchParams` (T-08-01 mitigated). `parseBookSearchResults` returns empty array on DOM mismatch (T-08-02 accepted). `withResolvedBaseUrl` preserves `manualBaseUrl` guard verbatim (T-08-03 accepted).

## Self-Check: PASSED

All created files exist on disk. Both task commits (09b5771, 6d0061c) found in git log. TypeScript compiles cleanly (`bun run typecheck` exits 0).
