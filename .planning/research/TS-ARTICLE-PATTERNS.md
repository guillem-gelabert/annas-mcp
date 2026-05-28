# Article Tool Patterns Reference

> Reference document for implementing `book_search` and `book_download` tools
> that are consistent with the existing `article_search` / `article_download` tools.
>
> Extracted from: `src/tools/article-tools.ts`, `src/anna/article-service.ts`,
> `src/anna/client.ts`, `src/anna/types.ts`, `src/config.ts`, `src/server.ts`,
> `tests/article-tools.test.ts`, `tests/anna.test.ts`

---

## 1. Schema Pattern (Zod)

All schemas use `zod/v4` (not `zod`).

```typescript
import * as z from "zod/v4";
```

### Input schemas: exported constants, used as `inputSchema` in `registerTool`

```typescript
export const articleSearchInputSchema = z.object({
  query: z.string().trim().min(1).describe("DOI or search keywords for articles"),
});

export const articleDownloadInputSchema = z.object({
  doi: z
    .string()
    .trim()
    .min(1)
    .regex(/^10\.\d{4,}[^\s]*$/, "Invalid DOI format")
    .describe("DOI of the article to resolve"),
  download: z.boolean().optional().describe("If true, download the PDF file to disk"),
  downloadPath: z
    .string()
    .optional()
    .describe("Absolute path to save the PDF. Overrides ANNAS_DOWNLOAD_PATH for this call."),
});
```

### Output schemas: exported constants, used as `outputSchema` in `registerTool`

Internal sub-schemas are not exported.

```typescript
// Private sub-schema (not exported)
const articleSchema = z.object({
  doi: z.string().optional(),
  title: z.string().optional(),
  authors: z.string().optional(),
  journal: z.string().optional(),
  size: z.string().optional(),
  hash: z.string().optional(),
  pageUrl: z.string().optional(),
  downloadUrl: z.string().optional(),
  filePath: z.string().optional(),
});

// Exported output schemas
export const articleSearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(articleSchema),
});

export const articleDownloadOutputSchema = z.object({
  article: articleSchema,
  sources: z.array(downloadSourceSchema),
  filePath: z.string().optional(),
});
```

### Rule: all entity fields are `.optional()`

The `Article` interface has all optional fields. Search results may be partially scraped.

---

## 2. Tool Registration Pattern

```typescript
export function registerArticleTools(server: McpServer, dependencies: ArticleToolDependencies): void {
  server.registerTool(
    "article_search",                    // snake_case tool name
    {
      title: "Article Search",           // Title Case
      description: "...",                // One sentence, includes key behaviour notes
      inputSchema: articleSearchInputSchema,
      outputSchema: articleSearchOutputSchema,
      annotations: {
        readOnlyHint: true,              // search = read-only + idempotent
        idempotentHint: true,
      },
    },
    (args) => handleArticleSearch(args, dependencies),
  );

  server.registerTool(
    "article_download",
    {
      title: "Article Download",
      description: "...",
      inputSchema: articleDownloadInputSchema,
      outputSchema: articleDownloadOutputSchema,
      annotations: {
        readOnlyHint: false,             // download = NOT read-only, NOT idempotent
        idempotentHint: false,
      },
    },
    (args) => handleArticleDownload(args, dependencies),
  );
}
```

### Annotation convention:
- Search tools: `readOnlyHint: true, idempotentHint: true`
- Download/resolve tools: `readOnlyHint: false, idempotentHint: false`

### Registration in server.ts:
```typescript
// src/server.ts
registerArticleTools(server, { config });
// No fetchImpl or baseUrlManager passed at startup — those are test-only overrides.
```

---

## 3. Dependency Injection Pattern

```typescript
export interface ArticleToolDependencies {
  config: AnnasConfig;
  fetchImpl?: FetchLike;        // Optional — tests inject mock, production uses global fetch
  baseUrlManager?: BaseUrlManager;  // Optional — tests inject to avoid network calls
}
```

