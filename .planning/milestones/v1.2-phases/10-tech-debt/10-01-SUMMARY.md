---
phase: 10-tech-debt
plan: 01
status: complete
requirements: [TD-01, TD-02, TD-03, TD-04]
files_modified:
  - src/anna/base-url-manager.ts
  - src/anna/tool-utils.ts
  - src/tools/base-url-tools.ts
  - tests/anna.test.ts
  - tests/base-url-tools.test.ts
completed: "2026-05-19"
verified: "2026-05-19T14:46:29Z"
---

# Phase 10 Plan 01: Tech Debt Clearance Summary

**One-liner:** Fixed four v1.1 quality gaps — readCache error surfacing, offline retry test coverage, selector constant rename, and double-offline actionable guidance.

## What Was Done

### TD-01: readCache non-ENOENT errors surface as cacheWarning

`handleUpdateBaseUrl` in `src/tools/base-url-tools.ts` now wraps `manager.readCache()` in a try-catch. On non-ENOENT errors, the error message is captured and assigned to `cacheWarning` in the output. The `updateBaseUrlOutputSchema` was extended with `cacheWarning: z.string().optional()`. A test in `tests/base-url-tools.test.ts` mocks `readCache()` throwing a `SyntaxError` and asserts `cacheWarning` contains "Cache read failed".

### TD-02: Test covers withResolvedBaseUrl offline automatic retry path end-to-end

Two tests added to `tests/anna.test.ts` under `describe("withResolvedBaseUrl offline retry")`: one confirms the retry succeeds when the second `run()` call succeeds after the first fails with an offline-like error; one confirms the correct actionable error message is returned when the retry also fails.

### TD-03: WIKIPEDIA_SELECTOR replaced with accurate constant

`WIKIPEDIA_SELECTOR` was renamed to `WIKITEXT_EXTRACTION_METHOD` in `src/anna/base-url-manager.ts` (line 15). The new constant value accurately describes the actual extraction mechanism: `"wikitext-url-regex: /https?:\\/\\/([a-z0-9.-]+)/gi filtered by HOST_PATTERN"`. No occurrences of `WIKIPEDIA_SELECTOR` remain in `src/`.

### TD-04: Double-offline returns actionable guidance message

`src/anna/tool-utils.ts` inner catch (lines 37-43) checks `isLikelyOfflineBaseUrlError(retryError)` and throws: `"Both the current mirror and the fallback discovery appear offline. Try again later or set ANNAS_BASE_URL to a known working mirror."` This message flows through to the MCP tool caller.

## Verification

All four TD items passed verification on 2026-05-19T14:46:29Z (4/4 truths verified, 51 pass, 0 fail).

## Deviations from Plan

None — plan executed exactly as written.
