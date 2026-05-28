# Phase 8: Book Search - Research

**Researched:** 2026-05-19
**Domain:** TypeScript MCP tool development — HTML scraping, Zod schema, cheerio, Bun test
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `src/anna/book-service.ts` — clean separation mirroring `article-service.ts`; do NOT extend `ArticleService`
- **D-02:** New `src/tools/book-tools.ts` — mirrors `article-tools.ts` structure; do NOT append to `article-tools.ts`
- **D-03:** Add `bookSearchUrl()` constructor to `src/anna/client.ts` alongside `articleSearchUrl()` and other URL helpers
- **D-04:** Extract `withResolvedBaseUrl` to a shared module in Phase 8 (do not wait for Phase 9 REF-01). Placement is at Claude's discretion.
- **D-05:** Define `Book` interface in `src/anna/types.ts` alongside `Article` interface
- **D-06:** Define `bookSchema` and `bookSearchOutputSchema` in `src/tools/book-tools.ts` alongside the input schema (mirrors `articleSearchOutputSchema` placement)
- **D-07:** Use `pageUrl` field name (TypeScript camelCase) — not Go's `url` — for consistency with the `Article` type
- **D-08:** Add standalone `parseBookSearchResults` function to `src/anna/parse.ts` — independent of `parseArticleSearchResults`, same file
- **D-09:** No format normalization — return the raw HTML string value for `format`; consistent with how article fields are returned
- **D-10:** Missing optional book fields (language, publisher, etc.) → `undefined` (not `""`) — consistent with `Article` type

### Claude's Discretion

- Exact placement of extracted `withResolvedBaseUrl` helper (suggested: `src/anna/tool-utils.ts` to keep `base-url-manager.ts` focused on URL discovery)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BSRCH-01 | User can search Anna's Archive books by title, author, ISBN, or keywords via `book_search` | `book_search` URL uses `content=book_any`; same search endpoint as articles; `BookService.searchBooks(query)` method |
| BSRCH-02 | `book_search` results include language, format, publisher, title, authors, size, MD5 hash, and page URL per result | `parseBookSearchResults` must extract language + format from `div.text-gray-800` meta string; publisher from `span.icon-[mdi--company]` — these are absent from article parser |
| BSRCH-03 | `book_search` uses `BaseUrlManager` with offline recovery | `withResolvedBaseUrl` extracted to shared module; `BookService` instatiated inside the wrapper identical to `ArticleService` |
</phase_requirements>

---

## Summary

Phase 8 adds the `book_search` MCP tool to `annas-mcp-ts`. The tool searches Anna's Archive for books by title, author, ISBN, or keywords and returns structured results with full metadata. The implementation mirrors the existing article tool stack almost exactly: same URL structure (different `content=` param), same HTML DOM (same CSS selectors), same service/tool/schema pattern.

The key differences from articles are in the parser: books require extracting three additional fields (`language`, `format`, `size`) from the `div.text-gray-800` meta string (articles only extract `size`), and `publisher` from the same CSS selector articles use for `journal`. The `Book` interface does not have `doi`, `journal`, or `downloadUrl` fields; it has `language`, `format`, and `publisher` instead.

D-04 requires extracting `withResolvedBaseUrl` from `article-tools.ts` into a shared module during this phase. This is a small but necessary refactor — both article and book tools will import from the shared location afterward.

**Primary recommendation:** Mirror `article-tools.ts` / `article-service.ts` / `parse.ts` structure exactly. The only substantive new work is the book parser (extracting 3 fields from the meta string) and the `Book` interface. Everything else is renaming and wiring.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP tool registration | Tools layer (`book-tools.ts`) | Server (`server.ts`) | Tool registration follows the established pattern in `registerArticleTools` |
| Book search business logic | Service layer (`book-service.ts`) | — | Clean separation; service owns `BookService.searchBooks()` |
| HTTP requests to Anna's Archive | Client layer (`client.ts`) | — | `AnnasClient.fetchText()` is already shared and reused |
| HTML parsing | Parser (`parse.ts`) | — | New `parseBookSearchResults` function added to existing file |
| Mirror resilience / URL retry | Shared util (`tool-utils.ts`) | Tools layer | `withResolvedBaseUrl` extracted here so both article and book tools import it |
| Input/output schemas | Tools layer (`book-tools.ts`) | — | Zod schemas live alongside the handler per established convention |
| TypeScript domain types | Types file (`types.ts`) | — | `Book` interface added alongside `Article` interface |

