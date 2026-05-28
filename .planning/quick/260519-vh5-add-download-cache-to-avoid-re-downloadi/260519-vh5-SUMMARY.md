---
phase: quick-260519-vh5
plan: "01"
subsystem: download-cache
tags: [cache, file-utils, book-tools, article-tools, tdd]
dependency_graph:
  requires: []
  provides: [download-cache]
  affects: [src/anna/file-utils.ts, src/tools/book-tools.ts, src/tools/article-tools.ts]
tech_stack:
  added: []
  patterns: [content-addressed-cache, best-effort-write, stale-entry-skip]
key_files:
  created:
    - tests/file-utils-cache.test.ts
  modified:
    - src/anna/file-utils.ts
    - src/tools/book-tools.ts
    - src/tools/article-tools.ts
    - tests/book-tools.test.ts
    - tests/article-tools.test.ts
decisions:
  - DOI keys normalized to lowercase before storage to avoid case-sensitive duplicates
  - Cache write errors silently swallowed — cache is best-effort, download still succeeds
  - Stale entries (file deleted) return null but are not removed from index (cleanup deferred to future writes)
metrics:
  duration: "~8 minutes"
  completed: "2026-05-19"
  tasks_completed: 2
  files_modified: 5
  files_created: 1
---

# Phase quick-260519-vh5 Plan 01: Add Download Cache Summary

**One-liner:** Content-addressed download cache using `.annas-cache.json` index; MD5-keyed for books and DOI-keyed for articles; skips network fetch on hit.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing tests for cache helpers | 35289c0 | tests/file-utils-cache.test.ts |
| 1 (GREEN) | Add checkDownloadCache and recordDownloadCache | 77bb4cb | src/anna/file-utils.ts |
| 2 (RED) | Add failing cache-hit tests for handlers | 327739c | tests/book-tools.test.ts, tests/article-tools.test.ts |
| 2 (GREEN) | Wire cache into book and article handlers | 018ea58 | src/tools/book-tools.ts, src/tools/article-tools.ts |

## What Was Built

### src/anna/file-utils.ts
- `CacheKey` interface: `{ hash?: string; doi?: string }`
- `checkDownloadCache(downloadRoot, key): string | null` — reads `.annas-cache.json`, validates file exists on disk, returns path or null
- `recordDownloadCache(downloadRoot, key, filePath): void` — merges into existing index, silently swallows write errors
- Private `cacheKeyString` helper: returns `md5:<hash>` or `doi:<doi>` (lowercased), null if both absent

### src/tools/book-tools.ts
- `handleBookDownload`: calls `checkDownloadCache({ hash })` before `saveBookFile`; on hit returns cached path directly; on miss calls `saveBookFile` then `recordDownloadCache`

### src/tools/article-tools.ts
- `handleArticleDownload`: calls `checkDownloadCache({ doi })` before `saveArticleFile`; on hit returns cached path directly; on miss calls `saveArticleFile` then `recordDownloadCache`

### tests/file-utils-cache.test.ts (new — 10 tests)
- Covers: missing cache file, key absent, stale entry, valid hit (hash), valid hit (doi), empty key
- Covers: record creates file with md5 key, doi key, merges existing, no-op on empty key

### tests/book-tools.test.ts / tests/article-tools.test.ts
- Added cache-hit tests using real temp dir (unavoidable for disk I/O path)
- Pre-populates `.annas-cache.json` and dummy file; asserts returned filePath equals cached path

## TDD Gate Compliance

- RED gate: `test(260519-vh5-01)` commits exist for both tasks (35289c0, 327739c)
- GREEN gate: `feat(260519-vh5-01)` commits exist after RED (77bb4cb, 018ea58)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Verification

T-vh5-01 (Tampering): `checkDownloadCache` validates returned path via `existsSync` before returning — mitigated as specified.
T-vh5-02 (Info Disclosure): No new exposure; cache file is inside operator-owned `ANNAS_DOWNLOAD_PATH`.
T-vh5-03 (DoS): Write errors in `recordDownloadCache` are silently swallowed; download still succeeds.

## Known Stubs

None.

## Self-Check: PASSED

- src/anna/file-utils.ts: FOUND
- src/tools/book-tools.ts: FOUND
- src/tools/article-tools.ts: FOUND
- tests/file-utils-cache.test.ts: FOUND
- Commit 35289c0: FOUND
- Commit 77bb4cb: FOUND
- Commit 327739c: FOUND
- Commit 018ea58: FOUND
- All 19 tests pass; bun typecheck exits 0
