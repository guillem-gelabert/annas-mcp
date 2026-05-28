# Roadmap: annas-mcp-ts

**Core Value:** MCP clients can reliably search for articles and books and obtain usable download URLs/metadata from Anna's Archive through a small, Bun-native TypeScript server — even as the mirror URL changes.

## Milestones

- ✅ **v1.0 MVP** — Phases 1–4 (shipped 2026-05-18)
- ✅ **v1.1 Mirror Resilience** — Phases 5–7 (shipped 2026-05-19)
- ✅ **v1.2 Book Tools** — Phases 8–10 (shipped 2026-05-19)
- ✅ **v1.3 Batch Article Download** — Phases 11–14 (shipped 2026-05-21) — [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 DOI Verification** — Phases 15–17 (shipped 2026-05-27) — [archive](milestones/v1.4-ROADMAP.md)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–4) — SHIPPED 2026-05-18</summary>

- [x] Phase 1: Foundation — scaffold Bun MCP server with config and auth
- [x] Phase 2: Article Core — add article lookup service and Anna's Archive client
- [x] Phase 3: MCP Tools — expose article_search and article_download as MCP tools
- [x] Phase 4: Documentation — document MCP server usage and client configuration

Full archive: [.planning/milestones/v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md)

</details>

<details>
<summary>✅ v1.1 Mirror Resilience (Phases 5–7) — SHIPPED 2026-05-19</summary>

- [x] Phase 5: Wikipedia Base URL Discovery — completed 2026-05-19
- [x] Phase 6: Base URL Cache and Selection — completed 2026-05-19
- [x] Phase 7: MCP Tool and Offline Recovery — completed 2026-05-19

Full archive: [.planning/milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

<details>
<summary>✅ v1.2 Book Tools (Phases 8–10) — SHIPPED 2026-05-19</summary>

- [x] Phase 8: Book Search — `book_search` MCP tool with full metadata and offline recovery
- [x] Phase 9: Book Download — `book_download` MCP tool with optional file write and shared security utilities
- [x] Phase 10: Tech Debt Clearance — resolve four deferred v1.1 quality issues

Full archive: [.planning/milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

<details>
<summary>✅ v1.3 Batch Article Download (Phases 11–14) — SHIPPED 2026-05-21</summary>

- [x] Phase 11: API Schema — extend `article_download` to accept `doi` or `dois` with backwards-compatible response shapes (completed 2026-05-19)
- [x] Phase 12: Batch Execution — parallel resolution and download with per-article error isolation (completed 2026-05-20)
- [x] Phase 13: Circuit Breakers — batch-scoped base_url and CDN domain_index failure detection and propagation (completed 2026-05-20)
- [x] Phase 14: Codex Review Remediation — close 7 codex-review findings: manual `ANNAS_BASE_URL` honored in batch, baseUrl propagation, filename-collision race, host-level-only denylist, full-body timeout, single-rejection stream cleanup (completed 2026-05-21)

Full archive: [.planning/milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)

</details>

<details>
<summary>✅ v1.4 DOI Verification (Phases 15–17) — SHIPPED 2026-05-27</summary>

- [x] Phase 15: CrossRef Client — `fetchCrossRefTitle` with injectable fetch, 5s timeout, null-on-failure (completed 2026-05-27)
- [x] Phase 16: Confidence Logic — `computeConfidence` Jaccard scorer at 0.5 threshold (completed 2026-05-27)
- [x] Phase 17: Response Integration — hard-error gating wired into single-DOI and batch handlers (completed 2026-05-27)

Full archive: [.planning/milestones/v1.4-ROADMAP.md](milestones/v1.4-ROADMAP.md)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 1/1 | Complete | 2026-05-18 |
| 2. Article Core | v1.0 | 1/1 | Complete | 2026-05-18 |
| 3. MCP Tools | v1.0 | 1/1 | Complete | 2026-05-18 |
| 4. Documentation | v1.0 | 1/1 | Complete | 2026-05-18 |
| 5. Wikipedia Base URL Discovery | v1.1 | 1/1 | Complete | 2026-05-19 |
| 6. Base URL Cache and Selection | v1.1 | 1/1 | Complete | 2026-05-19 |
| 7. MCP Tool and Offline Recovery | v1.1 | 1/1 | Complete | 2026-05-19 |
| 8. Book Search | v1.2 | 2/2 | Complete | 2026-05-19 |
| 9. Book Download | v1.2 | 2/2 | Complete | 2026-05-19 |
| 10. Tech Debt Clearance | v1.2 | 1/1 | Complete | 2026-05-19 |
| 11. API Schema | v1.3 | 1/1 | Complete | 2026-05-19 |
| 12. Batch Execution | v1.3 | 1/1 | Complete | 2026-05-20 |
| 13. Circuit Breakers | v1.3 | 2/2 | Complete | 2026-05-20 |
| 14. Codex Review Remediation | v1.3 | 1/1 | Complete | 2026-05-21 |
| 15. CrossRef Client | v1.4 | 1/1 | Complete | 2026-05-27 |
| 16. Confidence Logic | v1.4 | 1/1 | Complete | 2026-05-27 |
| 17. Response Integration | v1.4 | 1/1 | Complete | 2026-05-27 |

---
*Last updated: 2026-05-28 — v1.4 milestone archived*