---

## Standard Stack

### Core (already installed — no new packages needed)
[VERIFIED: package.json]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `cheerio` | `^1.2.0` | HTML scraping of Anna's Archive search results | Already installed; used by article parser |
| `zod/v4` | `^4.0.0` (import as `zod/v4`) | Input/output schema validation, `structuredContent` typing | Established project standard; note the `zod/v4` import path |
| `@modelcontextprotocol/server` | `^2.0.0-alpha.2` | MCP tool registration, `CallToolResult` type | Project's MCP runtime |
| `bun:test` | (built-in Bun) | Test framework (`describe`, `test`, `expect`) | Bun-native; no install needed |

No new packages need to be installed for Phase 8. All dependencies are already present.

### Package Legitimacy Audit

No new packages in this phase. All libraries listed above are already installed and in use in the existing codebase. [VERIFIED: package.json]

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
MCP Client
    |
    | book_search(query)
    v
book-tools.ts
  handleBookSearch()
    |
    |-- BaseUrlManager.resolveBaseUrl()  <-- tool-utils.ts withResolvedBaseUrl()
    |
    v
BookService.searchBooks(query)
    |
    |-- AnnasClient.fetchText(bookSearchUrl)
    |     GET /search?q={query}&content=book_any
    |
    v
  HTML response
    |
    v
parseBookSearchResults(html, baseOrigin)
    |
    | cheerio selectors (same DOM as articles)
    | + extract language/format/size from meta string
    |
    v
Book[] array
    |
    v
structuredContent { query, results: Book[] }
    |
    +-- content[0].text (JSON string)
    +-- structuredContent (Zod-typed object)
    |
    v
MCP Client
```

If mirror offline: `withResolvedBaseUrl` catches `AnnasClientError`, calls `BaseUrlManager.updateBaseUrl()`, retries once transparently.

### Recommended Project Structure

```
src/
  anna/
    types.ts          -- ADD: Book interface, Book is search-only (no downloadUrl)
    client.ts         -- ADD: bookSearchUrl() pure function + AnnasClient.getBookSearchUrl()
    article-service.ts   -- NO CHANGE
    book-service.ts      -- NEW: BookService class, BookNotFoundError
    parse.ts          -- ADD: parseBookSearchResults() function
    tool-utils.ts        -- NEW (D-04): extract withResolvedBaseUrl here
    base-url-manager.ts  -- NO CHANGE
  tools/
    article-tools.ts  -- MODIFY: import withResolvedBaseUrl from tool-utils.ts (remove local definition)
    book-tools.ts        -- NEW: bookSchema, bookSearchInputSchema, bookSearchOutputSchema,
                         --      BookToolDependencies, handleBookSearch, registerBookTools
    base-url-tools.ts    -- NO CHANGE
  server.ts           -- MODIFY: import registerBookTools, call registerBookTools(server, { config })
tests/
  anna.test.ts        -- ADD: bookSearchUrl builder test, parseBookSearchResults tests, BookService tests
  book-tools.test.ts     -- NEW: mirrors article-tools.test.ts
  article-tools.test.ts  -- NO CHANGE (withResolvedBaseUrl moves but import path changes are transparent)
  base-url-tools.test.ts -- NO CHANGE
```

### Pattern 1: Book interface (types.ts)

**What:** TypeScript interface for a single book search result. All fields optional (partial scraping is normal). No `downloadUrl` — that belongs to Phase 9 `book_download`.

**When to use:** Everywhere a parsed book result is passed.

```typescript
// Source: mirrors Article interface in src/anna/types.ts [VERIFIED: codebase]
export interface Book {
  language?: string;
  format?: string;     // raw string from HTML, no normalization (D-09)
  size?: string;
  title?: string;
  publisher?: string;
  authors?: string;
  pageUrl?: string;
  hash?: string;
}
```

Note: No `isbn` field — Anna's Archive search results do not surface ISBN in the card HTML.
Note: `pageUrl` (camelCase) not `url` (Go's field name) — per D-07.

### Pattern 2: bookSearchUrl pure function (client.ts)

**What:** Module-level pure function for building the book search URL; also exposed as an instance method on `AnnasClient`.

```typescript
// Source: mirrors articleSearchUrl in src/anna/client.ts [VERIFIED: codebase]
// Confirmed from GO-BOOK-TOOLS.md: content=book_any [VERIFIED: .planning/research/GO-BOOK-TOOLS.md]
export function bookSearchUrl(config: Pick<AnnasConfig, "baseUrl">, query: string): string {
  const params = new URLSearchParams({
    q: query,
    content: "book_any",
  });
  return `${originFor(config.baseUrl)}/search?${params.toString()}`;
}