- `config` is always required.
- `fetchImpl` and `baseUrlManager` are optional, only provided in tests.
- Handler creates a `BaseUrlManager` inline if one is not injected:
  ```typescript
  const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
  ```

For book tools, define `BookToolDependencies` with the same shape — replace `ArticleService` references with `BookService`.

---

## 4. Handler Pattern

Both handlers follow the same structure: try/catch, `withResolvedBaseUrl`, build `structuredContent`, return `{ content, structuredContent }`.

```typescript
export async function handleArticleSearch(
  args: z.infer<typeof articleSearchInputSchema>,
  dependencies: ArticleToolDependencies,
): Promise<CallToolResult> {
  try {
    const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
    const { results } = await withResolvedBaseUrl(
      dependencies,
      manager,
      (service) => service.searchArticles(args.query),
    );

    const structuredContent = { query: args.query, results };

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No articles found for query: ${args.query}` }],
        structuredContent,
      };
    }

    return {
      content: [{ type: "text", text: jsonText(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    return textResult(error instanceof Error ? error.message : "Article search failed", true);
  }
}
```

### Key points:
- `structuredContent` is always returned alongside `content[0].text` (same data as JSON).
- Empty results: return the human-readable "No X found" message but still set `structuredContent`.
- Errors: `textResult(message, true)` — `isError: true`.
- Domain-specific error types (`ArticleNotFoundError`) are caught and handled before the generic fallback:
  ```typescript
  if (error instanceof ArticleNotFoundError) {
    return textResult(error.message, true);
  }
  return textResult(error instanceof Error ? error.message : "Article download resolution failed", true);
  ```

### Two private helper functions shared by all handlers (do not duplicate):

```typescript
function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
```

These live in `article-tools.ts`. Book tools should either import them (if extracted to a shared module) or reproduce them locally in `book-tools.ts`. They are one-liners so duplication is acceptable if not extracted.

---

## 5. `withResolvedBaseUrl` / Offline Recovery Pattern

This function wraps every service call. It handles mirror rotation transparently.

```typescript
async function withResolvedBaseUrl<T>(
  dependencies: ArticleToolDependencies,   // <-- type is specific to article tools
  manager: BaseUrlManager,
  run: (service: ArticleService) => Promise<T>,
): Promise<{ results: T; baseUrl: string }>
```

**What it does:**
1. Calls `manager.resolveBaseUrl()` to get the current mirror hostname.
2. Instantiates `new ArticleService({ ...config, baseUrl }, fetchImpl)`.
3. Calls `run(service)`.
4. If the call throws and `isLikelyOfflineBaseUrlError(error)` is true:
   - If `config.manualBaseUrl` is set → throw a descriptive error telling user to fix config.
   - Otherwise → call `manager.updateBaseUrl()`, get refreshed URL, retry with a new service instance.
5. Returns `{ results, baseUrl }`.

**For book tools:** Create a parallel `withResolvedBookBaseUrl` (or make this generic). The signature is the same except the `run` callback receives a `BookService` instead of `ArticleService`. The offline recovery logic is identical — copy it verbatim.

```typescript
// Pattern to follow for books:
async function withResolvedBaseUrl<T>(
  dependencies: BookToolDependencies,
  manager: BaseUrlManager,
  run: (service: BookService) => Promise<T>,
): Promise<{ results: T; baseUrl: string }>
```

Alternatively, the function could be made generic over the service type if `ArticleService` and `BookService` share a common interface — but that requires refactoring the existing code.

---

## 6. Service Layer Pattern

```typescript
export class ArticleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArticleNotFoundError";
  }
}

export class ArticleService {
  private readonly client: AnnasClient;

  constructor(config: AnnasConfig, fetchImpl?: FetchLike) {
    this.client = new AnnasClient(config, fetchImpl);
  }

