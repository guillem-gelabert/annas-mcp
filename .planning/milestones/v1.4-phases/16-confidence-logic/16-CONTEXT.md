# Phase 16: Confidence Logic - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

A standalone `computeConfidence` function that takes two title strings (one from Anna's Archive, one from CrossRef — or null) and returns a typed `ConfidenceLevel`. Lives in `src/anna/confidence.ts`. The threshold (0.5 Jaccard), output values, and normalization rules are fully specified by ROADMAP success criteria and STATE.md decisions.

</domain>

<decisions>
## Implementation Decisions

### Module Structure
- File: `src/anna/confidence.ts`
- Export: `computeConfidence(annasTitle: string, crossrefTitle: string | null): ConfidenceLevel`
- Export `ConfidenceLevel` type: `export type ConfidenceLevel = "high" | "low" | "unverified"` — Phase 17 needs it
- Test file: `tests/confidence.test.ts`

### Normalization Details
- Punctuation regex: `/[^a-z0-9\s]/g` after `.toLowerCase()` — removes all non-alphanumeric except spaces
- Numbers in words: include (e.g., `"figure 2"` matches `"figure 2"`)
- Stop words: no filtering — include all words in Jaccard calculation
- Empty word-set guard: both empty → `"high"`, one empty → `"low"`

### Algorithm (from ROADMAP — locked)
- Threshold: 0.5 Jaccard (from STATE.md decision)
- Output: `"high"` (≥ 0.5), `"low"` (< 0.5), `"unverified"` (null crossrefTitle)
- Jaccard = |intersection| / |union| on normalized word sets

### Claude's Discretion
- Internal helper function names (e.g., `normalizeTitle`, `jaccardSimilarity`)
- Whether to handle whitespace collapsing (`.trim().split(/\s+/)`)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConfidenceLevel` type will be imported by Phase 17's response integration
- `FetchLike` from `src/anna/types.ts` — same module, no dependency needed here
- Phase 15 output: `fetchCrossRefTitle` returns `string | null` — feeds directly into `crossrefTitle` param

### Established Patterns
- Standalone function exports with constants: `src/anna/crossref-client.ts` (Phase 15) — follow same pattern
- No class needed: pure function, no state
- Tests use `describe`/`test` with inline values: `tests/crossref-client.test.ts`

### Integration Points
- Phase 17 imports `computeConfidence` and `ConfidenceLevel` from `src/anna/confidence.ts`
- `article-service.ts` will eventually call both `fetchCrossRefTitle` (Phase 15) and `computeConfidence` (Phase 16) together — that wiring is Phase 17

</code_context>

<specifics>
## Specific Ideas

- Jaccard similarity: `|A ∩ B| / |A ∪ B|` on word sets (use `Set` for deduplication)
- Normalization: `.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean)`
- The function is ~25 lines total

</specifics>

<deferred>
## Deferred Ideas

- Configurable threshold (deferred to post-v1.4 per STATE.md)
- Stop-word filtering (not required by ROADMAP success criteria)

</deferred>
