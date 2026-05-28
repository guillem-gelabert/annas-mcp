# Phase 15: CrossRef Client - Pattern Map

**Mapped:** 2026-05-27
**Files analyzed:** 2 (1 source module + 1 test file)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/anna/crossref-client.ts` | utility/service | request-response | `src/anna/base-url-manager.ts` (standalone fetch pattern) + `src/anna/client.ts` (constant + fetchImpl pattern) | role-match (exact pattern, no class wrapper) |
| `tests/crossref-client.test.ts` | test | request-response | `tests/article-tools.test.ts` + `tests/base-url.test.ts` | role-match |

---

## Pattern Assignments

### `src/anna/crossref-client.ts` (utility, request-response)

**Primary analog:** `src/anna/client.ts`
**Secondary analog:** `src/anna/base-url-manager.ts` (lines 196–199)

**Imports pattern** (`src/anna/client.ts` lines 1–4):
```typescript
import type { FetchLike } from "./types";
```
Only the `FetchLike` type import is needed — no other project imports required.

**Constant pattern** (`src/anna/client.ts` lines 6–7):
```typescript
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
```
Follow exactly: module-level `const`, not exported, SCREAMING_SNAKE_CASE name. For this file:
```typescript
const CROSSREF_USER_AGENT = "annas-mcp-ts/1.4 (mailto:noreply@example.com)";
const CROSSREF_TIMEOUT_MS = 5000;
```

**fetchImpl injection pattern** (`src/anna/client.ts` lines 63–65 — constructor-level; adapt to function-level):
```typescript
// Class analog (constructor injection):
constructor(
  private readonly config: AnnasConfig,
  fetchImpl: FetchLike = fetch,
) {

// Function-level adaptation for this module (no class, no state):
export async function fetchCrossRefTitle(
  doi: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
```

**AbortSignal.timeout() pattern** (`src/anna/base-url-manager.ts` lines 196–199):
```typescript
const response = await this.fetchImpl(`${WIKIPEDIA_API_URL}?${params.toString()}`, {
  headers: { "User-Agent": BROWSER_USER_AGENT },
  signal: AbortSignal.timeout(WIKIPEDIA_FETCH_TIMEOUT_MS),
});
```
Adapt directly: replace `this.fetchImpl` with `fetchImpl`, swap constant names. The signal placement inside the options object is identical.

**response.ok guard pattern** (`src/anna/client.ts` lines 101–103):
```typescript
if (!response.ok) {
  throw new AnnasClientError(`Anna's Archive request failed: ${response.status} ${response.statusText}`);
}
```
For this module: `if (!response.ok) return null;` — no throw, consistent with silent-null contract.

**DOI URL encoding pattern** (`src/anna/client.ts` line 39):
```typescript
return `${originFor(config.baseUrl)}/scidb/${encodeURIComponent(doi)}`;
```
Use `encodeURIComponent(doi)` in the URL construction. For this module:
```typescript
const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
```

**Core try/catch pattern** — the closest full analog in `src/anna/client.ts` lines 112–124 shows try/catch that rethrows; adapt to silent-null return (this pattern is established but for a different failure contract — the null-return contract is stated in CONTEXT.md, not in a single codebase example):
```typescript
try {
  const response = await fetchImpl(url, {
    headers: { "User-Agent": CROSSREF_USER_AGENT },
    signal: AbortSignal.timeout(CROSSREF_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const data = await response.json() as { message?: { title?: string[] } };
  return data?.message?.title?.[0] ?? null;
} catch {
  return null;
}
```

---

### `tests/crossref-client.test.ts` (test, request-response)

**Primary analog:** `tests/article-tools.test.ts`
**Secondary analog:** `tests/base-url.test.ts`

**Test file imports pattern** (`tests/article-tools.test.ts` lines 1–9):
```typescript
import { describe, expect, test } from "bun:test";

import {
  handleArticleDownload,
  handleArticleSearch,
  articleDownloadInputSchema,
} from "../src/tools/article-tools";
import type { FetchLike } from "../src/anna/types";
```
Follow exactly: `bun:test` imports first, blank line, then project imports. Import `FetchLike` as a type.

**Mock fetch pattern** (`tests/article-tools.test.ts` lines 53, 74, 84–96):
```typescript
// Simple single-response mock:
const fetchMock: FetchLike = async () => response(searchHtml);

// URL-discriminating mock:
const fetchMock: FetchLike = async (input) => {
  const url = String(input);
  if (url.includes("/scidb/10.1038%2Fnature12345")) {
    return response(searchHtml);
  }
  throw new Error(`Unexpected URL: ${url}`);
};
```
Use `FetchLike` type annotation on mock. Construct responses with `new Response(JSON.stringify(...), { status: 200 })` or `Response.json(...)`.

**describe/test block pattern** (`tests/article-tools.test.ts` lines 51–81):
```typescript
describe("article MCP handlers", () => {
  test("article_search returns structured results", async () => {
    const fetchMock: FetchLike = async () => response(searchHtml);
    const result = await handleArticleSearch(..., { config, fetchImpl: fetchMock });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ ... });
  });

  test("article_search returns clear no-results response", async () => {
    ...
  });
});
```
Adapt: wrap all cases in a single `describe("fetchCrossRefTitle", ...)` block. Each `test()` should:
- Declare a typed `fetchMock: FetchLike`
- Call `fetchCrossRefTitle(doi, fetchMock)`
- Assert the return value directly with `expect(...).toBe(...)` / `expect(...).toBeNull()`

**Error/failure mock pattern** — no real network calls allowed. Simulate failures by:
```typescript
// Network error:
const fetchMock: FetchLike = async () => { throw new Error("network failure"); };

// Timeout (AbortSignal throws DOMException):
const fetchMock: FetchLike = async () => { throw new DOMException("timeout", "TimeoutError"); };

// Non-200:
const fetchMock: FetchLike = async () => new Response("{}", { status: 404 });
```

---

## Shared Patterns

### FetchLike injection
**Source:** `src/anna/types.ts` lines 48–50
**Apply to:** `src/anna/crossref-client.ts` (function parameter) and `tests/crossref-client.test.ts` (mock typing)
```typescript
export interface FetchLike {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}
```
Import as `import type { FetchLike } from "./types"` in the source module, and `import type { FetchLike } from "../src/anna/types"` in the test file.

### AbortSignal.timeout() usage
**Source:** `src/anna/base-url-manager.ts` lines 196–199
**Apply to:** `src/anna/crossref-client.ts`
```typescript
signal: AbortSignal.timeout(WIKIPEDIA_FETCH_TIMEOUT_MS),
```
Placed inside the `RequestInit` object passed to `fetchImpl`. No special handling for the thrown `TimeoutError` — the outer `catch { return null; }` absorbs it.

### Silent null-return failure contract
**Source:** Pattern stated in CONTEXT.md and RESEARCH.md — not thrown in `client.ts` (which uses AnnasClientError) but consistent with the wider informational verification design.
**Apply to:** `src/anna/crossref-client.ts` — every code path that would otherwise throw or propagate an error must instead `return null`.
No `console.error`, no re-throw. Wrap the entire fetch + parse block in a single `try { ... } catch { return null; }`.

### encodeURIComponent for DOIs in URLs
**Source:** `src/anna/client.ts` line 39
**Apply to:** `src/anna/crossref-client.ts` URL construction
```typescript
return `${originFor(config.baseUrl)}/scidb/${encodeURIComponent(doi)}`;
```

---

## No Analog Found

All required patterns have close analogs in the codebase. No files lack a model.

---

## Metadata

**Analog search scope:** `src/anna/`, `tests/`
**Files scanned:** `src/anna/client.ts`, `src/anna/types.ts`, `src/anna/base-url-manager.ts` (lines 185–215), `tests/article-tools.test.ts` (lines 1–139), `tests/anna.test.ts` (lines 1–80), `tests/base-url.test.ts` (lines 1–70)
**Pattern extraction date:** 2026-05-27
