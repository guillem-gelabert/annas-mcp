---
phase: 16-confidence-logic
plan: 01
subsystem: api
tags: [typescript, jaccard, string-similarity, confidence-scoring, tdd, bun]

# Dependency graph
requires:
  - phase: 15-crossref-client
    provides: fetchCrossRefTitle returning string|null — feeds crossrefTitle param of computeConfidence
provides:
  - computeConfidence(annasTitle, crossrefTitle): ConfidenceLevel — pure Jaccard-based title comparison
  - ConfidenceLevel type export ("high" | "low" | "unverified") for Phase 17 import
affects:
  - 17-article-service-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained pure module with no imports — normalizeTitle + jaccardSimilarity helpers private, only computeConfidence + ConfidenceLevel exported"
    - "Empty-set guard: both empty → high (division-by-zero safe), one empty → low"
    - "TDD: RED commit (failing tests) before GREEN commit (implementation)"

key-files:
  created:
    - src/anna/confidence.ts
    - tests/confidence.test.ts
  modified: []

key-decisions:
  - "Jaccard threshold hardcoded at 0.5 (configurable deferred to post-v1.4 per STATE.md)"
  - "Both-empty normalized sets return 'high' (no comparison possible, no evidence of mismatch)"
  - "One-empty returns 'low' (one side has no words to compare — low confidence)"
  - "No stop-word filtering — all words included in Jaccard calculation per CONTEXT.md"
  - "normalizeTitle and jaccardSimilarity are module-private (not exported)"

patterns-established:
  - "Self-contained module pattern: no imports, pure functions, SCREAMING_SNAKE_CASE constants"
  - "Empty-set edge case guard before scoring to prevent division-by-zero"

requirements-completed: [VER-04, VER-05, VER-06]

# Metrics
duration: 1min
completed: 2026-05-27
---

# Phase 16 Plan 01: Confidence Logic Summary

**Pure Jaccard-similarity confidence scorer: computeConfidence(annasTitle, crossrefTitle) returns 'high'/'low'/'unverified' with case-insensitive, punctuation-stripped word-set comparison at 0.5 threshold**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-05-27T19:52:26Z
- **Completed:** 2026-05-27T19:53:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Implemented computeConfidence as a self-contained pure TypeScript module with Jaccard similarity scoring
- 8 new TDD tests covering all branches: null crossrefTitle, identical titles, case-insensitive, punctuation stripping, case normalization, both-empty guard, one-empty guard, low-similarity mismatch
- 90 pre-existing tests remain unbroken (98 total pass)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write failing tests for computeConfidence** - `0ddef3f` (test)
2. **Task 2 (GREEN): Implement computeConfidence** - `437ea56` (feat)

_Note: TDD plan — test commit (RED) followed by implementation commit (GREEN)_

## TDD Gate Compliance

- RED gate: `test(16-01)` commit `0ddef3f` — 8 failing tests (module-not-found)
- GREEN gate: `feat(16-01)` commit `437ea56` — all 98 tests pass

## Files Created/Modified
- `src/anna/confidence.ts` - computeConfidence function and ConfidenceLevel type; ~35 LOC, no imports
- `tests/confidence.test.ts` - 8 unit tests covering all branches and edge cases

## Decisions Made
- Jaccard threshold 0.5 hardcoded per STATE.md locked decision (configurable deferred post-v1.4)
- Both normalized-empty sets return "high" (no evidence of mismatch)
- One normalized-empty set returns "low" (asymmetric match impossible)
- No stop-word filtering (all words included per CONTEXT.md decision)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `computeConfidence` and `ConfidenceLevel` are ready for Phase 17 import from `src/anna/confidence`
- Phase 17 wires `fetchCrossRefTitle` (Phase 15) + `computeConfidence` (Phase 16) into `article_download` response

---
*Phase: 16-confidence-logic*
*Completed: 2026-05-27*
