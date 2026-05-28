# Phase 16: Confidence Logic - Research

**Researched:** 2026-05-27
**Domain:** Pure TypeScript string comparison algorithm (Jaccard similarity)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Module Structure**
- File: `src/anna/confidence.ts`
- Export: `computeConfidence(annasTitle: string, crossrefTitle: string | null): ConfidenceLevel`
- Export `ConfidenceLevel` type: `export type ConfidenceLevel = "high" | "low" | "unverified"` — Phase 17 needs it
- Test file: `tests/confidence.test.ts`

**Normalization Details**
- Punctuation regex: `/[^a-z0-9\s]/g` after `.toLowerCase()` — removes all non-alphanumeric except spaces
- Numbers in words: include (e.g., `"figure 2"` matches `"figure 2"`)
- Stop words: no filtering — include all words in Jaccard calculation
- Empty word-set guard: both empty → `"high"`, one empty → `"low"`

**Algorithm (from ROADMAP — locked)**
- Threshold: 0.5 Jaccard (from STATE.md decision)
- Output: `"high"` (≥ 0.5), `"low"` (< 0.5), `"unverified"` (null crossrefTitle)
- Jaccard = |intersection| / |union| on normalized word sets

### Claude's Discretion
- Internal helper function names (e.g., `normalizeTitle`, `jaccardSimilarity`)
- Whether to handle whitespace collapsing (`.trim().split(/\s+/)`)

### Deferred Ideas (OUT OF SCOPE)
- Configurable threshold (deferred to post-v1.4 per STATE.md)
- Stop-word filtering (not required by ROADMAP success criteria)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VER-04 | Title comparison is case-insensitive and strips punctuation before comparing | Normalization pipeline: `.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean)` |
| VER-05 | Confidence is `"high"` when normalized word-overlap (Jaccard ≥ 0.5), `"low"` when < 0.5 | Pure Set math: `|A ∩ B| / |A ∪ B|` — no external library needed |
| VER-06 | Confidence is `"unverified"` when CrossRef is unreachable, times out, returns non-200, or no title | Handled by `null` guard on `crossrefTitle` param — Phase 15 already normalises all these error paths to `null` |
</phase_requirements>

---

## Summary

Phase 16 implements a single pure function `computeConfidence` in `src/anna/confidence.ts`. It receives the Anna's Archive title (always a string) and the CrossRef title (string from Phase 15's `fetchCrossRefTitle`, or `null` when CrossRef failed). It returns one of three typed string literals: `"high"`, `"low"`, or `"unverified"`.

The algorithm is fully specified in CONTEXT.md and STATE.md — there are no design decisions left open. The implementation is approximately 25 lines of vanilla TypeScript: a normalization helper, a Jaccard helper, and the exported function. No external packages are needed. The `ConfidenceLevel` type must be exported because Phase 17 imports it.

The test file (`tests/confidence.test.ts`) should follow the same `describe`/`test` pattern established in `tests/crossref-client.test.ts`. The existing 90-test suite provides a stable baseline; Phase 16 adds tests for this module without touching any other files.

**Primary recommendation:** Implement as two private helpers (`normalizeTitle`, `jaccardSimilarity`) plus one exported function (`computeConfidence`). Keep the module entirely self-contained — no imports needed beyond the type literal definition.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Title normalization | Library (pure TS) | — | No I/O; stateless string transform |
| Jaccard similarity scoring | Library (pure TS) | — | Pure math on Set objects |
| Null-path → "unverified" routing | Library (pure TS) | — | Wraps Phase 15's null contract; no network logic here |
| `ConfidenceLevel` type export | Library (pure TS) | API (Phase 17) | Type is defined here; consumed by Phase 17 response shaping |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (Bun) | 5.9.x (project) | Implementation language | Project-established; `bun test` is the test runner |

No external packages are required or recommended. [VERIFIED: direct codebase inspection]

### Supporting
None. Jaccard similarity on word sets is trivially implementable with JavaScript's built-in `Set` — adding a string-similarity library would be disproportionate for this use case.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `Set` math | `fastest-levenshtein`, `string-similarity` | Those libraries add a dep, solve edit-distance not set-overlap; overkill and wrong algorithm for this spec |

**Installation:** No new packages needed.

---

## Package Legitimacy Audit

No external packages are introduced in this phase. Audit not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
annasTitle: string  ──┐
                      ├──► normalizeTitle() ──► Set<string>
