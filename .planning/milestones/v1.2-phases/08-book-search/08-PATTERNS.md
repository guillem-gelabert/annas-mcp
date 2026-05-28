# Phase 8: Book Search - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 9 (7 new/modified source files + 2 new test files)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/anna/types.ts` | model | — (type definitions) | `src/anna/types.ts` (existing) | exact — add alongside `Article` |
| `src/anna/client.ts` | client/utility | request-response | `src/anna/client.ts` (existing) | exact — add alongside `articleSearchUrl` |
| `src/anna/parse.ts` | utility | transform | `src/anna/parse.ts` (existing) | exact — add alongside `parseArticleSearchResults` |
| `src/anna/book-service.ts` | service | request-response | `src/anna/article-service.ts` | exact role-match |
| `src/anna/tool-utils.ts` | utility | request-response | `src/tools/article-tools.ts` (extract from) | exact — extract `withResolvedBaseUrl` |
| `src/tools/book-tools.ts` | tool/controller | request-response | `src/tools/article-tools.ts` | exact role-match |
| `src/tools/article-tools.ts` | tool/controller | request-response | self (modify imports only) | exact — import from tool-utils.ts |
| `src/server.ts` | entry point | — | `src/server.ts` (existing) | exact — add `registerBookTools` call |
| `tests/anna.test.ts` | test | — | `tests/anna.test.ts` (existing) | exact — add URL + parser + service tests |
| `tests/book-tools.test.ts` | test | — | `tests/article-tools.test.ts` | exact role-match |

---

## Pattern Assignments

### `src/anna/types.ts` — ADD `Book` interface

**Analog:** `src/anna/types.ts` (lines 1–12)

**Existing interface pattern to mirror** (lines 3–12):
```typescript
export interface Article {
  doi?: string;
  title?: string;
  authors?: string;
  journal?: string;
  size?: string;
  hash?: string;
  pageUrl?: string;
  downloadUrl?: string;
}
```

**New `Book` interface to add directly after `Article`:**
```typescript
export interface Book {
  language?: string;
  format?: string;     // raw HTML string, no normalization (D-09)
  size?: string;
  title?: string;
  publisher?: string;
  authors?: string;
  pageUrl?: string;    // camelCase per D-07, not Go's `url`
  hash?: string;
}
```

Note: `zod` import at line 1 uses `import { z } from "zod/v4"` — match this style.

---

### `src/anna/client.ts` — ADD `bookSearchUrl` pure function + `AnnasClient.getBookSearchUrl()`

**Analog:** `src/anna/client.ts` (lines 19–26)

**Existing pattern to mirror** (`articleSearchUrl`, lines 19–26):
```typescript
export function articleSearchUrl(config: Pick<AnnasConfig, "baseUrl">, query: string): string {
  const params = new URLSearchParams({
    q: query,
    content: "journal",
  });

  return `${originFor(config.baseUrl)}/search?${params.toString()}`;
}
```

**New function to add after `articleSearchUrl`:**
```typescript
export function bookSearchUrl(config: Pick<AnnasConfig, "baseUrl">, query: string): string {
  const params = new URLSearchParams({
    q: query,
    content: "book_any",   // D-03: confirmed from GO-BOOK-TOOLS.md
  });

  return `${originFor(config.baseUrl)}/search?${params.toString()}`;
}
```

**New instance method to add in `AnnasClient` class** (after `getSearchUrl`, line 64–66):
```typescript
getBookSearchUrl(query: string): string {
  return bookSearchUrl(this.config, query);
}
```

---

### `src/anna/parse.ts` — ADD `parseBookSearchResults` + private helpers

**Analog:** `src/anna/parse.ts` (lines 1–59)

**Imports pattern** (lines 1–3 — already present, no change needed):
```typescript
import * as cheerio from "cheerio";

import type { Article } from "./types";
```

After modification, import line becomes:
```typescript
import type { Article, Book } from "./types";
```

**Reusable constants already in file** (lines 5–6):
```typescript
const ARTICLE_LINK_SELECTOR = "a[href^='/md5/']";
const PRIMARY_RESULT_LINK_CLASS = "custom-a block mr-2 sm:mr-4 hover:opacity-80";
```