// In AnnasClient class:
getBookSearchUrl(query: string): string {
  return bookSearchUrl(this.config, query);
}
```

### Pattern 3: parseBookSearchResults (parse.ts)

**What:** Standalone function that parses book search result HTML. Same selectors as `parseArticleSearchResults` but extracts three additional fields from the meta string.

**When to use:** Called by `BookService.searchBooks()`.

```typescript
// Source: mirrors parseArticleSearchResults in src/anna/parse.ts [VERIFIED: codebase]
// Meta extraction logic from GO-BOOK-TOOLS.md [VERIFIED: .planning/research/GO-BOOK-TOOLS.md]
export function parseBookSearchResults(html: string, baseOrigin: string): Book[] {
  const $ = cheerio.load(html);
  const books: Book[] = [];

  $(ARTICLE_LINK_SELECTOR).each((_, element) => {
    const link = $(element);
    if (link.attr("class") !== PRIMARY_RESULT_LINK_CLASS) {
      return;
    }

    const parent = link.parent();
    const info = parent.find("div.max-w-full");
    if (!info.length) return;

    const title = info.find(ARTICLE_LINK_SELECTOR).first().text().trim();
    const href = link.attr("href");
    const hash = href ? parseHashFromHref(href) : undefined;
    if (!title || !href || !hash) return;

    const authors = info.find("a[href^='/search'] span.icon-\\[mdi--user-edit\\]").parent().text().trim();
    const publisher = info.find("a[href^='/search'] span.icon-\\[mdi--company\\]").parent().text().trim();
    const meta = info.find("div.text-gray-800").text();

    books.push({
      title,
      authors: authors || undefined,
      publisher: publisher || undefined,
      language: parseLanguage(meta),
      format: parseFormat(meta),
      size: parseSize(meta),
      hash,
      pageUrl: absoluteUrl(baseOrigin, href),
    });
  });

  return books;
}
```

Meta field extraction helpers (private to parse.ts):

```typescript
// Language: first segment before '· ' that contains '[xx]' lang code
// Source: Go extractMetaInformation() in GO-BOOK-TOOLS.md [VERIFIED]
function parseLanguage(meta: string): string | undefined {
  // Meta example: "✅ English [en] · PDF · 2.4 MB"
  const match = meta.match(/[A-Za-z][A-Za-z\s]*\[.+?\]/);
  return match?.[0]?.replace(/^✅\s*/, "").trim() || undefined;
}

function parseFormat(meta: string): string | undefined {
  // Return raw string value — no normalization per D-09
  const match = meta.match(/\b(EPUB|PDF|MOBI|AZW3|AZW|DJVU|CBZ|CBR|FB2|DOCX?|TXT)\b/i);
  return match?.[0] || undefined;
}
```

Note on D-09: `parseSize` already returns the raw string; `parseFormat` and `parseLanguage` should follow the same convention — return what is in the HTML, no case normalization.

### Pattern 4: BookService (book-service.ts)

**What:** Service class mirroring `ArticleService`. Phase 8 only needs `searchBooks()` — download-related methods are Phase 9.

```typescript
// Source: mirrors ArticleService in src/anna/article-service.ts [VERIFIED: codebase]
export class BookNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookNotFoundError";
  }
}

export class BookService {
  private readonly client: AnnasClient;

  constructor(config: AnnasConfig, fetchImpl?: FetchLike) {
    this.client = new AnnasClient(config, fetchImpl);
  }

  async searchBooks(query: string): Promise<Book[]> {
    const html = await this.client.fetchText(this.client.getBookSearchUrl(query));
    return parseBookSearchResults(html, this.client.baseOrigin);
  }
}
```

Note: No DOI detection needed for books. Books use plain keyword queries only.

### Pattern 5: withResolvedBaseUrl extraction (tool-utils.ts) — D-04

**What:** Generic extraction of the offline retry wrapper. Currently private in `article-tools.ts`; Phase 8 moves it to `src/anna/tool-utils.ts` and makes it generic over the service type.

**Two options:**

Option A — Generic function (preferred, avoids duplication):
```typescript
// Source: src/tools/article-tools.ts withResolvedBaseUrl [VERIFIED: codebase]
// Extracted to src/anna/tool-utils.ts
import { BaseUrlManager, isLikelyOfflineBaseUrlError } from "./base-url-manager";
import type { AnnasConfig } from "../config";
import type { FetchLike } from "./types";