crossrefTitle: string ─┘                            │
       │                                            ▼
       │                                   jaccardSimilarity(A, B)
       │                                            │
       │                                     score: number
       │                                            │
       ▼                                            ▼
  null? ──► "unverified"          score ≥ 0.5? ──► "high"
                                  score < 0.5? ──► "low"
                        (special: both empty sets → "high")
                        (special: one empty set  → "low")
```

### Recommended Project Structure

No new directories. Two files only:

```
src/anna/confidence.ts       # implementation (new)
tests/confidence.test.ts     # tests (new)
```

### Pattern 1: Normalization Pipeline

**What:** Lower-case, strip non-alphanumeric-non-space, collapse whitespace, split into words, filter empty strings.
**When to use:** Applied to both input strings before any comparison.
**Example:**
```typescript
// [ASSUMED] — derived from CONTEXT.md specification
function normalizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
}
```

### Pattern 2: Jaccard Similarity on Sets

**What:** `|A ∩ B| / |A ∪ B|` using JavaScript `Set`.
**When to use:** After normalization; returns a number in [0, 1].
**Example:**
```typescript
// [ASSUMED] — derived from CONTEXT.md specification
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter(w => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  if (union === 0) return 1; // both empty → identical
  return intersection / union;
}
```

### Pattern 3: Empty-Set Guards

**What:** Before calling `jaccardSimilarity`, check if both sets are empty (return `"high"`) or exactly one is empty (return `"low"`).
**Why:** Division-by-zero guard AND requirement from CONTEXT.md.

### Pattern 4: Module Structure (follow crossref-client.ts)

**What:** Pure function exports, no class, module-private helpers. [VERIFIED: direct codebase inspection]
**Example from Phase 15:** `src/anna/crossref-client.ts` — two module-private constants, one exported async function, ~19 lines total.

### Anti-Patterns to Avoid
- **Exporting helper functions:** `normalizeTitle` and `jaccardSimilarity` are implementation details — keep them unexported. Only `computeConfidence` and `ConfidenceLevel` are public surface.
- **Throwing on null input:** The function contract guarantees `"unverified"` on `null` crossrefTitle — never throw.
- **Using `===` on raw titles:** Always normalize first. Raw comparison violates VER-04.
- **Importing from crossref-client:** Phase 16 is a pure function module; it takes a `string | null` argument — it does not call `fetchCrossRefTitle` directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Jaccard on word sets | A custom set-similarity framework | Native `Set` + filter/spread | The algorithm is 3 lines; no library adds value here |
| Type-safe return value | A class or enum | `export type ConfidenceLevel = "high" \| "low" \| "unverified"` | String literal union is idiomatic TypeScript and what Phase 17 expects |

**Key insight:** The algorithm is specified down to the regex. There is nothing to design — only to implement faithfully.

---

## Common Pitfalls

### Pitfall 1: Forgetting to export `ConfidenceLevel`
**What goes wrong:** Phase 17 imports the type from this module. If it's not exported, Phase 17 fails at import time.
**Why it happens:** It's easy to define the type inline in the function signature and forget the standalone `export type` declaration.
**How to avoid:** Declare `export type ConfidenceLevel = "high" | "low" | "unverified"` as a top-level export, separate from the function.
**Warning signs:** TypeScript error in Phase 17's import.

### Pitfall 2: Empty-string words in the Set
**What goes wrong:** `"hello  world".split(/\s+/)` on a string with leading/trailing spaces can produce `""` as a token, inflating set size.
**Why it happens:** `.split(/\s+/)` without `.trim()` or `.filter(Boolean)` on edge-case inputs.
**How to avoid:** Chain `.trim().split(/\s+/).filter(Boolean)` exactly as specified in CONTEXT.md.
**Warning signs:** Test case with extra whitespace returning wrong confidence.

### Pitfall 3: One-sided normalization
**What goes wrong:** Normalizing `annasTitle` but forgetting to normalize `crossrefTitle` before the Jaccard call.
**Why it happens:** The `null`-check for `crossrefTitle` is handled early; it's easy to skip normalization for the non-null path.
**How to avoid:** Both inputs pass through `normalizeTitle()` before comparison.
**Warning signs:** Test with different-case identical titles returning `"low"`.

### Pitfall 4: Missing `both empty → "high"` guard
**What goes wrong:** If both titles normalize to empty sets, `union = 0` causes a division-by-zero returning `NaN`, which fails the `>= 0.5` check and returns `"low"` instead of `"high"`.
**Why it happens:** Treating the empty-set case as a normal Jaccard path.
**How to avoid:** In `jaccardSimilarity`, return `1` (or `1.0`) when `union === 0`. This means `computeConfidence("", "")` returns `"high"` as specified.
**Warning signs:** Test for `computeConfidence("", "")` returning `"low"` or `"unverified"`.

---

## Code Examples

### Full implementation sketch (~25 lines)

```typescript
// [ASSUMED] — derived from CONTEXT.md and established project patterns
// File: src/anna/confidence.ts

