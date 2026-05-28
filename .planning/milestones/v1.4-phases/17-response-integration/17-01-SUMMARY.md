---
phase: 17-response-integration
plan: "01"
subsystem: article-tools
tags: [verification, crossref, tdd, batch, confidence]
dependency_graph:
  requires: [phase-15-crossref-client, phase-16-confidence]
  provides: [article-download-verification-response]
  affects: [src/tools/article-tools.ts]
tech_stack:
  added: []
  patterns: [promise-all-parallelism, graceful-degradation, tdd-red-green]
key_files:
  created: []
  modified:
    - src/tools/article-tools.ts
    - tests/article-tools.test.ts
decisions:
  - "CrossRef fetch runs in parallel with Anna's Archive lookup via Promise.all in both single-DOI and batch paths"
  - "Batch lookupOne extended to return crossrefTitle alongside resolution; verification built in post-settlement loop"
  - "Unexpected CrossRef errors caught via .catch(() => null) at handler boundary per VER-09 and CONTEXT.md D-03"
  - "Failed batch items retain { doi, error } shape with no verification property; successful items include verification"
metrics:
  duration_seconds: 115
  completed_date: "2026-05-27"
  tasks_completed: 2
  files_changed: 2
---

# Phase 17 Plan 01: Response Integration Summary

Wire `fetchCrossRefTitle` (Phase 15) and `computeConfidence` (Phase 16) into both single-DOI and batch `article_download` handlers, adding a `verification: { crossrefTitle, annasTitle, confidence }` object to every successful response.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED: Write failing verification tests | 94aca40 | tests/article-tools.test.ts |
| 2 | GREEN: Wire verification into article-tools.ts | fd7bf2e | src/tools/article-tools.ts |

## What Was Built

**verificationSchema** — Zod object: `{ crossrefTitle: string | null, annasTitle: string | null, confidence: "high" | "low" | "unverified" }`. Added to `articleDownloadOutputSchema` (required) and `articleBatchResultSchema` (optional).

**Single-DOI handler** — `Promise.all` runs Anna's Archive lookup and `fetchCrossRefTitle` concurrently. After both settle, builds `verification` from `resolution.article.title` and CrossRef title, then adds it to `structuredContent` alongside existing `article` and `sources`.

**Batch handler** — `lookupOne` extended to fire `fetchCrossRefTitle` in parallel with each Anna's Archive resolution (both the initial attempt and the base-URL-CB retry path). Post-settlement loop builds `verification` for each resolved item. Failed items (`settled.status === "rejected"`) retain `{ doi, error }` with no `verification` property.

**Error handling** — `.catch(() => null)` wraps `fetchCrossRefTitle` at the handler boundary. `fetchCrossRefTitle` already absorbs `TimeoutError` and `TypeError`; unexpected re-thrown errors are absorbed here, producing `crossrefTitle = null` → `confidence: "unverified"`.

## Test Results

- RED commit: 5 new verification tests fail, 99 pre-existing tests pass (104 total, 5 fail)
- GREEN commit: 104/104 tests pass (0 fail)

New test coverage:
- Single-DOI verification present (crossrefTitle, annasTitle, confidence)
- Single-DOI CrossRef failure → unverified, no `isError`
- Batch successful items each have `verification`
- Batch failed items omit `verification`
- CrossRef null title (empty array) → `confidence: "unverified"`

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new network endpoints or trust boundaries introduced. The CrossRef call was already modeled in the plan's threat register (T-17-02). The `.catch(() => null)` mitigation for DoS (T-17-02) is applied correctly.

## Known Stubs

None.

## Self-Check: PASSED

- `src/tools/article-tools.ts` — modified: CONFIRMED
- `tests/article-tools.test.ts` — modified: CONFIRMED
- RED commit `94aca40` — CONFIRMED
- GREEN commit `fd7bf2e` — CONFIRMED
- `bun test` exits 0 with 104 tests passing — CONFIRMED
