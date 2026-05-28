# Phase 16: Confidence Logic - Pattern Map

**Mapped:** 2026-05-27
**Files analyzed:** 2 (1 implementation + 1 test)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/anna/confidence.ts` | utility | transform | `src/anna/crossref-client.ts` | role-match (pure exports, no class, module-private helpers) |
| `tests/confidence.test.ts` | test | transform | `tests/crossref-client.test.ts` | exact (same describe/test structure, same bun:test imports) |

---

## Pattern Assignments

### `src/anna/confidence.ts` (utility, transform)

**Analog:** `src/anna/crossref-client.ts`

**Why this analog:** Both are self-contained modules in `src/anna/` that export one or two public symbols and keep internal helpers private. `crossref-client.ts` is the most recently added file in the same directory and represents the current project pattern for pure-function modules: module-private constants/helpers at the top, one exported function at the bottom, no class, no default export.

**Imports pattern** (`src/anna/crossref-client.ts` lines 1-2):
```typescript
import { z } from "zod/v4";
import type { FetchLike } from "./types";
```
For `confidence.ts`: **no imports are needed** — the module is entirely self-contained. The `ConfidenceLevel` type is defined inline as a string literal union.

**Module-private constants pattern** (`src/anna/crossref-client.ts` lines 10-11):
```typescript
const CROSSREF_USER_AGENT = "annas-mcp-ts/1.4 (mailto:noreply@example.com)";
const CROSSREF_TIMEOUT_MS = 5000;
```
For `confidence.ts`: use a module-private constant for the threshold rather than a magic number:
```typescript
const JACCARD_THRESHOLD = 0.5;
```

**Module-private helper pattern** (`src/anna/crossref-client.ts` lines 4-8 — Zod schema as module-private):
```typescript
const crossRefWorkSchema = z.object({
  message: z.object({
    title: z.array(z.string()).optional(),
  }).optional(),
});
```
Analogously in `confidence.ts`, `normalizeTitle` and `jaccardSimilarity` are module-private (no `export` keyword), declared above the exported function.

**Exported function signature pattern** (`src/anna/crossref-client.ts` lines 13):
```typescript
export async function fetchCrossRefTitle(doi: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
```
For `confidence.ts` — synchronous, typed return, no default parameter needed:
```typescript
export function computeConfidence(
  annasTitle: string,
  crossrefTitle: string | null
): ConfidenceLevel {
```

**Error/edge-case guard pattern** (`src/anna/crossref-client.ts` lines 20, 23-24):
```typescript
if (!response.ok) return null;
// ...
if (!parsed.success) return null;
return parsed.data?.message?.title?.[0] ?? null;
```
For `confidence.ts` — guard on null input first, then on empty sets:
```typescript
if (crossrefTitle === null) return "unverified";
// ... normalize both ...
if (a.size === 0 && b.size === 0) return "high";
if (a.size === 0 || b.size === 0) return "low";
```

**Type export pattern** (`src/anna/types.ts` lines 46):
```typescript
export type FastDownloadResponse = z.infer<typeof fastDownloadResponseSchema>;
```
For `confidence.ts` — declare as a top-level named `export type`, separate from the function, so Phase 17 can import it independently:
```typescript
export type ConfidenceLevel = "high" | "low" | "unverified";
```

**Also note:** `src/anna/parse.ts` exports multiple pure functions (lines 8-19) with no imports other than types — confirms the pattern of exporting named functions without classes is established across the `src/anna/` module.

---

### `tests/confidence.test.ts` (test, transform)

**Analog:** `tests/crossref-client.test.ts`

**Why this analog:** Exact match — same module under test (`src/anna/`), same test runner (`bun:test`), same `describe`/`test` structure, synchronous assertions instead of async (since `computeConfidence` is sync).

**Imports pattern** (`tests/crossref-client.test.ts` lines 1-4):
```typescript
import { describe, expect, test } from "bun:test";

import { fetchCrossRefTitle } from "../src/anna/crossref-client";
import type { FetchLike } from "../src/anna/types";
```
For `confidence.test.ts` — no type import needed, only the function and optionally the type:
```typescript
import { describe, expect, test } from "bun:test";

import { computeConfidence } from "../src/anna/confidence";
import type { ConfidenceLevel } from "../src/anna/confidence";
```

**describe/test block structure** (`tests/crossref-client.test.ts` lines 6-88):
```typescript
describe("fetchCrossRefTitle", () => {
  test("returns title string on HTTP 200 with title array", async () => {
    // ... arrange ...
    const result = await fetchCrossRefTitle("10.1038/nature12345", fetchMock);
    expect(result).toBe("Some Title");
  });

  test("returns null on HTTP 404", async () => {
    // ...
    expect(result).toBeNull();
  });
  // ...
});
```
For `confidence.test.ts` — synchronous, no mock needed:
```typescript
describe("computeConfidence", () => {
  test('returns "unverified" when crossrefTitle is null', () => {
    expect(computeConfidence("Any Title", null)).toBe("unverified");
  });

  test('returns "high" for identical titles', () => {
    expect(computeConfidence("A Study of X", "A Study of X")).toBe("high");
  });
  // one test per edge case listed in CONTEXT.md
});
```

**Assertion style** (`tests/crossref-client.test.ts` lines 16, 27, 36):
```typescript
expect(result).toBe("Some Title");
expect(result).toBeNull();
```
For `confidence.test.ts` — use `expect(...).toBe("high")`, `expect(...).toBe("low")`, `expect(...).toBe("unverified")` — never `toEqual` for string literals.

---

## Shared Patterns

### Type export convention
**Source:** `src/anna/types.ts` line 46 and `src/anna/crossref-client.ts` (no type re-export pattern — types live in `types.ts` or the module that defines them)
**Apply to:** `src/anna/confidence.ts`

Since `ConfidenceLevel` is Phase 16's own domain type (not a general infrastructure type like `FetchLike`), it lives in `confidence.ts` itself as a top-level `export type`. This mirrors how `FastDownloadResponse` is defined alongside the schema that produces it, not moved to `types.ts`.

### No default exports
**Source:** All files in `src/anna/` — `crossref-client.ts`, `parse.ts`, `tool-utils.ts`, `types.ts`
**Apply to:** `src/anna/confidence.ts` and `tests/confidence.test.ts`

Zero default exports anywhere in the project. Use named exports only.

### Import grouping / blank line separator
**Source:** `tests/crossref-client.test.ts` lines 1-4:
```typescript
import { describe, expect, test } from "bun:test";

import { fetchCrossRefTitle } from "../src/anna/crossref-client";
import type { FetchLike } from "../src/anna/types";
```
Blank line separates the test-runner import block from the subject-under-test import block. Apply the same grouping in `tests/confidence.test.ts`.

---

## No Analog Found

None. Both new files have strong analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/anna/`, `tests/`
**Files scanned:** 9 source files, 8 test files
**Pattern extraction date:** 2026-05-27
