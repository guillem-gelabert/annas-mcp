---
phase: 15-crossref-client
fixed_at: 2026-05-27T18:00:00Z
review_path: .planning/phases/15-crossref-client/15-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 2
skipped: 2
status: partial
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-05-27T18:00:00Z
**Source review:** .planning/phases/15-crossref-client/15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 2 (WR-02, WR-03)
- Skipped: 2 (CR-01, WR-01 — user decisions from CONTEXT.md)

## Fixed Issues

### WR-02: Distinguish expected vs unexpected errors in CrossRef catch block

**Files modified:** `src/anna/crossref-client.ts`, `tests/crossref-client.test.ts`
**Commit:** 257e56d
**Applied fix:** Replaced bare `catch {}` with a typed `catch (err)` block that returns `null` for `DOMException` with `name === "TimeoutError"` (request timeout) and `TypeError` (network failure), and re-throws any other unexpected error so callers and monitoring can observe it. Also updated the test that previously threw `new Error("network failure")` to correctly throw `new TypeError("Failed to fetch")`, matching the actual error type the Fetch API produces for network-level failures.

---

### WR-03: Add Zod schema validation for CrossRef API response

**Files modified:** `src/anna/crossref-client.ts`
**Commit:** 7e1815c
**Applied fix:** Replaced the unsafe `as { message?: { title?: string[] } }` type cast with a proper Zod schema (`crossRefWorkSchema`) defined using `z` from `zod/v4`, consistent with the pattern used in `src/anna/types.ts`. The `response.json()` result is now validated via `.safeParse()`; on parse failure the function returns `null` rather than proceeding with an unchecked shape.

## Skipped Issues

### CR-01: Hardcoded placeholder email in User-Agent violates CrossRef Etiquette

**File:** `src/anna/crossref-client.ts:3`
**Reason:** User explicitly locked `noreply@example.com` as the User-Agent email during the discuss-phase (CONTEXT.md, "Request Identity" section). This is an intentional decision. The placeholder is not to be replaced by an env var or a real address at this phase.
**Original issue:** `noreply@example.com` is a reserved-domain address that may route traffic to CrossRef's unthrottled pool or trigger blocking.

---

### WR-01: `fetchCrossRefTitle` is exported but never imported — dead export

**File:** `src/anna/crossref-client.ts:6`
**Reason:** By design. CONTEXT.md states "Phase 16 (Confidence Logic) will import `fetchCrossRefTitle`" and "Phase 17 (Response Integration) consumes confidence logic output." The module is intentionally isolated in Phase 15; wiring happens in Phases 16-17. This is not a defect.
**Original issue:** `fetchCrossRefTitle` is not imported anywhere in the current codebase.

---

_Fixed: 2026-05-27T18:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
