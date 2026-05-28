---
quick_id: 260527
slug: remove-stale-article-local-download-code
status: planned
created: 2026-05-27
---

# Quick Task Plan: Remove Stale Article Local-Download Code

## Objective

Make `article_download` a metadata/URL resolution tool only. Remove legacy article file-writing behavior that required `ANNAS_DOWNLOAD_PATH`, including direct handler support, local write helpers, file-path output fields, and tests that only cover article PDF writes.

## Tasks

1. Remove article local-download inputs/outputs and file-writing helpers from `src/tools/article-tools.ts`.
2. Trim `tests/article-tools.test.ts` to keep metadata resolution, schema, batch lookup, and base URL circuit-breaker coverage.
3. Update docs/planning text so article downloads are described as non-writing.
4. Run typecheck and tests.

## Verification

- `~/.bun/bin/bun run typecheck`
- `~/.bun/bin/bun test tests/article-tools.test.ts`
- `~/.bun/bin/bun test`
