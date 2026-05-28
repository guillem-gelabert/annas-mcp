---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: DOI Verification
current_phase: 17
status: completed
last_updated: "2026-05-27T20:18:09.777Z"
last_activity: 2026-05-27 -- Phase 17 marked complete
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# Project State: annas-mcp-ts

**Initialized:** 2026-05-18
**Current Phase:** 17
**Status:** Complete

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-28 — v1.4 archived)

**Core value:** MCP clients can reliably search for articles and books and obtain usable download URLs/metadata from Anna's Archive through a small, Bun-native TypeScript server — even as the mirror URL changes.
**Current focus:** Planning next milestone (v1.5)

## Workflow Settings

- Mode: YOLO
- Granularity: Coarse
- Execution: Parallel
- Research before phase planning: Yes
- Plan check: Yes
- Verifier: Yes
- Model profile: Budget

## Current Position

Phase: 17 — COMPLETE
Plan: 1 of 1
Status: Phase 17 complete
Last activity: 2026-05-27 -- Phase 17 marked complete

Progress:

```
v1.4: [          ] 0/3 phases complete
Phase 15: CrossRef Client     [ ] Not started
Phase 16: Confidence Logic    [ ] Not started
Phase 17: Response Integration [ ] Not started
```

## Current Decisions

- Bun-first TypeScript runtime.
- MCP server only in v1.
- `article_download` resolves URLs/metadata only; article tools do not write files to disk.
- `ANNAS_BASE_URL` remains the winning manual override when set.
- Automatic mirror discovery uses trusted Wikipedia candidates with 24-hour revision evidence.
- Mirror resilience uses an internal server-side JSON cache, not MCP client-side cache hints.
- Per-invocation `BaseUrlManager` (no singleton); shared cache via disk file.
- v1.3: `doi` and `dois` are mutually exclusive inputs; handler normalizes both to an internal array.
- v1.3: circuit breakers are batch-scoped only (not persistent across MCP calls).
- v1.3: base_url circuit breaker triggers exactly one re-discovery attempt per batch.
- v1.4: CrossRef fetch uses injected `fetchImpl` for testability (same pattern as `lookupArticleByDoi`).
- v1.4: verification is informational only — no hard failure on CrossRef error; sources always returned.
- v1.4: confidence threshold is 0.5 Jaccard (hardcoded for v1.4; configurable deferred to future).

## Known Tech Debt

None carried forward from v1.3.

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260519-g0n | implement security remediations from SECURITY.md | 2026-05-19 | 7e56335 | [260519-g0n](../quick/260519-g0n-implement-security-remediations-from-sec/) |
| 260519-gki | make MCP server runnable via npx | 2026-05-19 | 723f4b0 | [260519-gki](../quick/260519-gki-make-mcp-server-runnable-via-npx/) |
| 260519-hsm | make sure the README.md is up to date | 2026-05-19 | 478bd9a | [260519-hsm](../quick/260519-hsm-make-sure-the-readme-md-is-up-to-date/) |
| 260519-nr9 | fix tech debt from v1.2 audit (W-01, W-02, W-03) | 2026-05-19 | 7b078d9 | [260519-nr9](../quick/260519-nr9-fix-tech-debt-from-v1-2-audit/) |
| 260519-o60 | update the README.md so it's in sync | 2026-05-19 | 9f71c86 | [260519-o60](../quick/260519-o60-update-the-readme-md-so-it-s-in-sync/) |
| 260519-vh5 | add download cache to avoid re-downloading files within 18h window | 2026-05-19 | 707d4f3 | [260519-vh5](../quick/260519-vh5-add-download-cache-to-avoid-re-downloadi/) |
| 260527 | remove stale article local-download code from article_download | 2026-05-27 | 56bfcd3 | [260527](../quick/260527-remove-stale-article-local-download-code/) |

## Next Command

`/gsd:plan-phase 15` — plan Phase 15 (CrossRef Client)