export type ConfidenceLevel = "high" | "low" | "unverified";

function normalizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]).size;
  if (union === 0) return 1; // both empty → treat as identical
  const intersection = [...a].filter(w => b.has(w)).length;
  return intersection / union;
}

export function computeConfidence(
  annasTitle: string,
  crossrefTitle: string | null
): ConfidenceLevel {
  if (crossrefTitle === null) return "unverified";
  const a = normalizeTitle(annasTitle);
  const b = normalizeTitle(crossrefTitle);
  if (a.size === 0 && b.size === 0) return "high";
  if (a.size === 0 || b.size === 0) return "low";
  return jaccardSimilarity(a, b) >= 0.5 ? "high" : "low";
}
```

### Test file sketch (following crossref-client.test.ts pattern)

```typescript
// [ASSUMED] — illustrative, not prescriptive on test count
// File: tests/confidence.test.ts
import { describe, expect, test } from "bun:test";
import { computeConfidence } from "../src/anna/confidence";

describe("computeConfidence", () => {
  test('returns "unverified" when crossrefTitle is null', () => { ... });
  test('returns "high" for identical titles', () => { ... });
  test('returns "high" for ≥ 0.5 Jaccard (different word order)', () => { ... });
  test('returns "low" for < 0.5 Jaccard (mostly different words)', () => { ... });
  test('is case-insensitive', () => { ... });
  test('strips punctuation before comparing', () => { ... });
  test('returns "high" when both titles normalize to empty string', () => { ... });
  test('returns "low" when one title is empty and the other is not', () => { ... });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Edit-distance (Levenshtein) for title similarity | Set-based Jaccard on word tokens | CONTEXT.md decision | Word-order-insensitive; handles title variants like "A Study of X" vs "Study of X, A" better |

**Deprecated/outdated:** No previous implementation — this is a new module.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Implementation sketch in Code Examples section | Code Examples | Sketch may have minor bugs — the normalization pipeline and guard conditions are locked by CONTEXT.md so algorithmic correctness is high-confidence; syntax errors are low-risk (TypeScript will catch them) |

---

## Open Questions

None. All design decisions are locked by CONTEXT.md and ROADMAP success criteria. The algorithm, file location, function signature, type name, normalization regex, threshold, and edge-case handling are all specified.

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. This phase is a code-only change with no CLI tools, network services, or runtimes beyond Bun (already installed, 90 tests passing).

---

## Sources

### Primary (HIGH confidence)
- `16-CONTEXT.md` — all locked decisions, normalization spec, algorithm
- `src/anna/crossref-client.ts` — verified Phase 15 output; null-contract for crossrefTitle param
- `tests/crossref-client.test.ts` — verified test pattern to replicate
- `src/anna/types.ts` — verified `FetchLike` interface; confirms no new types needed from types.ts
- `.planning/REQUIREMENTS.md` — VER-04, VER-05, VER-06 requirement text
- `.planning/STATE.md` — 0.5 Jaccard threshold locked decision; configurable threshold deferred

### Secondary (MEDIUM confidence)
- Phase 15 SUMMARY (`15-01-SUMMARY.md`) — confirms fetchCrossRefTitle signature, null contract, and that Phase 16 is unblocked

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external packages; pure TypeScript with Bun test runner already in place
- Architecture: HIGH — fully specified in CONTEXT.md; pattern mirrors Phase 15 directly
- Pitfalls: HIGH — all identified from first-principles analysis of the algorithm (empty sets, export omission, one-sided normalization)

**Research date:** 2026-05-27
**Valid until:** Until CONTEXT.md or REQUIREMENTS.md are revised (algorithm is locked)
