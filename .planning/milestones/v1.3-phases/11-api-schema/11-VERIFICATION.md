---
phase: 11-api-schema
verified: 2026-05-20T00:00:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 11: API Schema Verification Report

**Phase Goal:** `article_download` accepts either `doi` (single) or `dois` (array) as mutually exclusive inputs; existing single-DOI callers see no change
**Verified:** 2026-05-20
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `{ doi: '10.1038/nature12345' }` returns `{ article, sources }` — single path untouched | VERIFIED | `safeParse` succeeds; handler enters `else` branch; existing tests at lines 86–124 all pass |
| 2 | `{ dois: ['10.1038/nature12345', '10.1016/j.aju.2012.11.001'] }` does not throw and routes to batch stub | VERIFIED | `safeParse` succeeds; `if ("dois" in args && args.dois)` branch at line 161 returns stub; test at line 373 passes |
| 3 | Both `doi` and `dois` provided produces Zod error "Provide either doi (single) or dois (array), not both" | VERIFIED | `superRefine` at line 70–77 adds that exact issue; spot-check confirms message; test at line 342 passes |
| 4 | `dois: []` produces a Zod min(1) validation error | VERIFIED | `.min(1)` on array at line 59; `safeParse({ dois: [] }).success === false`; test at line 354 passes |
| 5 | Invalid DOI in array produces Zod regex validation error | VERIFIED | Per-element `.regex(...)` at line 58; `safeParse({ dois: ['not-a-doi'] }).success === false`; test at line 359 passes |
| 6 | `registerArticleTools` still registers exactly `article_search` and `article_download`; total tool count is 5 | VERIFIED | Two `server.registerTool` calls in `article-tools.ts` (lines 210, 226); 5 total across all tool files: `update_base_url`, `book_search`, `book_download`, `article_search`, `article_download` |
| 7 | All 81 tests pass (74 pre-existing + 7 new) | VERIFIED | `bun test`: 81 pass, 0 fail across 7 files |
| 8 | `articleBatchDownloadOutputSchema` and `ArticleBatchResult` are named exports from `article-tools.ts` | VERIFIED | `export const articleBatchDownloadOutputSchema` at line 100; `export type ArticleBatchResult` at line 104 |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/tools/article-tools.ts` | Extended schema, batch output schema, `ArticleBatchResult`, handler routing stub | VERIFIED | All four deliverables present and substantive (396 lines) |
| `tests/article-tools.test.ts` | Unit tests for schema validation, no network calls | VERIFIED | 386 lines; `describe("article_download schema validation")` block at line 329 with 7 tests; stub test uses `noNetworkFetch` that throws on any call |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tests/article-tools.test.ts` | `src/tools/article-tools.ts` | `import { articleDownloadInputSchema }` | WIRED | Line 9 imports `articleDownloadInputSchema`; used in tests at lines 331, 336, 343, 355, 360, 365 |
| `handleArticleDownload` | batch stub path | `if ("dois" in args && args.dois)` | WIRED | Lines 161–163; condition matches exactly the pattern in the plan |

---

### Data-Flow Trace (Level 4)

Not applicable. The batch handler is an intentional stub returning a static string ("batch not yet implemented"). The single-DOI handler is pre-existing and unmodified — its data flow was validated in earlier phases. No new dynamic rendering was introduced.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `{ doi, dois }` both fails with exact message | `bun -e "...safeParse..."` | `"Provide either doi (single) or dois (array), not both"` | PASS |
| `{}` neither fails | `bun -e "...safeParse..."` | `success: false`, message contains substring | PASS |
| `{ dois: [] }` fails | `bun -e "...safeParse..."` | `success: false` | PASS |
| `{ dois: ['not-a-doi'] }` fails | `bun -e "...safeParse..."` | `success: false` | PASS |
| `{ doi: '10.1038/nature12345' }` passes | `bun -e "...safeParse..."` | `success: true` | PASS |
| `{ dois: ['10.1038/nature12345'] }` passes | `bun -e "...safeParse..."` | `success: true` | PASS |
| Full test suite | `bun test` | `81 pass, 0 fail` | PASS |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| API-01 | `article_download` accepts `doi` or `dois` as mutually exclusive inputs, both validated with DOI regex | SATISFIED | `dois` field added with same regex; `superRefine` enforces mutual exclusion; all six validation cases tested |
| API-02 | When `dois` provided, response returns array of per-article results; single-DOI response shape unchanged | PARTIAL — intentional stub | `articleBatchDownloadOutputSchema` defines the contract; stub returns placeholder text; full execution deferred to Phase 12. Single-DOI path untouched (COMPAT-01 satisfied). Per roadmap traceability, Phase 12 owns BATCH-01/02/03 which complete API-02. |
| COMPAT-01 | Existing `doi: string` callers receive identical response shape and behavior | SATISFIED | `doi` made optional but `superRefine` enforces it must be present when `dois` absent; single-DOI path uses `args.doi!` with the exact same logic; pre-existing tests unchanged and passing |
| COMPAT-02 | No new MCP tool registered — tool count stays at 5 | SATISFIED | Total remains 5: `update_base_url`, `book_search`, `book_download`, `article_search`, `article_download` |

**Note on API-02:** The requirement says "response returns an array of per-article results." Phase 11 delivers the schema contract and routing stub. The actual array execution is Phase 12 per REQUIREMENTS.md traceability (BATCH-01/02/03 mapped to Phase 12). This is a documented intentional stub, not a gap.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/tools/article-tools.ts` | 162 | `return { content: [{ type: "text", text: "batch not yet implemented" }] }` | Info | Intentional stub documented in SUMMARY.md "Known Stubs" section; Phase 12 implements the real handler. No TBD/FIXME/XXX markers. |

No `TBD`, `FIXME`, or `XXX` markers found in modified files.

---

### Deviation Note: "neither" error message

The PLAN spec states the `superRefine` should use "Provide either doi (single) or dois (array), not both" for **both** the both-present and neither-present cases. The implementation uses a distinct, shorter message "Provide either doi (single) or dois (array)" (without "not both") for the neither case (line 82). The test at line 369 asserts `toContain("Provide either doi (single) or dois (array)")` which passes as a substring match. The error message is descriptive and unambiguous. This is a minor deviation from the plan wording but does not affect correctness or the API contract — it is less confusing to omit "not both" when neither is provided.

---

### Human Verification Required

None. All must-haves are verifiable programmatically and confirmed above.

---

### Gaps Summary

No gaps. All 8 must-haves verified. The batch stub is an intentional, documented placeholder; full batch execution is Phase 12's responsibility per the milestone roadmap.

---

_Verified: 2026-05-20T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