**Core parser pattern to mirror** (`parseArticleSearchResults`, lines 21–59):
```typescript
export function parseArticleSearchResults(html: string, baseOrigin: string): Article[] {
  const $ = cheerio.load(html);
  const articles: Article[] = [];

  $(ARTICLE_LINK_SELECTOR).each((_, element) => {
    const link = $(element);
    if (link.attr("class") !== PRIMARY_RESULT_LINK_CLASS) {
      return;
    }
    const parent = link.parent();
    const info = parent.find("div.max-w-full");
    if (!info.length) { return; }

    const title = info.find(ARTICLE_LINK_SELECTOR).first().text().trim();
    const href = link.attr("href");
    const hash = href ? parseHashFromHref(href) : undefined;
    if (!title || !href || !hash) { return; }

    const authors = info.find("a[href^='/search'] span.icon-\\[mdi--user-edit\\]").parent().text().trim();
    const journal = info.find("a[href^='/search'] span.icon-\\[mdi--company\\]").parent().text().trim();
    const meta = info.find("div.text-gray-800").text();

    articles.push({
      title,
      authors,
      journal,
      size: parseSize(meta),
      hash,
      pageUrl: absoluteUrl(baseOrigin, href),
    });
  });

  return articles;
}
```

**New `parseBookSearchResults` function** (add after `parseArticleSearchResults`):

Differences from article parser:
- Returns `Book[]` instead of `Article[]`
- `publisher` replaces `journal` (same CSS selector `span.icon-[mdi--company]`)
- Adds `language: parseLanguage(meta)` and `format: parseFormat(meta)` calls
- All optional fields use `|| undefined` to avoid empty strings (D-10)

```typescript
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
    if (!info.length) { return; }

    const title = info.find(ARTICLE_LINK_SELECTOR).first().text().trim();
    const href = link.attr("href");
    const hash = href ? parseHashFromHref(href) : undefined;
    if (!title || !href || !hash) { return; }

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

**Private meta-extraction helpers** (add at bottom of parse.ts, not exported):
```typescript
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

Note: `parseSize` (line 8–10) is already exported and reused directly — no changes needed.

---

### `src/anna/book-service.ts` — NEW file

**Analog:** `src/anna/article-service.ts` (lines 1–100)

**Imports pattern** (lines 1–8):
```typescript
import type { AnnasConfig } from "../config";
import { AnnasClient } from "./client";
import {
  parseArticleDetail,
  parseArticleSearchResults,
  parseFirstArticleHash,
} from "./parse";
import type { Article, ArticleDownloadResolution, FetchLike } from "./types";
```

**New file mirrors this structure** — import only what Phase 8 needs:
```typescript
import type { AnnasConfig } from "../config";
import { AnnasClient } from "./client";
import { parseBookSearchResults } from "./parse";
import type { Book, FetchLike } from "./types";
```

**Error class pattern** (lines 10–15):
```typescript
export class ArticleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArticleNotFoundError";
  }
}
```

**New error class:**
```typescript
export class BookNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookNotFoundError";
  }
}
```

**Service class pattern** (lines 22–42):
```typescript
export class ArticleService {
  private readonly client: AnnasClient;

  constructor(config: AnnasConfig, fetchImpl?: FetchLike) {
    this.client = new AnnasClient(config, fetchImpl);
  }

  async searchArticles(query: string): Promise<Article[]> {
    // ...DOI branch omitted for books...
    const html = await this.client.fetchText(this.client.getSearchUrl(query));
    return parseArticleSearchResults(html, this.client.baseOrigin);
  }
}
```

**New `BookService` class** (Phase 8 only needs `searchBooks` — no DOI branch):
```typescript
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

---

### `src/anna/tool-utils.ts` — NEW file (D-04 extraction)

**Analog:** `src/tools/article-tools.ts` lines 391–429 (`withResolvedBaseUrl` private function)

**Existing function to extract** (lines 391–429):
```typescript
async function withResolvedBaseUrl<T>(
  dependencies: ArticleToolDependencies,
  manager: BaseUrlManager,
  run: (service: ArticleService) => Promise<T>,
): Promise<{ results: T; baseUrl: string }> {
  const baseUrl = await manager.resolveBaseUrl();
  const service = new ArticleService(
    { ...dependencies.config, baseUrl },
    dependencies.fetchImpl,
  );

  try {
    return { results: await run(service), baseUrl };
  } catch (error) {
    if (!isLikelyOfflineBaseUrlError(error)) { throw error; }

    if (dependencies.config.manualBaseUrl) {
      throw new Error(
        "Configured ANNAS_BASE_URL appears offline. Update ANNAS_BASE_URL or delete it to let automatic discovery choose a mirror.",
      );
    }

    await manager.updateBaseUrl();
    const refreshed = await manager.resolveBaseUrl();
    const retriedService = new ArticleService(
      { ...dependencies.config, baseUrl: refreshed },
      dependencies.fetchImpl,
    );
    return { results: await run(retriedService), baseUrl: refreshed };
  }
}
```

**New generic version in `src/anna/tool-utils.ts`:**
```typescript
import { BaseUrlManager, isLikelyOfflineBaseUrlError } from "./base-url-manager";
import type { AnnasConfig } from "../config";
import type { FetchLike } from "./types";

export interface WithBaseUrlDeps {
  config: AnnasConfig;
  fetchImpl?: FetchLike;
}

