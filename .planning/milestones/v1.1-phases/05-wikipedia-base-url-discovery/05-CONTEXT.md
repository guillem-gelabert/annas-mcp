# Phase 5: Wikipedia Base URL Discovery - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers Wikipedia-based discovery of Anna's Archive base URL candidates and 24-hour trust filtering, producing trusted candidates and rejection reasons for untrusted ones. It does not implement cache persistence, runtime base URL selection, manual override behavior, or offline retry orchestration.

</domain>

<decisions>
## Implementation Decisions

### Source of Truth
- **D-01:** Use MediaWiki Revisions API wikitext/content as the source of truth for candidate extraction and age checks; do not use rendered page HTML as the trust source.

### 24-Hour Trust Rule
- **D-02:** A candidate is trusted only if it appears in the latest revision and also appears in at least one revision older than 24 hours.

### Revision Scan Bounds
- **D-03:** Use a dual scan cap: both a maximum revision count and a maximum lookback window. If bounds are exceeded before trust can be proven, mark the candidate as unproven.

### Host Filtering
- **D-04:** Accept only `annas-archive.*` hosts, where `*` is a top-level domain.

### the agent's Discretion
No open discretion areas were left for this phase discussion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria, and constraints.
- `.planning/REQUIREMENTS.md` — `WIKI-01` to `WIKI-05` acceptance boundary.
- `.planning/PROJECT.md` — Milestone-level decisions, especially manual override and mirror resilience direction.

### Prior research
- `.planning/research/SUMMARY.md` — Architecture direction and pitfalls for discovery and trust filtering.
- `.planning/research/STACK.md` — MediaWiki API usage guidance and test strategy.

### External API references
- `https://www.mediawiki.org/wiki/API:Revisions` — Revision content and timestamps are authoritative inputs for trust checks.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config.ts` `normalizeBaseUrl()` — existing base URL normalization should be reused for discovered candidates.
- `src/anna/client.ts` `BROWSER_USER_AGENT` and error model — useful pattern for consistent network requests and errors.
- `src/anna/parse.ts` + `cheerio` pattern — existing parser isolation style is a good template for a new Wikipedia parser module.
- `tests/anna.test.ts` and `tests/article-tools.test.ts` — existing mocked `fetch` test style should be reused for revision and filtering tests.

### Established Patterns
- Feature code is split into modules (`client`, `service`, `parse`) with injectable `fetch` for testability.
- Tool handlers return structured MCP content and map exceptions to readable tool errors.
- Parsing and network concerns are separated; no direct parsing inside tool registration.

### Integration Points
- New phase code should likely attach under `src/anna/` (Wikipedia client/discovery logic) and be consumed later by phase 6 cache/selection logic.
- Phase 5 outputs should be shaped to plug into future `update_base_url` tool output and cache records without rework.

</code_context>

<specifics>
## Specific Ideas

- Treat revision content as canonical even if rendered HTML differs.
- Prefer a simpler trust rule (latest + at least one older-than-24h presence) rather than proving full continuity across every revision.
- Keep host filtering strict to Anna's Archive domains only.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 5-Wikipedia Base URL Discovery*
*Context gathered: 2026-05-19*
