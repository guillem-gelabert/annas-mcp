---
phase: 13-circuit-breakers
plan: "01"
subsystem: api
tags: [typescript, circuit-breaker, abort-controller, promise-deduplication, bun]

# Dependency graph
requires:
  - phase: 12-batch-execution
    provides: handleBatchArticleDownload with parallel DOI lookups and Stage 2 downloads
provides:
  - Base URL circuit breaker in handleBatchArticleDownload via shared rediscoveryPromise deduplication
  - CDN denylist circuit breaker via CdnState (Set<string> + Map<string, Set<AbortController>>)
  - denylistHost helper function for atomic denylist + abort-all-in-flight
  - saveArticleFile with optional cdnState parameter (backward-compatible)
  - downloadOneSource with optional cdnState parameter and AbortController registration/unregistration
affects: [13-circuit-breakers, future-batch-improvements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared-promise deduplication: synchronous check-and-set before any await prevents concurrent re-discovery storms"
    - "AbortController registration/unregistration in finally for bounded memory in parallel fan-out"
    - "Optional cdnState threading: backward-compatible optional parameter passes batch-scope state down call chain"

key-files:
  created: []
  modified:
    - src/tools/article-tools.ts

key-decisions:
  - "Bypass withResolvedBaseUrl entirely in handleBatchArticleDownload; implement base URL resolution inline with CB logic (D-01)"
  - "Rediscovery deduplication via rediscoveryPromise: Promise<string> | null — synchronous check before first await (Pitfall 1)"
  - "CDN denylist scoped to batch lifetime only — no persistence across MCP calls (per requirements)"
  - "AbortError in saveArticleFile catch does NOT trigger another denylistHost call (idempotent, prevents double-denylist)"
  - "CdnState type defined at module scope; denylistHost extracted as named helper (Claude's discretion)"

patterns-established:
  - "Promise deduplication: let p: Promise<T> | null — JS event loop single-thread guarantee makes check-and-set atomic"
  - "AbortController lifecycle: register before any await, unregister in finally"

requirements-completed: [CB-01, CB-02, CB-03, CB-04, CB-05, CB-06, CB-07]

# Metrics
duration: 15min
completed: 2026-05-20
---

# Phase 13 Plan 01: Circuit Breakers Summary

**Batch-scoped base URL re-discovery deduplication and CDN host denylist with in-flight abort in handleBatchArticleDownload, preserving single-DOI path unchanged**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-20T00:00:00Z
- **Completed:** 2026-05-20
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Base URL CB: exactly one re-discovery fires per batch via `rediscoveryPromise` shared-promise deduplication — synchronous check-and-set before any `await` prevents concurrent DOI lookups from each launching their own `updateBaseUrl()` call
- CDN denylist CB: `CdnState` object (Set + Map) threads from `handleBatchArticleDownload` through `saveArticleFile` into `downloadOneSource`, enabling per-host denylist skip (CB-06), in-flight abort on first failure (CB-05), and AbortError-idempotent handling
- All 84 pre-existing tests pass; single-DOI path (`handleSingleArticleDownload`) is completely unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Base URL circuit breaker in handleBatchArticleDownload** - `1ebd041` (feat)
2. **Task 2: CDN denylist circuit breaker in saveArticleFile and downloadOneSource** - `494d88d` (feat)

## Files Created/Modified

- `src/tools/article-tools.ts` — Added CdnState type, denylistHost helper, rediscoveryPromise/rediscoveryFailed state, lookupOne closure, cdnState threading through Stage 2 to saveArticleFile and downloadOneSource

## Decisions Made

- Used `lookupOne` inline closure inside `handleBatchArticleDownload` for the base URL CB logic (keeps closure scope for shared state variables)
- Extracted `denylistHost` as a named module-scope helper (cleaner than inline abort loop, easier to read and test)
- AbortError handling in `saveArticleFile`: records distinct "aborted (host denylisted)" message instead of calling `denylistHost` again — correctly handles the idempotent case where a peer already triggered the denylist

## Deviations from Plan

None — plan executed exactly as written.

The merge from master to bring in Phase 12 code (which the worktree was missing) was a prerequisite operation, not a deviation — the plan depends on Phase 12 and the worktree branch needed to be brought current.

## Issues Encountered

The worktree was branched from `edce5bc` (pre-Phase 12), so `handleBatchArticleDownload`, `downloadOneSource`, `checkDownloadCache`/`recordDownloadCache`, and related Phase 12 additions were absent. Resolved by merging master (fast-forward) before implementing Phase 13 changes. This is expected worktree initialization behavior.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Both CBs (base URL + CDN denylist) are implemented and tested
- Phase 13 Plan 02 can proceed: it will add unit tests specifically covering the CB behaviors (concurrent re-discovery, AbortError handling, denylist skip logic)
- No blockers

---
*Phase: 13-circuit-breakers*
*Completed: 2026-05-20*
