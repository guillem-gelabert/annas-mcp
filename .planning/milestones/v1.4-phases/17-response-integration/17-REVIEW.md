---
phase: 17-response-integration
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/tools/article-tools.ts
  - tests/article-tools.test.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 17: Code Review Report

**Reviewed:** 2026-05-27
**Depth:** standard
**Files Reviewed:** 2
**Status:** clean

## Summary

`article-tools.ts` correctly wires `fetchCrossRefTitle` and `computeConfidence` into both single-DOI and batch `article_download` handlers. `Promise.all` runs CrossRef in parallel with Anna's Archive per DOI. `.catch(() => null)` guards all CrossRef failures per the phase spec. The test suite adds 5 new verification scenarios covering VER-07 through VER-11.

Reviewer raised CR-01 (annasTitle "" vs null) and WR-01 (broad catch) as concerns — both are intentional per Phase 17 CONTEXT.md design decisions. WR-03 (redundant cast) and IN-02 (duplicate label) were applied and fixed.

---

## Applied Fixes

- **WR-03 (fixed):** Removed redundant `as ConfidenceLevel` casts from both call sites — `computeConfidence` already returns `ConfidenceLevel`. Also removed the now-unused `import type { ConfidenceLevel }`.
- **IN-02 (fixed):** Renamed duplicate `(VER-08)` test label on the batch failure test to `(VER-10)`.

---

## Intentional Decisions (not defects)

### IN-01: `annasTitle ?? ""` passes empty string to computeConfidence (not null)

**File:** `src/tools/article-tools.ts:183, 281`

**Note:** Intentional per Phase 17 CONTEXT.md: when Anna's title is absent, `computeConfidence("", crossrefTitle)` produces "unverified" if crossrefTitle is null, or "low" if crossrefTitle has words. Both behaviors are correct for the specified use case. No change.

### IN-02: `.catch(() => null)` on fetchCrossRefTitle absorbs all errors

**File:** `src/tools/article-tools.ts:176, 216, 253`

**Note:** Intentional per Phase 17 CONTEXT.md: "unexpected CrossRef errors are silently absorbed into crossrefTitle = null at the handler boundary, which is the intended behavior." The phase design prioritizes never blocking article sources over observing CrossRef errors. No change.

---

_Reviewed: 2026-05-27_
_Reviewer: Claude (orchestrator resolution — CR-01/WR-01/WR-04 are locked decisions per 17-CONTEXT.md)_
_Depth: standard_
