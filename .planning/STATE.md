---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Token Footprint and MCP Ergonomics
current_phase: 18 (in progress)
current_plan: 18-01 (checkpoint — awaiting human verify)
status: checkpoint
last_updated: "2026-05-28"
last_activity: 2026-05-28 — 18-01 token-eval script created; awaiting human verification
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
  percent: 17
---

# Project State: annas-mcp-ts

**Initialized:** 2026-05-18
**Current Phase:** 18 — Benchmark Suite (in progress)
**Status:** Checkpoint — awaiting human verification of `bun scripts/token-eval.ts`

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-28 — v1.5 started)

**Core value:** MCP clients can reliably search for articles and books and obtain usable download URLs/metadata from Anna's Archive through a small, Bun-native TypeScript server — even as the mirror URL changes.
**Current focus:** Phase 18 — Benchmark Suite

## Workflow Settings

- Mode: YOLO
- Granularity: Coarse
- Execution: Parallel
- Research before phase planning: Yes
- Plan check: Yes
- Verifier: Yes
- Model profile: Budget

## Current Position

Phase: 18 — Benchmark Suite
Plan: 18-01 (checkpoint — human verify)
Status: Awaiting human verify at Task 3
Last activity: 2026-05-28 — 18-01 script written and typechecked; checkpoint hit

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
- v1.5: benchmark thresholds are set at current baseline + 20% headroom; must pass before and after Phase 19 changes.
- v1.5: Go reference fixtures are hardcoded strings — no Go binary execution required.
- v1.5: `verification.annasTitle` to be removed (duplicates `article.title` in 100% of responses).
- v1.5: MCP logging replaces all `console.error()` in tool handlers; URLs must be redacted before logging.
- v1.5: elicitation targets two paths only — `update_base_url` without `url`, and `book_download` write confirmation.

## Known Tech Debt

None carried forward from v1.4.

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

Run `ANNAS_SECRET_KEY=... ANTHROPIC_API_KEY=... bun scripts/token-eval.ts` to verify the token-eval harness, then type "approved" to continue.
