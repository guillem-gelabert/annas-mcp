---
phase: 15-crossref-client
plan: 01
subsystem: api
tags: [crossref, fetch, typescript, bun, tdd]

requires: []
provides:
  - "fetchCrossRefTitle(doi, fetchImpl?) — standalone CrossRef API client returning title string or null"
  - "CROSSREF_USER_AGENT constant (module-private) with correct annas-mcp-ts/1.4 contact header"
  - "CROSSREF_TIMEOUT_MS = 5000 (module-private) via AbortSignal.timeout"
affects:
  - 16-confidence-logic

tech-stack:
  added: []
  patterns:
    - "Injectable fetchImpl pattern (same as AnnasClient constructor) — enables unit tests without real network calls"
    - "null-on-failure contract — all error paths (non-200, network, timeout, parse, missing data) return null"
    - "encodeURIComponent for DOI in URL path — prevents path injection"
    - "AbortSignal.timeout for outbound HTTP — enforces 5s ceiling"

key-files:
  created:
    - src/anna/crossref-client.ts
    - tests/crossref-client.test.ts
  modified: []

key-decisions:
  - "fetchImpl is injectable (default: global fetch) for full test isolation — mirrors existing AnnasClient pattern"
  - "Constants are module-private (not exported) — SCREAMING_SNAKE_CASE per codebase convention"
  - "Single export: fetchCrossRefTitle function only — no types, no constants exported"

patterns-established:
  - "CrossRef client: try/catch around entire fetch+parse; catch always returns null"
  - "User-Agent header: annas-mcp-ts/1.4 (mailto:noreply@example.com)"

requirements-completed:
  - VER-01
  - VER-02
  - VER-03

duration: 2min
completed: 2026-05-27
---

# Phase 15 Plan 01: CrossRef Client Summary

**Isolated CrossRef API client — fetchCrossRefTitle returns DOI title string or null with injectable fetch, 5s timeout, and full TDD coverage across 7 tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-27T15:51:22Z
- **Completed:** 2026-05-27T15:52:24Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Wrote 7 failing unit tests covering all null-paths and the User-Agent assertion (RED phase)
- Implemented fetchCrossRefTitle in ~19 lines — single function, two module-private constants, zero class (GREEN phase)
- Full test suite (90 tests across 8 files) passes with no regressions
- Threat mitigations T-15-01 (encodeURIComponent) and T-15-02 (AbortSignal.timeout) applied as required

## Task Commits

1. **Task 1: Write failing tests for fetchCrossRefTitle** - `44cc64b` (test)
2. **Task 2: Implement fetchCrossRefTitle to pass all tests** - `f88054d` (feat)

## Files Created/Modified

- `src/anna/crossref-client.ts` - Standalone CrossRef API client with injectable fetchImpl
- `tests/crossref-client.test.ts` - 7 unit tests with mocked fetchImpl; no real network calls

## Decisions Made

None — followed plan as specified.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `fetchCrossRefTitle` is ready to import from Phase 16 (Confidence Logic)
- Function signature: `fetchCrossRefTitle(doi: string, fetchImpl?: FetchLike): Promise<string | null>`
- Import path: `../anna/crossref-client`
- No blockers.

---
*Phase: 15-crossref-client*
*Completed: 2026-05-27*