interface WithBaseUrlDeps {
  config: AnnasConfig;
  fetchImpl?: FetchLike;
}

type ServiceFactory<S> = (config: AnnasConfig, fetchImpl?: FetchLike) => S;

export async function withResolvedBaseUrl<S, T>(
  dependencies: WithBaseUrlDeps,
  manager: BaseUrlManager,
  makeService: ServiceFactory<S>,
  run: (service: S) => Promise<T>,
): Promise<{ results: T; baseUrl: string }> {
  const baseUrl = await manager.resolveBaseUrl();
  const service = makeService({ ...dependencies.config, baseUrl }, dependencies.fetchImpl);

  try {
    return { results: await run(service), baseUrl };
  } catch (error) {
    if (!isLikelyOfflineBaseUrlError(error)) throw error;
    if (dependencies.config.manualBaseUrl) {
      throw new Error(
        "Configured ANNAS_BASE_URL appears offline. Update ANNAS_BASE_URL or delete it to let automatic discovery choose a mirror.",
      );
    }
    await manager.updateBaseUrl();
    const refreshed = await manager.resolveBaseUrl();
    const retriedService = makeService({ ...dependencies.config, baseUrl: refreshed }, dependencies.fetchImpl);
    return { results: await run(retriedService), baseUrl: refreshed };
  }
}
```

Usage in `article-tools.ts` after extraction:
```typescript
const { results } = await withResolvedBaseUrl(
  dependencies,
  manager,
  (cfg, fi) => new ArticleService(cfg, fi),
  (service) => service.searchArticles(args.query),
);
```

Usage in `book-tools.ts`:
```typescript
const { results } = await withResolvedBaseUrl(
  dependencies,
  manager,
  (cfg, fi) => new BookService(cfg, fi),
  (service) => service.searchBooks(args.query),
);
```

Option B — Copy the function verbatim to `book-tools.ts`, replacing `ArticleService` with `BookService`. Simpler, no refactor of `article-tools.ts`. The CONTEXT.md says Claude's discretion applies to placement, so either is valid. Option A is preferred because it satisfies D-04's intent (a shared module) while keeping both callers clean.

### Pattern 6: book-tools.ts structure

**What:** MCP tool registration following article-tools.ts exactly.

```typescript
// Source: mirrors src/tools/article-tools.ts [VERIFIED: codebase]
import * as z from "zod/v4";

const bookSchema = z.object({           // private, not exported (per article pattern)
  language: z.string().optional(),
  format: z.string().optional(),
  size: z.string().optional(),
  title: z.string().optional(),
  publisher: z.string().optional(),
  authors: z.string().optional(),
  pageUrl: z.string().optional(),
  hash: z.string().optional(),
});

export const bookSearchInputSchema = z.object({
  query: z.string().trim().min(1).describe("Title, author, ISBN, or keywords to search for books"),
});

export const bookSearchOutputSchema = z.object({   // exported (per article pattern)
  query: z.string(),
  results: z.array(bookSchema),
});

export interface BookToolDependencies {
  config: AnnasConfig;
  fetchImpl?: FetchLike;
  baseUrlManager?: BaseUrlManager;
}

export async function handleBookSearch(
  args: z.infer<typeof bookSearchInputSchema>,
  dependencies: BookToolDependencies,
): Promise<CallToolResult> { ... }

