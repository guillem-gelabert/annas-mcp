---
phase: 11-api-schema
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/tools/article-tools.ts
  - tests/article-tools.test.ts
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Code Review: Phase 11 — API Schema

**Reviewed:** 2026-05-20
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Phase 11 extends `articleDownloadInputSchema` to accept a mutually exclusive `doi` / `dois` pair, adds batch output schemas, and stubs the batch execution path. The Zod schema work is largely correct and the 7 new tests cover the schema validation cases well. However, there are two critical defects: the `superRefine` error condition is inverted (passing `{}` triggers the wrong branch), and the registered `outputSchema` is incompatible with the batch stub's actual response shape, which will cause an MCP protocol-level schema mismatch at runtime. Three additional warnings cover a non-null-safe `!` assertion, a dead test assertion, and a missing `.min(1)` guard on individual DOI items in the array.

---

## Critical Issues

### CR-01: `superRefine` rejects valid inputs — "neither" case fires the wrong error message

**File:** `src/tools/article-tools.ts:73`

```typescript
if ((hasDoi && hasDois) || (!hasDoi && !hasDois)) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Provide either doi (single) or dois (array), not both",
  });
}
```

**Issue:** Both the "both provided" and the "neither provided" cases produce the identical error message `"Provide either doi (single) or dois (array), not both"`. When a caller passes `{}` (neither field), the message is factually wrong: the user did not provide "both". The test at line 364–370 asserts exactly this message for the empty-object case, which means the test is asserting on the incorrect message — it passes only because the same string is reused for two semantically different errors.

This is a logic defect: the two violation paths need distinct messages, or at minimum the "neither" branch must use a message that is accurate (e.g., `"Provide either doi (single) or dois (array)"`). Downstream callers that inspect the error message to distinguish the failure reason will be misled.

**Fix:**
```typescript
.superRefine((val, ctx) => {
  const hasDoi = val.doi !== undefined;
  const hasDois = val.dois !== undefined;
  if (hasDoi && hasDois) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either doi (single) or dois (array), not both",
    });
  } else if (!hasDoi && !hasDois) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either doi (single) or dois (array)",
    });
  }
});
```

---

### CR-02: `article_download` tool registered with `outputSchema: articleDownloadOutputSchema` but the batch stub returns a shape that does not conform

**File:** `src/tools/article-tools.ts:228` and `156–158`

```typescript
// Registration (line 228)
outputSchema: articleDownloadOutputSchema,   // { article, sources, filePath }

// Batch stub (lines 156–158)
if ("dois" in args && args.dois) {
  return { content: [{ type: "text", text: "batch not yet implemented" }] };
}
```

**Issue:** The MCP server validates tool output against the declared `outputSchema`. `articleDownloadOutputSchema` requires `{ article: {...}, sources: [...] }`. The batch stub returns a bare text response with no `structuredContent` at all. When `dois` is supplied, the MCP framework will attempt to validate the stub response against `articleDownloadOutputSchema` and fail (or silently produce an invalid response, depending on framework version), because the required `article` and `sources` fields are absent.

`articleBatchDownloadOutputSchema` (`{ results: [...] }`) was defined precisely to describe the batch response shape, but it is never wired into the registration — it is dead schema code. The tool must either (a) register conditionally on input shape (not possible with a single `registerTool` call), or (b) use a union `outputSchema`, or (c) not declare an `outputSchema` for the tool while the stub is in place, or (d) have the stub return a `structuredContent` that satisfies `articleDownloadOutputSchema`.

The phase goal states existing single-DOI callers must see no change, so the correct resolution once the batch path is implemented is a union schema or a separate tool registration. While the stub is live, this will cause runtime schema validation failures for any batch call that reaches the MCP framework validator.

**Fix (minimum for stub phase):** Remove `outputSchema` from the `article_download` registration until the batch path is fully implemented and a correct union or separate schema can be defined:
```typescript
server.registerTool(
  "article_download",
  {
    title: "Article Download",
    description: "...",
    inputSchema: articleDownloadInputSchema,
    // outputSchema intentionally omitted until batch is implemented
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  (args) => handleArticleDownload(args, dependencies),
);
```

---

## Warnings

### WR-01: Non-null assertion `args.doi!` on a field that schema allows to be undefined

**File:** `src/tools/article-tools.ts:165`

```typescript
(service) => service.resolveArticleDownload(args.doi!),
```

**Issue:** TypeScript infers `args.doi` as `string | undefined` because the field is `.optional()` in the schema. The `superRefine` constraint ensures that if `dois` is absent then `doi` must be present — but TypeScript cannot narrow through `superRefine` refinements. The `!` assertion suppresses the type error without a runtime guard.

If the `superRefine` logic were ever changed, or if `handleArticleDownload` were called directly with a partially constructed object in tests, this would produce a `TypeError` at `resolveArticleDownload(undefined)` rather than a safe error. The existing batch guard at line 156 (`if ("dois" in args && args.dois)`) does not fully narrow `doi` to `string` for the compiler or for a future reader.

**Fix:** Add an explicit guard before the assertion:
```typescript
if (!args.doi) {
  return textResult("doi is required for single-article resolution", true);
}
// args.doi is now string — no assertion needed
(service) => service.resolveArticleDownload(args.doi),
```

