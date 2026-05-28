---
quick_task: 260519-g0n
title: Implement Security Remediations from SECURITY.md
date: "2026-05-19"
completed: true
tags: [security, input-validation, hardening]
key-files:
  modified:
    - .gitignore
    - src/anna/client.ts
    - src/anna/types.ts
    - src/tools/article-tools.ts
    - tests/anna.test.ts
    - tests/article-tools.test.ts
decisions:
  - Use encodeURIComponent (not encodeURI) for DOI path segments to prevent path traversal
  - Derive FastDownloadResponse type from Zod schema for runtime safety
  - Sanitize fast-download API errors before surfacing to MCP clients
metrics:
  tasks_completed: 3
  tasks_total: 3
  commits: 3
  tests_before: 21
  tests_after: 21
---

# Quick Task 260519-g0n: Implement Security Remediations from SECURITY.md Summary

**One-liner:** Six SEC findings remediated across input validation, schema hardening, request timeouts, error sanitization, and gitignore hygiene.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Housekeeping: .mcp.json to gitignore, remove dead redactUrl (SEC-02, SEC-10) | e75eb72 | `.gitignore`, `src/anna/client.ts` |
| 2 | Input validation: DOI encodeURIComponent, fast-download URL schema (SEC-03, SEC-07) | f4ec16d | `src/anna/client.ts`, `src/anna/types.ts`, `src/tools/article-tools.ts`, `tests/anna.test.ts`, `tests/article-tools.test.ts` |
| 3 | Outbound request hardening: 20s timeout, sanitize API error messages (SEC-05, SEC-06) | 4016f6b | `src/anna/client.ts` |

## Changes by Security Finding

### SEC-02 — .mcp.json in .gitignore
Added `.mcp.json` to `.gitignore` so local MCP server config containing tool configurations is never committed to version control.

### SEC-10 — Remove dead redactUrl method
Removed `redactUrl` from `AnnasClient`. The method had no callers and its existence implied URL redaction was happening when it was not. Also removed the unused `redactSecret` import from `client.ts`.

### SEC-03 — Path traversal via DOI
Changed `scidbLookupUrl` to use `encodeURIComponent(doi)` instead of `encodeURI(doi)`. The `/` character in DOI values (e.g. `10.1038/nature12345`) was not encoded by `encodeURI`, potentially allowing path traversal on the remote server. Now produces `/scidb/10.1038%2Fnature12345`.

Updated tests that asserted on the old unencoded path in both `anna.test.ts` and `article-tools.test.ts`.

### SEC-07 — Validate fast-download response schema
Added `fastDownloadResponseSchema` (Zod) to `src/anna/types.ts`. `FastDownloadResponse` is now derived from the schema via `z.infer<>` rather than a hand-written interface. `fetchFastDownload` uses `fastDownloadResponseSchema.parse(raw)` instead of an unsafe type cast. The `download_url` field is validated to start with `https://` — any non-https URL is rejected at parse time.

### SEC-05 — 20-second request timeout
Added `signal: AbortSignal.timeout(20_000)` to both `fetchText` and `fetchFastDownload`. Prevents hung requests from blocking the MCP server indefinitely.

### SEC-06 — Sanitize API error messages
In `fetchFastDownload`, the raw API error value from `data.error` is now logged to `stderr` before throwing. The thrown `AnnasClientError` carries the generic message "API returned an error. Check server logs for details." instead of propagating untrusted API-provided strings to MCP clients.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — all changes reduce existing threat surface, no new surface introduced.

## Self-Check: PASSED

- `.gitignore` updated with `.mcp.json`: confirmed
- `redactUrl` removed from `src/anna/client.ts`: confirmed
- `encodeURIComponent` in `scidbLookupUrl`: confirmed
- DOI regex on `articleDownloadInputSchema`: confirmed
- `fastDownloadResponseSchema` in `src/anna/types.ts`: confirmed
- `fastDownloadResponseSchema.parse()` in `fetchFastDownload`: confirmed
- `AbortSignal.timeout(20_000)` in both fetch methods: confirmed
- Error sanitization in `fetchFastDownload`: confirmed
- All 3 commits exist: e75eb72, f4ec16d, 4016f6b — confirmed
- `bun test`: 21 pass, 0 fail — confirmed