  async searchArticles(query: string): Promise<Article[]> { ... }
  async lookupArticleByDoi(doi: string): Promise<Article> { ... }
  async resolveArticleDownload(doi: string): Promise<ArticleDownloadResolution> { ... }
}
```

### Conventions:
- Service takes `config: AnnasConfig` and optional `fetchImpl?: FetchLike` — constructs `AnnasClient` internally.
- Domain-specific `NotFoundError` class (named `XxxNotFoundError`) is exported from the service file.
- Methods are async, return typed domain objects.
- `resolveDownload` accumulates sources with try/catch around each source type; partial results are valid.
  ```typescript
  try {
    const fastDownload = await this.client.fetchFastDownload(article.hash);
    if (fastDownload.download_url) {
      sources.push({ type: "fast_download", url: fastDownload.download_url });
    }
  } catch {
    // Fast download can fail; keep other fallback sources.
  }
  ```
- Detail enrichment failures are swallowed: `try { ... } catch { /* helpful but not required */ }`.

### For `BookService`:
- Create `BookNotFoundError` following the same pattern.
- Expose `searchBooks(query: string): Promise<Book[]>` and `resolveBookDownload(identifier: string): Promise<BookDownloadResolution>`.
- `BookService` takes same constructor signature: `(config: AnnasConfig, fetchImpl?: FetchLike)`.

---

## 7. HTTP Client Pattern

```typescript
export class AnnasClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: AnnasConfig,
    fetchImpl: FetchLike = fetch,   // default to global fetch; override in tests/service
  ) {
    this.fetchImpl = fetchImpl;
  }

  get baseOrigin(): string { return `https://${this.config.baseUrl}`; }

  // URL builders as methods (delegate to module-level pure functions)
  getSearchUrl(query: string): string { ... }
  getDetailUrl(hash: string): string { ... }

  async fetchText(url: string): Promise<string> {
    const response = await this.fetchImpl(url, {
      headers: { "User-Agent": BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new AnnasClientError(`Anna's Archive request failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  async fetchFastDownload(hash: string): Promise<FastDownloadResponse> {
    // ... same pattern but parses JSON and validates with Zod schema
    const raw = await response.json();
    const data = fastDownloadResponseSchema.parse(raw);
    if (data.error) {
      throw new AnnasClientError("API returned an error. Check server logs for details.");
    }
    return data;
  }
}
```

### Conventions:
- `BROWSER_USER_AGENT` constant is exported from `client.ts` — reuse it, do not duplicate.
- Timeout: `AbortSignal.timeout(20_000)` on all standard requests.
- Error type: `AnnasClientError` (exported) — used by `isLikelyOfflineBaseUrlError` in `base-url-manager.ts`.
- URL builder functions are module-level pure functions AND also exposed as instance methods on `AnnasClient`. Tests call the pure functions directly for unit testing URL shapes.
- JSON API responses are validated with a Zod schema (`fastDownloadResponseSchema`) before use.

### For book tools:
- `AnnasClient` is shared. Add new URL builder pure functions and corresponding instance methods to `AnnasClient` (e.g., `getBookSearchUrl`, `getBookDetailUrl`).
- Add a `fetchBookDetail` or similar method following the `fetchFastDownload` pattern if the book API returns JSON.
- If books use a different search content type param: `content: "book"` instead of `content: "journal"`.

---

## 8. Type Conventions (`types.ts`)

```typescript
// Domain entity — all fields optional (partial scraping is normal)
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

// Source union
export interface DownloadSource {
  type: "fast_download" | "scidb";
  url: string;
}

// Resolution result
export interface ArticleDownloadResolution {
  article: Article;
  sources: DownloadSource[];
}

// Zod-validated API response
export const fastDownloadResponseSchema = z.object({
  download_url: z.string().startsWith("https://").optional(),
  error: z.string().optional(),
});
export type FastDownloadResponse = z.infer<typeof fastDownloadResponseSchema>;

// Fetch abstraction (for DI in tests)
export interface FetchLike {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}
```

### For books, add to `types.ts`:

```typescript
export interface Book {
  isbn?: string;       // or whatever the book identifier is
  title?: string;
  authors?: string;
  publisher?: string;
  year?: string;
  language?: string;
  size?: string;
  format?: string;     // epub, pdf, etc.
  hash?: string;
  pageUrl?: string;
  downloadUrl?: string;
}

export interface BookDownloadResolution {
  book: Book;
  sources: DownloadSource[];  // DownloadSource is shared — reuse it
}
```

Note: `DownloadSource` is reusable as-is. Do not create `BookDownloadSource`.

---

## 9. Config Shape

```typescript
export interface AnnasConfig {
  secretKey: string;
  baseUrl: string;         // hostname only, no protocol, no trailing slash
  manualBaseUrl: boolean;  // true if ANNAS_BASE_URL was explicitly set
  downloadPath: string | null;
}
```

- `downloadPath` is `null` if `ANNAS_DOWNLOAD_PATH` is unset.
- `baseUrl` is normalised (protocol stripped, trailing slash removed) by `normalizeBaseUrl()`.
- No changes needed to `AnnasConfig` for book tools — books use the same base URL and secret key.

---

## 10. File Download Pattern (`saveArticleFile`)

This is a private function in `article-tools.ts`. It is **PDF-specific in two places** and **generic everywhere else**.

### PDF-specific parts:
1. **Magic bytes check:** `if (!firstBytes.startsWith("%PDF-"))` — hard-coded for PDF.
2. **Extension fallback:** `getFileExtension` returns `.pdf` as default when content-type is `application/pdf` or unrecognised.
3. **Source type priority:** `fast_download` is tried before `scidb`.

### Generic parts (reuse for books):
- `validateDownloadUrl` — HTTPS enforcement, private IP block list. Reuse as-is.
- `sanitizeFilename` — strips dangerous characters. Reuse as-is.
- `safeJoinPath` — prevents path traversal. Reuse as-is.
- Collision handling (`_2`, `_3` suffix loop). Identical pattern.
- Atomic write: download to `.tmp`, rename on success, `rm` on failure. Identical pattern.
- `AbortController` + timeout (20s standard, 300s for scidb). Same timeouts apply.
- Redirect rejection: `redirect: "error"`. Same security requirement.
- HTML response detection: `content-type: text/html` throws. Same check needed.
- 100 MB cap (`MAX_BYTES`). Same cap is appropriate.
- Permissions: `mode: 0o600`. Same.

### What to change for `saveBookFile`:
- Accept `BookDownloadResolution` instead of `ArticleDownloadResolution`.
- Use `book.title || book.isbn || "book"` for filename base instead of `article.title || article.doi`.
- Change the magic bytes check: epub starts with `PK` (zip), mobi starts with bytes `\x00\x00\x00\x00`. Or make the check format-aware based on `content-type`.
- Update `getFileExtension` to map `application/epub+zip` → `.epub`, `application/x-mobipocket-ebook` → `.mobi`, etc., or fall back to extension from content-disposition.

### Function signature to mirror:
```typescript
async function saveArticleFile(
  resolution: ArticleDownloadResolution,
  downloadPath: string,
  fetchImpl?: FetchLike,
): Promise<string>
```

---

## 11. Test Patterns

**Framework:** `bun:test` — `describe`, `test`, `expect` from `"bun:test"`.

### Two test files per feature area:

| File | What it tests |
|------|--------------|
| `tests/anna.test.ts` | URL builders, parsers, `ArticleService` methods directly |
| `tests/article-tools.test.ts` | MCP handler functions (`handleArticleSearch`, `handleArticleDownload`) |

### Mock structure — `FetchLike` function:

```typescript
const fetchMock: FetchLike = async (input) => {
  const url = String(input);
  if (url.includes("/scidb/10.1038%2Fnature12345")) return response(searchHtml);
  if (url.includes("/md5/abc123def456")) return response(detailHtml);
  if (url.includes("/dyn/api/fast_download.json")) return Response.json({ download_url: "https://download.example/paper.pdf" });
  throw new Error(`Unexpected URL: ${url}`);
};
```

Route by `url.includes(...)`. Throw on unrecognised URLs so tests fail fast.

### Config fixture:

```typescript
const config: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: true,    // prevents withResolvedBaseUrl from trying to discover mirrors
  downloadPath: null,
};
```

`manualBaseUrl: true` is critical — it prevents the `BaseUrlManager` from making network calls during tests.

### Helper:

```typescript
function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init });
}

function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
  const item = result.content[0];
  expect(item?.type).toBe("text");
  return item?.text ?? "";
}
```

### Assertion pattern for successful results:

```typescript
expect(result.isError).toBeUndefined();       // not false — undefined means success
expect(result.structuredContent).toEqual({ ... });
// or for partial matching:
expect(result.structuredContent).toMatchObject({ ... });
```

### Assertion pattern for errors:

```typescript
expect(result.isError).toBe(true);
expect(firstText(result)).toContain("request failed");
```

### URL construction unit tests (pure functions):

```typescript
test("builds book search URL", () => {
  expect(bookSearchUrl(config, "dune")).toBe(
    "https://annas-archive.li/search?q=dune&content=book_any",  // hypothetical
  );
});
```

---

## 12. File Structure to Follow

```
src/
  anna/
    types.ts              -- add Book, BookDownloadResolution interfaces
    client.ts             -- add getBookSearchUrl(), getBookDetailUrl() methods + pure functions
    article-service.ts    -- existing, do not modify
    book-service.ts       -- new, mirrors article-service.ts structure
    parse.ts              -- add parseBookSearchResults(), parseBookDetail(), parseFirstBookHash()
  tools/
    article-tools.ts      -- existing, do not modify
    book-tools.ts         -- new, mirrors article-tools.ts structure
  server.ts               -- add: import { registerBookTools } from "./tools/book-tools"
                          --      registerBookTools(server, { config });

tests/
  anna.test.ts            -- add book URL builder + parser tests
  book-tools.test.ts      -- new, mirrors article-tools.test.ts
```

---

## 13. What to Reuse vs. Duplicate

| Item | Action |
|------|--------|
| `FetchLike` interface | Reuse from `types.ts` |
| `AnnasConfig` | Reuse unchanged |
| `AnnasClient` | Extend with book URL methods |
| `AnnasClientError` | Reuse — thrown by client, caught by `isLikelyOfflineBaseUrlError` |
| `BROWSER_USER_AGENT` | Reuse from `client.ts` |
| `DownloadSource` interface | Reuse from `types.ts` |
| `BaseUrlManager` | Reuse — same instance, same logic |
| `withResolvedBaseUrl` | Copy the function to `book-tools.ts`, replace `ArticleService` with `BookService` |
| `textResult` / `jsonText` | Duplicate locally in `book-tools.ts` (two one-liners; not worth a shared module) |
| `validateDownloadUrl` | Move to shared util OR duplicate — currently private in `article-tools.ts` |
| `sanitizeFilename` / `safeJoinPath` | Same as above |
| `saveArticleFile` | Copy and adapt to `saveBookFile` with format-specific magic bytes |
| Test `config` fixture | Duplicate in `book-tools.test.ts` — identical values |
| Test `response()` helper | Duplicate in each test file (it's a two-liner) |

> `validateDownloadUrl`, `sanitizeFilename`, and `safeJoinPath` are security-critical.
> If you duplicate them, keep them byte-for-byte identical. Preferred: extract to
> `src/anna/file-utils.ts` and import in both `article-tools.ts` and `book-tools.ts`.