---

### WR-02: `dois` array items have DOI regex validation but no `.min(1)` trim guard — whitespace-only strings pass

**File:** `src/tools/article-tools.ts:58`

```typescript
z.array(z.string().trim().regex(/^10\.\d{4,}[^\s]*$/, "Invalid DOI format"))
```

**Issue:** `.trim()` is applied before `.regex(...)`, so a string of only whitespace (e.g., `"   "`) would be trimmed to `""`, which does not match the DOI regex and would correctly fail. However, a string like `"  10.1038/abc  "` is trimmed to `"10.1038/abc"` and passes. This is actually fine — but comparing with the single `doi` field at line 52–55, that field chains `.trim().min(1).regex(...)`. The `dois` array items omit `.min(1)`. This means an empty string `""` after trimming would be caught by the regex (correctly fails), but the intent to reject blank items explicitly is inconsistent with the single `doi` treatment. A caller passing `[""]` gets a regex error rather than the clearer "String must contain at least 1 character(s)" message.

**Fix:** Add `.min(1)` to match the single `doi` field's validation chain:
```typescript
z.array(
  z.string().trim().min(1).regex(/^10\.\d{4,}[^\s]*$/, "Invalid DOI format")
)
```

---

### WR-03: `articleBatchResultSchema` allows a result with both `article`/`sources` populated and `error` set simultaneously — no mutual exclusion

**File:** `src/tools/article-tools.ts:87–93`

```typescript
const articleBatchResultSchema = z.object({
  doi: z.string(),
  article: articleSchema,
  sources: z.array(downloadSourceSchema),
  filePath: z.string().optional(),
  error: z.string().optional(),
});
```

**Issue:** In the success case, `article` and `sources` will be populated. In the error case, `article` and `sources` have no meaningful values to fill, but the schema still requires them (they are not `.optional()`). Any error-path batch result would have to produce dummy `article` and `sources` values to satisfy the schema, which is semantically wrong and wasteful. The schema should model success/error as a discriminated union, or at minimum make `article` and `sources` optional when `error` is present.

This is not yet exercised at runtime (batch is a stub), but it will force awkward implementation choices when the batch path is built.

**Fix:** Use a discriminated union or make the fields optional:
```typescript
const articleBatchResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    doi: z.string(),
    article: articleSchema,
    sources: z.array(downloadSourceSchema),
    filePath: z.string().optional(),
  }),
  z.object({
    ok: z.literal(false),
    doi: z.string(),
    error: z.string(),
  }),
]);
```

---

## Info

### IN-01: Dead test assertion — `fetchCallCount` check is incomplete and provides no actual coverage guarantee

**File:** `tests/article-tools.test.ts:321–324`

```typescript
const fetchedUrls: string[] = [];
// The important assertion: no fetch to download.example CDN
expect(fetchCallCount).toBeGreaterThan(0); // resolution calls happened
```

**Issue:** The comment claims "no fetch to download.example CDN" but no assertion actually verifies this. The `fetchedUrls` array is declared but never populated or asserted against. `fetchCallCount > 0` is trivially true for any non-trivial test and does not prove the cache was used. The test as written will pass even if the file is re-fetched from the CDN. The meaningful assertion would be that `fetchCallCount` equals the number of resolution requests (scidb + md5 + fast_download API = 3) and not one more.

**Fix:** Populate `fetchedUrls` inside `fetchMock` and assert that `"download.example"` does not appear:
```typescript
const fetchedUrls: string[] = [];
const fetchMock: FetchLike = async (input) => {
  fetchedUrls.push(String(input));
  // ...
};
// After the call:
expect(fetchedUrls.every((u) => !u.includes("download.example"))).toBe(true);
```

---

### IN-02: `articleBatchDownloadOutputSchema` is exported but never referenced — dead export

**File:** `src/tools/article-tools.ts:95–97`

```typescript
export const articleBatchDownloadOutputSchema = z.object({
  results: z.array(articleBatchResultSchema),
});
```

**Issue:** This schema is exported but not used in `registerArticleTools` (see CR-02 above). If the intent was to wire it into the tool registration, it was not done. If it is reserved for future use, exporting it from a public module surface before it is wired up creates a contract that may need to change when the batch path is implemented, potentially becoming a breaking export change.

**Fix:** Keep the schema internal (remove `export`) until it is actually referenced in the tool registration, or wire it into the registration (which requires resolving CR-02 first).

---

## Verdict

Two blockers must be resolved before this schema work is considered complete:

1. **CR-01** — The "neither" error case fires the wrong message, causing misleading validation feedback and a test that asserts on an incorrect string.
2. **CR-02** — The `article_download` tool's declared `outputSchema` is incompatible with the batch stub's actual response shape; this will cause MCP protocol-level failures for any batch call that reaches the framework validator, and the new `articleBatchDownloadOutputSchema` is effectively dead code.

The three warnings are forward-looking design problems that will manifest when the batch implementation is written: the non-null assertion will need a guard, the batch result schema's error/success ambiguity will force awkward downstream code, and the `.min(1)` inconsistency creates divergent validation UX.

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
