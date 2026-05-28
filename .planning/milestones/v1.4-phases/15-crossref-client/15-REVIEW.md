---
phase: 15-crossref-client
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/anna/crossref-client.ts
  - tests/crossref-client.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-05-27
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

`crossref-client.ts` is a small, focused module (19 lines) that wraps the CrossRef REST API to retrieve a paper's title by DOI. The test suite covers the main happy path and several null-return branches. While the implementation is simple, several correctness, security, and quality issues are present: the exported function is never imported by any module in the codebase (dead export), the User-Agent contact email is a non-functional placeholder that violates CrossRef's Etiquette policy, the bare `catch {}` swallows all errors silently making debugging impossible, the AbortSignal.timeout approach is not tested for cancellation side effects, and the test suite hard-codes the User-Agent string in a way that will silently pass even if the constant drifts.

---

## Critical Issues

### CR-01: Hardcoded placeholder email in User-Agent violates CrossRef Etiquette and may lead to rate-limiting or blocking

**File:** `src/anna/crossref-client.ts:3`
**Issue:** The CrossRef Polite Pool requires a real, monitored contact email in the `User-Agent` `mailto:` field. The value `noreply@example.com` is not a real address; `example.com` is a reserved domain. CrossRef's API documentation explicitly states that supplying a real email gains access to the faster "polite pool" and that fake or unmonitored addresses are grounds for removal from it. Any production traffic using this string will either be silently routed to the unthrottled pool or, if CrossRef updates its policy, blocked. This is a deployment-correctness defect, not merely a style issue.

**Fix:** Replace the placeholder with the real maintainer email, and ideally pull it from an environment variable so it does not need to be hard-coded:

```typescript
const CROSSREF_USER_AGENT =
  `annas-mcp-ts/1.4 (mailto:${process.env.CROSSREF_CONTACT_EMAIL ?? "your-real-email@example.com"})`;
```

Alternatively, use the project owner's real address as a constant if environment configuration is not available.

---

## Warnings

### WR-01: `fetchCrossRefTitle` is exported but never imported — dead export

**File:** `src/anna/crossref-client.ts:6`
**Issue:** A grep across all `src/` TypeScript files confirms that `fetchCrossRefTitle` is not imported anywhere. The module exists in isolation. Either the wiring into a consuming module (e.g., `article-service.ts`) was omitted from this phase, or the function was written speculatively. A dead export means the feature has no observable effect on the running application: it will never be called.

**Fix:** Import and call `fetchCrossRefTitle` from the appropriate service layer (likely `src/anna/article-service.ts`) at the point where a DOI is available but the title is missing or needs verification. If the function is intentionally deferred, add a `TODO` comment with a tracking note so it is not silently forgotten.

---

### WR-02: Bare `catch {}` silently discards all error information

**File:** `src/anna/crossref-client.ts:16-18`
**Issue:** The `catch` block returns `null` without logging or re-throwing, which means network errors, malformed JSON responses, unexpected API shapes, and programmer errors (e.g., a future refactor breaking the type cast) all produce the same silent `null`. This makes it impossible to distinguish "DOI not found" from "network is down" from "the JSON parsing threw a SyntaxError". Callers cannot differentiate transient failures from permanent ones.

```typescript
  } catch {
    return null;
  }
```

**Fix:** At minimum, distinguish `AbortError`/`TimeoutError` (expected) from unexpected errors (should be logged):

```typescript
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return null; // expected: request timed out
    }
    if (err instanceof TypeError) {
      return null; // expected: network failure
    }
    // Unexpected: re-throw so callers and monitoring can see it
    throw err;
  }
```

If a fully-silent strategy is truly desired, at least add a `console.error` or structured log so failures are observable in production.

---

### WR-03: `response.json()` is cast with `as` without any runtime validation — type safety is illusory

**File:** `src/anna/crossref-client.ts:14`
**Issue:** The API response is cast via `as { message?: { title?: string[] } }`. This is a TypeScript compile-time assertion only — it provides no runtime guarantee. If CrossRef changes its response shape (e.g., `title` becomes a string instead of an array, or the outer key changes), the code will not throw; it will silently return `undefined`/`null` from the optional chain and the caller will receive `null` with no indication that the contract was violated. The project already uses `zod` for schema validation elsewhere (`types.ts` line 1, `fastDownloadResponseSchema`), so the infrastructure is available.

**Fix:** Define a Zod schema for the CrossRef response and parse with `.safeParse()`:

```typescript
import { z } from "zod/v4";

const crossRefWorkSchema = z.object({
  message: z.object({
    title: z.array(z.string()).optional(),
  }).optional(),
});

// Inside fetchCrossRefTitle:
const raw = await response.json();
const parsed = crossRefWorkSchema.safeParse(raw);
if (!parsed.success) return null;
return parsed.data?.message?.title?.[0] ?? null;
```

---

## Info

### IN-01: Test hard-codes the User-Agent string rather than importing the constant — will pass even if the value drifts

**File:** `tests/crossref-client.test.ts:84-86`
**Issue:** The User-Agent assertion compares against a string literal `"annas-mcp-ts/1.4 (mailto:noreply@example.com)"`. If the constant in `crossref-client.ts` is updated to use the real email (as recommended in CR-01), this test will fail with an opaque string mismatch rather than a clear signal. More importantly, if the constant were accidentally changed to an empty string, the test would catch it — but only because both sides are hard-coded. There is no test that verifies the constant comes from a configurable source.

**Fix:** Export the constant (or a getter) from `crossref-client.ts` and import it in the test:

```typescript
// crossref-client.ts
export const CROSSREF_USER_AGENT = "...";

// test
import { CROSSREF_USER_AGENT } from "../src/anna/crossref-client";
expect((capturedInit?.headers as Record<string, string>)?.["User-Agent"]).toBe(CROSSREF_USER_AGENT);
```

---

### IN-02: No test covers the case where `response.json()` itself throws (malformed JSON body)

**File:** `tests/crossref-client.test.ts`
**Issue:** The test suite covers HTTP errors, network errors, timeout errors, and missing/empty title fields, but does not cover the scenario where the HTTP response is 200 but the body is not valid JSON. In that case `response.json()` rejects, the `catch` block fires, and the function returns `null`. While `null` is the correct observable result, the absence of this test means the catch-path for `SyntaxError` is untested and future refactors that change error handling could break silently.

**Fix:** Add a test case:

```typescript
test("returns null when response body is not valid JSON", async () => {
  const fetchMock: FetchLike = async () =>
    new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } });
  const result = await fetchCrossRefTitle("10.1038/nature12345", fetchMock);
  expect(result).toBeNull();
});
```

---

_Reviewed: 2026-05-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
