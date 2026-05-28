---
phase: 11-api-schema
plan: "01"
subsystem: article-tools
tags: [schema, zod, batch, api-contract, tdd]
dependency_graph:
  requires: []
  provides: [articleDownloadInputSchema-batch, articleBatchDownloadOutputSchema, ArticleBatchResult, handleArticleDownload-batch-stub]
  affects: [src/tools/article-tools.ts, tests/article-tools.test.ts]
tech_stack:
  added: []
  patterns: [zod-superRefine, schema-mutual-exclusion, routing-stub]
key_files:
  created: []
  modified:
    - src/tools/article-tools.ts
    - tests/article-tools.test.ts
decisions:
  - "Used superRefine on the z.object() to enforce doi XOR dois at validation time with a shared error message"
  - "Non-null assertion (args.doi!) used in single-DOI path since superRefine + early return guarantee doi is present"
  - "Batch stub returns bare { content: [...] } without isError field (falsy by absence)"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-05-20"
  tasks_completed: 2
  files_modified: 2
---

# Phase 11 Plan 01: API Schema Extension Summary

Zod schema extended with `dois?: string[]` and mutual-exclusion superRefine; batch output schema and ArticleBatchResult type exported; routing stub in handleArticleDownload; 7 new schema unit tests added.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend schema and add batch type + routing stub | 3df0c7e | src/tools/article-tools.ts |
| 2 | Add schema unit tests | 2cc9a8d | tests/article-tools.test.ts |

## What Was Built

### Task 1: articleDownloadInputSchema extension

- `doi` made optional (was required)
- `dois: z.array(...).min(1).optional()` added with same DOI regex as single `doi`
- `.superRefine()` enforces doi XOR dois: fires when both present OR neither present, with message "Provide either doi (single) or dois (array), not both"
- `articleBatchResultSchema` (internal): `{ doi, article, sources, filePath?, error? }`
- `articleBatchDownloadOutputSchema` (exported): `{ results: articleBatchResultSchema[] }`
- `ArticleBatchResult` type exported
- `handleArticleDownload` gains early-return stub: `if ("dois" in args && args.dois)` returns `{ content: [{ type: "text", text: "batch not yet implemented" }] }`
- Single-DOI path uses `args.doi!` non-null assertion (safe: superRefine + stub return guarantee)

### Task 2: Schema unit tests

New describe block `"article_download schema validation"` with 7 tests:
1. Single doi passes schema validation
2. Multi doi passes schema validation
3. doi and dois both provided fails validation (checks exact error message)
4. Empty dois array fails validation (min(1))
5. Invalid doi string in dois array fails validation (regex)
6. Neither doi nor dois fails validation (checks exact error message)
7. Batch stub returns non-error result for dois input (no-network fetchImpl)

## Verification

```
bun test: 81 pass, 0 fail (74 pre-existing + 7 new)
```

Spot-check:
- `articleDownloadInputSchema.safeParse({ doi: '10.1038/x', dois: ['10.1016/y'] }).error.issues[0].message` → "Provide either doi (single) or dois (array), not both"
- `articleBatchDownloadOutputSchema` and `ArticleBatchResult` are named exports
- `handleArticleDownload({ dois: ['10.1038/x'] }, { config, fetchImpl: noNetworkFetch })` → `{ content: [{ type: 'text', text: 'batch not yet implemented' }] }`, isError falsy
- `registerArticleTools` still registers exactly 2 tools

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. Input validation for `dois` array elements uses the same `/^10\.\d{4,}[^\s]*$/` regex as the existing `doi` field, satisfying T-11-01. Batch stub exposes no internals (T-11-03 accepted). No new packages installed (T-11-SC accepted).

## Known Stubs

| File | Location | Description |
|------|----------|-------------|
| src/tools/article-tools.ts | handleArticleDownload dois branch | Returns "batch not yet implemented" — intentional stub; Phase 12 (batch-execution) implements the real handler |

## Self-Check: PASSED

- [x] `src/tools/article-tools.ts` modified with schema extensions, batch schemas, routing stub
- [x] `tests/article-tools.test.ts` modified with 7 new schema tests
- [x] Commit 3df0c7e exists (Task 1)
- [x] Commit 2cc9a8d exists (Task 2)
- [x] 81 tests pass, 0 fail
