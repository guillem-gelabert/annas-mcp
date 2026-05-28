---
phase: 12-batch-execution
plan: "01"
subsystem: api
tags: [typescript, bun, mcp, promise-allsettled, parallel, batch]

requires:
  - phase: 11-api-schema
    provides: articleDownloadInputSchema with dois array, articleBatchResultSchema, articleBatchDownloadOutputSchema

provides:
  - handleBatchArticleDownload: two-stage parallel pipeline (Promise.allSettled lookups + downloads)
  - handleSingleArticleDownload: extracted private function encapsulating single-DOI path
  - Batch behavioral tests: BATCH-01 parallelism, BATCH-02 download, BATCH-03 error isolation

affects:
  - phase 12 verifier (tests are now real and must stay green)

tech-stack:
  added: []
  patterns:
    - "Two-stage Promise.allSettled: all lookups settle before any downloads begin"
    - "Pre-flight path validation once before fan-out — whole-batch fail, not per-item"
    - "Shared BaseUrlManager instance constructed once, passed to all parallel calls"
    - "Lookup-failure items shape: { doi, error } only — no article/sources keys"
    - "return await inside try/catch required for async helpers to propagate exceptions"

key-files:
  created: []
  modified:
    - src/tools/article-tools.ts
    - tests/article-tools.test.ts

key-decisions:
  - "return await used (not bare return) when delegating to async helpers inside try/catch — bare return silently swallows exceptions"
  - "Batch download test uses per-DOI distinct HTML mocks to avoid concurrent filename collision race condition"
  - "isError never set for partial batch failures — only pre-flight whole-batch failures set isError: true"

patterns-established:
  - "Promise.allSettled fan-out: stage 1 (lookups) fully settles before stage 2 (downloads) begins"
  - "Error extraction: reason instanceof Error ? reason.message : String(reason)"
  - "In-flight counter pattern for parallelism tests: inFlight++/-- + maxConcurrent tracking + Promise.resolve() yield"

requirements-completed:
  - BATCH-01
  - BATCH-02
  - BATCH-03

duration: 20min
completed: 2026-05-20
---

# Phase 12 Plan 01: Batch Article Download Implementation Summary

**Two-stage parallel pipeline via Promise.allSettled replacing stub: DOI lookups fan out concurrently, downloads fan out only for resolved articles, each result carries its own success or error state.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-20T07:20:00Z
- **Completed:** 2026-05-20T07:40:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced `"batch not yet implemented"` stub with real two-stage `Promise.allSettled` pipeline
- Extracted `handleSingleArticleDownload` private function — existing single-DOI behavior 100% unchanged
- Added `handleBatchArticleDownload` with pre-flight path validation, shared manager, stage-1 lookups, stage-2 downloads
- Fixed `articleBatchResultSchema`: `article` and `sources` now `.optional()` to correctly model lookup-failure items
- Replaced 1 stub test with 4 behavioral tests proving BATCH-01, BATCH-02, BATCH-03
- Full suite: 84 tests, 0 failures

## Task Commits

1. **Task 1: Implement handleBatchArticleDownload and extract handleSingleArticleDownload** - `8c80fc9` (feat)
2. **Task 2: Replace stub test with batch behavior tests** - `731f8e7` (feat)

## Files Created/Modified

- `src/tools/article-tools.ts` - articleBatchResultSchema fixed, handleSingleArticleDownload extracted, handleBatchArticleDownload added, router delegates to both helpers
- `tests/article-tools.test.ts` - stub test deleted, 4 new batch behavioral tests added

## Decisions Made

- Used `return await` (not bare `return`) when delegating to async helpers inside try/catch — bare `return promise` does not put the rejection inside the surrounding try/catch block in async functions
- Batch download test uses distinct per-DOI HTML mocks returning different article titles to avoid concurrent filename collision race in `saveArticleFile`'s dedup logic
- `isError` is never set for partial batch failures — only pre-flight whole-batch failure (invalid/unconfigured download path) sets `isError: true`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `await` to delegated async helper calls inside try/catch**
- **Found during:** Task 2 verification (test run)
- **Issue:** `return handleSingleArticleDownload(...)` without `await` inside a try block does not route rejections through the catch clause — `saveArticleFile` failures escaped the catch block and appeared as unhandled exceptions instead of being returned as `textResult(err.message, true)`
- **Fix:** Changed both delegate calls to `return await handleSingleArticleDownload(...)` and `return await handleBatchArticleDownload(...)`
- **Files modified:** `src/tools/article-tools.ts`
- **Verification:** `aggregates errors when all download sources fail` test passed after fix
- **Committed in:** `731f8e7` (Task 2 commit)

**2. [Rule 1 - Bug] Used distinct mocks per DOI in BATCH-02 download test**
- **Found during:** Task 2 verification (test run)
- **Issue:** Both DOIs resolved to the same title "Interesting Paper" via shared `searchHtml`/`detailHtml`; parallel writes to the same filename were racing — `existsSync` + counter dedup is not race-safe, causing the second write to fail
- **Fix:** BATCH-02 test now generates per-DOI `searchHtml`/`detailHtml` with distinct titles ("First Paper", "Second Paper") and distinct hashes, ensuring unique filenames under parallel execution
- **Files modified:** `tests/article-tools.test.ts`
- **Verification:** BATCH-02 test passes consistently
- **Committed in:** `731f8e7` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered

- Test runs against the main repo (not worktree) silently reported "17 pass" masking failures — resolved by always running bun from the worktree directory
- `bun test` count discrepancy between main-repo run and worktree run confirmed that all new tests were correctly scoped to the worktree

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- BATCH-01, BATCH-02, BATCH-03 requirements delivered
- 84-test suite is green; verifier can run `bun test` to confirm
- Single-DOI path is 100% behavior-identical (all pre-existing single-DOI tests pass)
- `handleBatchArticleDownload` and `handleSingleArticleDownload` are available for future circuit breaker work if planned

---
*Phase: 12-batch-execution*
*Completed: 2026-05-20*
