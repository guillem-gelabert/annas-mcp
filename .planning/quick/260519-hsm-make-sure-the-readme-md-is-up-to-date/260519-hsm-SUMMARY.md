---
phase: quick
plan: 260519-hsm
subsystem: docs
tags: [readme, documentation, npx, node, update_base_url, article_download]

requires: []
provides:
  - Accurate README.md with correct tool output schemas and Node/npx run path
affects: [users reading the README, MCP client config examples]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: [README.md]

key-decisions:
  - "article_download output example (article+sources) was moved from update_base_url section to the correct tool section"
  - "update_base_url output now reflects actual updateBaseUrlOutputSchema (selectedBaseUrl, checkedAt, candidates, mode)"
  - "Node/npx run path documented alongside Bun, referencing dist/ build output"
  - "ANNAS_BASE_URL description changed from 'defaults to annas-archive.li' to discovery-first with fallback"

requirements-completed: [DOCS-01]

duration: 5min
completed: 2026-05-19
---

# Quick Task 260519-hsm: README Update Summary

**Corrected two output schema bugs (update_base_url showed article_download output) and added Node/npx run path and dual MCP client config for developers not using Bun**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-19T10:20:00Z
- **Completed:** 2026-05-19T10:25:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Fixed critical correctness bug: `update_base_url` output example was showing `article_download` output (article + sources); replaced with actual `updateBaseUrlOutputSchema` fields (`selectedBaseUrl`, `checkedAt`, `candidates[]`, `mode`, `revisionEvidence`)
- Added `article_download` structured output example (article + sources) in the correct tool section
- Added Node.js run path section covering `bun run build`, `node dist/server.js`, and `npx annas-mcp`
- Added Node.js MCP client configuration block alongside existing Bun block
- Clarified `ANNAS_BASE_URL` copy: was "defaults to annas-archive.li" (incorrect — code-level fallback only); now "uses automatic mirror discovery, falls back to annas-archive.li if no cache"

## Task Commits

1. **Task 1: Fix tool output examples and add Node/npx run path** - `478bd9a` (docs)

## Files Created/Modified

- `README.md` - Fixed update_base_url and article_download output examples; added Node.js run path and MCP config; updated ANNAS_BASE_URL description

## Decisions Made

- Moved the article+sources example from under `update_base_url` (where it was a bug) to under `article_download` (where it belongs), rather than discarding it — the example is accurate, just was in the wrong place.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - documentation-only change.

## Next Phase Readiness

README is now accurate and ready for public use or publication to npm.

---
*Phase: quick*
*Completed: 2026-05-19*
