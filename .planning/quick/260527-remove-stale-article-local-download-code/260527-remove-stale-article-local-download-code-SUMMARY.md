---
quick_id: 260527
slug: remove-stale-article-local-download-code
status: complete
completed: 2026-05-27
---

# Quick Task Summary: Remove Stale Article Local-Download Code

## Result

`article_download` is now URL/metadata-only. The stale article PDF file-write path, direct `download`/`downloadPath` handler support, article `filePath` response fields, and article-specific local download helpers/tests were removed.

## Files Changed

- `src/tools/article-tools.ts` — removed local article file-writing code and kept single/batch metadata resolution plus base URL recovery.
- `tests/article-tools.test.ts` — removed article local-write tests; kept schema, single DOI, batch DOI, error isolation, and base URL circuit-breaker coverage.
- `README.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — updated current docs to reflect article non-writing behavior.
- `.planning/debug/download-path-not-configured.md` — retained resolved debug context.

## Verification

- `~/.bun/bin/bun run typecheck`
- `~/.bun/bin/bun test tests/article-tools.test.ts`
- `~/.bun/bin/bun test`
- Rebuilt `dist/server.js` with `~/.bun/bin/bun run build`
- Verified the MCP `article_download` schema from `dist/server.js` exposes only `doi` and `dois`, with read-only/idempotent annotations.