export function registerBookTools(
  server: McpServer,
  dependencies: BookToolDependencies,
): void {
  server.registerTool(
    "book_search",
    {
      title: "Book Search",
      description: "Search Anna's Archive for books by title, author, ISBN, or keywords.",
      inputSchema: bookSearchInputSchema,
      outputSchema: bookSearchOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    (args) => handleBookSearch(args, dependencies),
  );
}
```

### Anti-Patterns to Avoid

- **Extending ArticleService for books:** D-01 explicitly forbids this. Books and articles diverge in Phase 9 (no SciDB fallback for books); sharing a base class causes confusion.
- **Appending to article-tools.ts:** D-02 forbids this. Separate files keep Phase 9 extension clean.
- **Format normalization (uppercasing/lowercasing format values):** D-09 says return raw string. The Go upstream normalizes to uppercase; our article parser returns raw too.
- **Using empty string `""` for missing fields:** D-10 says `undefined` for missing optional fields, consistent with `Article` type.
- **Importing `zod` instead of `zod/v4`:** The project uses `import * as z from "zod/v4"`. Using `"zod"` imports the wrong API surface. [VERIFIED: codebase]
- **Placing withResolvedBaseUrl logic in base-url-manager.ts:** CONTEXT.md's suggested placement (`tool-utils.ts`) exists specifically to keep `base-url-manager.ts` focused on URL discovery only.
- **`textResult` / `jsonText` as shared module:** CONTEXT.md notes these are one-liners acceptable to duplicate locally in `book-tools.ts`. The article pattern itself keeps them private to the file.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML parsing | Custom regex/string parser | `cheerio` (already installed) | CSS selectors handle DOM variations; regex on HTML is brittle |
| MCP tool registration | Custom server protocol | `@modelcontextprotocol/server` `registerTool` | Already used by all other tools |
| URL encoding | Manual string concatenation | `URLSearchParams` | Handles special chars in query; already used in `articleSearchUrl` |
| Offline mirror retry | Ad-hoc try/catch | `withResolvedBaseUrl` extracted to `tool-utils.ts` | Handles manual vs auto base URL edge cases already solved |
| Schema validation | Manual `if typeof` checks | `zod/v4` schemas | Provides `structuredContent` typing and MCP output schema contract |

---

## Common Pitfalls

### Pitfall 1: Empty string vs undefined for missing book fields
**What goes wrong:** Parser extracts an empty string `""` for missing authors/publisher and pushes it into the `Book` object. Downstream consumers can't distinguish "not found" from "empty value" using falsy checks.
**Why it happens:** Cheerio `.text()` returns `""` on a no-match, and it's easy to push the raw value.
**How to avoid:** Apply `|| undefined` after `.text().trim()` for every optional field — as done for `authors` and `publisher` in Pattern 3.
**Warning signs:** Tests asserting `authors: ""` instead of the field being absent from the object.

### Pitfall 2: Wrong `content=` query parameter
**What goes wrong:** Using `content=journal` instead of `content=book_any` returns article results, not books. The tool appears to work but returns wrong data type.
**Why it happens:** Copy-paste from `articleSearchUrl` without changing the `content` param.
**How to avoid:** `bookSearchUrl` must use `content: "book_any"` — verified from GO-BOOK-TOOLS.md.
**Warning signs:** Book search test returns results with `journal` field instead of `publisher`.

### Pitfall 3: Missing language and format extraction
**What goes wrong:** Parser only calls `parseSize(meta)` (the article pattern) and omits `parseLanguage` and `parseFormat`. BSRCH-02 fails.
**Why it happens:** The article parser only extracts size; it's easy to copy and forget the book-specific fields.
**How to avoid:** `parseBookSearchResults` must call all three meta extractors.
**Warning signs:** `language` and `format` fields are `undefined` in all test results.

### Pitfall 4: withResolvedBaseUrl not updated in article-tools.ts after extraction
**What goes wrong:** `tool-utils.ts` exports the function, `book-tools.ts` imports it, but `article-tools.ts` still has its own private copy. Two copies drift over time.
**Why it happens:** Forgetting to update the existing file when extracting to shared.
**How to avoid:** After creating `tool-utils.ts`, update `article-tools.ts` to import from it and remove the local definition. Verify with `grep -n "withResolvedBaseUrl" src/tools/article-tools.ts` — should show only the import, not a definition.
**Warning signs:** `article-tools.ts` still has `async function withResolvedBaseUrl` after the refactor.

### Pitfall 5: `zod` vs `zod/v4` import
**What goes wrong:** `import { z } from "zod"` instead of `import * as z from "zod/v4"` — the API surface differs in v4; `z.string()` in `"zod"` refers to the v3 API.
**Why it happens:** Muscle memory / copy-paste from external examples.
**How to avoid:** Match the existing import in `article-tools.ts` exactly: `import * as z from "zod/v4"`.
**Warning signs:** TypeScript errors referencing `z.object` or schema inference diverging from existing types.

### Pitfall 6: book-tools.ts exporting `textResult` / `jsonText` publicly
**What goes wrong:** Exporting these as public symbols pollutes the module's public API.
**Why it happens:** Not checking the article pattern which keeps them private.
**How to avoid:** Both helpers are declared with `function` (no `export`) in article-tools.ts; follow the same in book-tools.ts.

---

## Code Examples

### bookSearchUrl test (mirrors anna.test.ts pattern)
```typescript
// Source: tests/anna.test.ts URL construction describe block [VERIFIED: codebase]
test("builds book search URL", () => {
  expect(bookSearchUrl(config, "dune frank herbert")).toBe(
    "https://annas-archive.li/search?q=dune+frank+herbert&content=book_any",
  );
});
```

### parseBookSearchResults test fixture
```typescript
// Source: mirrors searchHtml in tests/anna.test.ts [VERIFIED: codebase]
// Book-specific: adds language/format fields to meta string
const bookSearchHtml = `
<html>
  <body>
    <div>
      <a class="custom-a block mr-2 sm:mr-4 hover:opacity-80" href="/md5/deadbeef1234">cover</a>
      <div class="max-w-full">
        <a href="/md5/deadbeef1234">Dune</a>
        <a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Frank Herbert</a>
        <a href="/search?q=publisher"><span class="icon-[mdi--company]"></span>Chilton Books</a>
        <div class="text-gray-800">English [en] · EPUB · 0.7 MB</div>
      </div>
    </div>
  </body>
</html>
`;

test("parses book search result cards", () => {
  expect(parseBookSearchResults(bookSearchHtml, "https://annas-archive.li")).toEqual([
    {
      title: "Dune",
      authors: "Frank Herbert",
      publisher: "Chilton Books",
      language: "English [en]",
      format: "EPUB",
      size: "0.7 MB",
      hash: "deadbeef1234",
      pageUrl: "https://annas-archive.li/md5/deadbeef1234",
    },
  ]);
});
```

### handleBookSearch test (mirrors article-tools.test.ts pattern)
```typescript
// Source: mirrors tests/article-tools.test.ts [VERIFIED: codebase]
test("book_search returns structured results", async () => {
  const fetchMock: FetchLike = async () =>
    new Response(bookSearchHtml, { status: 200 });

  const result = await handleBookSearch(
    { query: "dune" },
    { config, fetchImpl: fetchMock },
  );

  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toEqual({
    query: "dune",
    results: [
      {
        title: "Dune",
        authors: "Frank Herbert",
        publisher: "Chilton Books",
        language: "English [en]",
        format: "EPUB",
        size: "0.7 MB",
        hash: "deadbeef1234",
        pageUrl: "https://annas-archive.li/md5/deadbeef1234",
      },
    ],
  });
});

test("book_search returns clear no-results response", async () => {
  const fetchMock: FetchLike = async () =>
    new Response("<html></html>", { status: 200 });

  const result = await handleBookSearch(
    { query: "nonexistent" },
    { config, fetchImpl: fetchMock },
  );

  expect(result.isError).toBeUndefined();
  expect(firstText(result)).toContain("No books found");
  expect(result.structuredContent).toEqual({ query: "nonexistent", results: [] });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `zod` import | `zod/v4` import path | Zod v4 release | The v4 API is accessed via `"zod/v4"` not `"zod"` — breaking for new files if wrong path used |
| `ArticleService`-specific `withResolvedBaseUrl` | Generic `withResolvedBaseUrl` in `tool-utils.ts` | Phase 8 D-04 | Both article and book tools can use the same offline retry logic |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `parseLanguage` regex pattern extracts the full `"Language [code]"` text correctly from real Anna's Archive HTML | Code Examples | Parser returns `undefined` for language field in real results; tests pass against fixture but fail on live HTML |
| A2 | The Anna's Archive book search DOM structure is identical to article search (same card HTML, same CSS selectors) | Architecture Patterns | Parser must be written from scratch with different selectors; would require live scrape to verify |

Note on A2: This is strongly supported by GO-BOOK-TOOLS.md which states "Both search functions use the **exact same CSS selectors** and DOM structure." The research document was itself derived from reading the upstream Go source. Risk is LOW.

Note on A1: The language extraction regex is based on Go's `extractMetaInformation()` description. The exact regex will likely need tuning against real HTML. The test fixture in this document should be validated against a real search result before final implementation.

---

## Open Questions

1. **Language field exact format in live HTML**
   - What we know: Go extracts "first segment before `[xx]` lang code, strip leading `✅`"; example meta string `"✅ English [en] · PDF · 2.4MB"`.
   - What's unclear: Whether the `✅` emoji and separator format are consistent across all book results, or whether some results omit these.
   - Recommendation: Implement `parseLanguage` to be tolerant — return the matched text or `undefined`. If the regex misses some cases, they return `undefined` (consistent with D-10).

2. **withResolvedBaseUrl generic signature vs copy approach**
   - What we know: D-04 says extract to shared module; CONTEXT.md suggests `src/anna/tool-utils.ts`.
   - What's unclear: Whether to make the function generic over service type (Option A) or have separate article/book variants (Option B).
   - Recommendation: Option A (generic) is cleaner and avoids any duplication. The signature change in `article-tools.ts` is a one-liner update.

---

## Environment Availability

Step 2.6: All dependencies are already installed in the project. No external tools required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | Test execution, server runtime | Yes (project constraint) | ^1.2.0 (devDep) | — |
| cheerio | HTML parsing | Yes (installed) | ^1.2.0 | — |
| zod (v4) | Schema validation | Yes (installed) | ^4.0.0 | — |
| TypeScript | Type checking (`bun run typecheck`) | Yes (devDep) | ^5.9.0 | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

---

## Security Domain

`security_enforcement` is not explicitly set to `false` in config.json — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | book_search is read-only; no auth required |
| V3 Session Management | No | Stateless MCP tool |
| V4 Access Control | No | No authorization model in this tool |
| V5 Input Validation | Yes | `z.string().trim().min(1)` on query input via Zod |
| V6 Cryptography | No | No crypto operations in Phase 8 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed query string injection into URL | Tampering | `URLSearchParams` handles encoding; no raw string concatenation |
| HTML response interpreted as error page / phishing redirect | Spoofing | `AnnasClient.fetchText()` checks `response.ok`; book parser returns empty array on no matching selectors |
| SSRF via manipulated base URL | Elevation of Privilege | `BaseUrlManager` uses `HOST_PATTERN` regex; `manualBaseUrl` prevents auto-discovery when set |

Phase 8 adds no new file I/O or download capabilities — those security concerns (path traversal, magic bytes, size limits) are Phase 9 scope.

---

## Sources

### Primary (HIGH confidence)
- `src/tools/article-tools.ts` — Article tool structure, `withResolvedBaseUrl`, handler pattern, schema placement [VERIFIED: codebase]
- `src/anna/article-service.ts` — Service layer pattern, `ArticleNotFoundError`, constructor signature [VERIFIED: codebase]
- `src/anna/client.ts` — URL builder pattern, `AnnasClient`, `originFor`, `BROWSER_USER_AGENT` [VERIFIED: codebase]
- `src/anna/parse.ts` — Parser pattern, reusable helpers (`parseSize`, `absoluteUrl`, `parseHashFromHref`, selectors) [VERIFIED: codebase]
- `src/anna/types.ts` — `Article` interface, `DownloadSource`, import conventions [VERIFIED: codebase]
- `src/server.ts` — Registration call site pattern [VERIFIED: codebase]
- `tests/anna.test.ts` — Test structure, config fixture, `response()` helper, assertion patterns [VERIFIED: codebase]
- `tests/article-tools.test.ts` — Handler test structure, `firstText()` helper, mock patterns [VERIFIED: codebase]
- `.planning/research/GO-BOOK-TOOLS.md` — Upstream Go `book_search` endpoint, HTML selectors, `Book` struct, meta string extraction logic [VERIFIED: planning artifact]
- `.planning/research/TS-ARTICLE-PATTERNS.md` — Consolidated pattern reference [VERIFIED: planning artifact]
- `package.json` — Installed dependencies, versions [VERIFIED: codebase]
- `.planning/config.json` — `nyquist_validation: false` (Validation Architecture section omitted) [VERIFIED: planning artifact]
- `.planning/phases/08-book-search/08-CONTEXT.md` — All locked decisions D-01 through D-10 [VERIFIED: planning artifact]

### Secondary (MEDIUM confidence)
- None needed — all required information was available from the codebase and existing planning artifacts.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all verified in package.json
- Architecture: HIGH — all patterns verified directly in codebase; Go upstream confirmed selectors are identical
- Parser specifics (language regex): MEDIUM — based on Go description; exact regex may need tuning against live HTML
- Pitfalls: HIGH — derived from direct reading of existing code and decision context

**Research date:** 2026-05-19
**Valid until:** 2026-06-18 (stable domain — Anna's Archive HTML structure changes infrequently)