export async function withResolvedBaseUrl<S, T>(
  dependencies: WithBaseUrlDeps,
  manager: BaseUrlManager,
  makeService: (config: AnnasConfig, fetchImpl?: FetchLike) => S,
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

---

### `src/tools/article-tools.ts` — MODIFY (update imports only, remove local `withResolvedBaseUrl`)

**Change:** Remove the private `withResolvedBaseUrl` function (lines 391–429) and replace with an import from `tool-utils.ts`. The function signature changes from `ArticleService`-specific to generic, so the call site in `handleArticleSearch` and `handleArticleDownload` must pass a `makeService` factory argument.

**Import line to add** (alongside existing imports at lines 1–10):
```typescript
import { withResolvedBaseUrl } from "../anna/tool-utils";
```

**Updated call site pattern** (currently lines 81–85):
```typescript
// Before (article-specific):
const { results } = await withResolvedBaseUrl(
  dependencies,
  manager,
  (service) => service.searchArticles(args.query),
);

// After (generic — add makeService as 3rd argument):
const { results } = await withResolvedBaseUrl(
  dependencies,
  manager,
  (cfg, fi) => new ArticleService(cfg, fi),
  (service) => service.searchArticles(args.query),
);
```

Same update applies to `handleArticleDownload` (lines 113–116).

---

### `src/tools/book-tools.ts` — NEW file

**Analog:** `src/tools/article-tools.ts` (full file, lines 1–187, excluding download/file-IO sections)

**Imports pattern** (lines 1–10):
```typescript
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";   // NOTE: "zod/v4" not "zod"

import type { AnnasConfig } from "../config";
import { BaseUrlManager } from "../anna/base-url-manager";
import { BookService } from "../anna/book-service";
import { withResolvedBaseUrl } from "../anna/tool-utils";
import type { Book, FetchLike } from "../anna/types";
```

**Schema pattern** (lines 12–36 in article-tools.ts):
```typescript
// Private — not exported (mirrors articleSchema)
const bookSchema = z.object({
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

export const bookSearchOutputSchema = z.object({   // exported — mirrors articleSearchOutputSchema
  query: z.string(),
  results: z.array(bookSchema),
});
```

**Dependencies interface pattern** (lines 58–62):
```typescript
export interface BookToolDependencies {
  config: AnnasConfig;
  fetchImpl?: FetchLike;
  baseUrlManager?: BaseUrlManager;
}
```

**Private helper functions** (lines 64–73 — copy verbatim, keep private/unexported):
```typescript
function textResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
```

**Handler pattern** (lines 75–105):
```typescript
export async function handleBookSearch(
  args: z.infer<typeof bookSearchInputSchema>,
  dependencies: BookToolDependencies,
): Promise<CallToolResult> {
  try {
    const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
    const { results } = await withResolvedBaseUrl(
      dependencies,
      manager,
      (cfg, fi) => new BookService(cfg, fi),
      (service) => service.searchBooks(args.query),
    );
    const structuredContent = {
      query: args.query,
      results,
    };

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No books found for query: ${args.query}` }],
        structuredContent,
      };
    }

    return {
      content: [{ type: "text", text: jsonText(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    return textResult(error instanceof Error ? error.message : "Book search failed", true);
  }
}
```

**Tool registration pattern** (lines 153–185):
```typescript
export function registerBookTools(server: McpServer, dependencies: BookToolDependencies): void {
  server.registerTool(
    "book_search",
    {
      title: "Book Search",
      description: "Search Anna's Archive for books by title, author, ISBN, or keywords.",
      inputSchema: bookSearchInputSchema,
      outputSchema: bookSearchOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    (args) => handleBookSearch(args, dependencies),
  );
}
```

---

### `src/server.ts` — MODIFY (add `registerBookTools` call)

**Analog:** `src/server.ts` (lines 1–31)

**Existing registration pattern** (lines 1–17):
```typescript
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";

import { loadConfig, type AnnasConfig } from "./config";
import { registerArticleTools } from "./tools/article-tools";
import { registerBaseUrlTools } from "./tools/base-url-tools";

export function createServer(config: AnnasConfig): McpServer {
  const server = new McpServer({
    name: "annas-mcp-ts",
    version: "0.1.0",
  });

  registerArticleTools(server, { config });
  registerBaseUrlTools(server, { config });

  return server;
}
```

**Changes:** Add import and registration call following the same pattern as `registerArticleTools`:
```typescript
// Add to imports:
import { registerBookTools } from "./tools/book-tools";

// Add inside createServer, after registerArticleTools line:
registerBookTools(server, { config });
```

---

### `tests/anna.test.ts` — ADD book URL, parser, and service tests

**Analog:** `tests/anna.test.ts` (lines 1–172)

**Config fixture** (lines 19–24 — reuse as-is, no change):
```typescript
const config: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: true,
  downloadPath: null,
};
```

**HTML fixture pattern** (lines 26–40 — add book-specific fixture alongside `searchHtml`):
```typescript
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
```

**Test describe block pattern** (lines 66–88 — add parallel `describe` blocks for book URL and parsers):
```typescript
describe("URL construction", () => {
  // existing tests...

  test("builds book search URL", () => {
    expect(bookSearchUrl(config, "dune frank herbert")).toBe(
      "https://annas-archive.li/search?q=dune+frank+herbert&content=book_any",
    );
  });
});

describe("parsers", () => {
  // existing tests...

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
});

describe("BookService", () => {
  test("searches books by keyword", async () => {
    const fetchMock: FetchLike = async (input) => {
      expect(String(input)).toBe("https://annas-archive.li/search?q=dune&content=book_any");
      return new Response(bookSearchHtml, { status: 200 });
    };

    const service = new BookService(config, fetchMock);
    const results = await service.searchBooks("dune");

    expect(results).toHaveLength(1);
    expect(results[0]?.hash).toBe("deadbeef1234");
  });
});
```

---

### `tests/book-tools.test.ts` — NEW file

**Analog:** `tests/article-tools.test.ts` (lines 1–168)

**Imports pattern** (lines 1–8):
```typescript
import { describe, expect, test } from "bun:test";

import { handleBookSearch } from "../src/tools/book-tools";
import type { FetchLike } from "../src/anna/types";
import type { AnnasConfig } from "../src/config";
```

**Config + fixture pattern** (lines 10–27 — copy config, create book fixture):
```typescript
const config: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: true,
  downloadPath: null,
};

const bookSearchHtml = `
<div>
  <a class="custom-a block mr-2 sm:mr-4 hover:opacity-80" href="/md5/deadbeef1234">cover</a>
  <div class="max-w-full">
    <a href="/md5/deadbeef1234">Dune</a>
    <a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Frank Herbert</a>
    <a href="/search?q=publisher"><span class="icon-[mdi--company]"></span>Chilton Books</a>
    <div class="text-gray-800">English [en] · EPUB · 0.7 MB</div>
  </div>
</div>
`;
```

**Helper functions** (lines 40–48 — copy verbatim):
```typescript
function response(body: string): Response {
  return new Response(body, { status: 200 });
}

function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
  const item = result.content[0];
  expect(item?.type).toBe("text");
  return item?.text ?? "";
}
```

**Test describe pattern** (lines 50–168):
```typescript
describe("book MCP handlers", () => {
  test("book_search returns structured results", async () => { ... });
  test("book_search returns clear no-results response", async () => { ... });
  test("tool failures return MCP errors", async () => { ... });
});
```

---

## Shared Patterns

### Zod import
**Source:** `src/tools/article-tools.ts` line 5 and `src/anna/types.ts` line 1
**Apply to:** `src/tools/book-tools.ts`
```typescript
import * as z from "zod/v4";    // article-tools.ts style
// OR
import { z } from "zod/v4";    // types.ts style
```
Both styles are used in the project. Use `import * as z from "zod/v4"` in tool files to match `article-tools.ts`.

### Error handling (catch-all)
**Source:** `src/tools/article-tools.ts` lines 102–104
**Apply to:** `src/tools/book-tools.ts` `handleBookSearch`
```typescript
} catch (error) {
  return textResult(error instanceof Error ? error.message : "Book search failed", true);
}
```

### structuredContent response shape
**Source:** `src/tools/article-tools.ts` lines 86–101
**Apply to:** `src/tools/book-tools.ts`
```typescript
const structuredContent = {
  query: args.query,
  results,
};

if (results.length === 0) {
  return {
    content: [{ type: "text", text: `No books found for query: ${args.query}` }],
    structuredContent,
  };
}

return {
  content: [{ type: "text", text: jsonText(structuredContent) }],
  structuredContent,
};
```

### BaseUrlManager instantiation
**Source:** `src/tools/article-tools.ts` line 80
**Apply to:** `src/tools/book-tools.ts`
```typescript
const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
```

### Optional field → `undefined` (not `""`)
**Source:** `src/anna/parse.ts` lines 45–47 (article parser uses raw `.text().trim()` without `|| undefined`)
**Apply to:** `src/anna/parse.ts` `parseBookSearchResults` — books must apply `|| undefined` to every optional field per D-10:
```typescript
authors: authors || undefined,
publisher: publisher || undefined,
```
Note: The article parser does NOT apply `|| undefined` on authors/journal — this is an intentional difference for books per D-10.

---

## No Analog Found

None — all files have close analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/anna/`, `src/tools/`, `src/`, `tests/`
**Files scanned:** 8 source files read in full
**Pattern extraction date:** 2026-05-19
