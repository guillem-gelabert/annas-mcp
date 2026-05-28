---
status: resolved
trigger: "MCP call returns: Download requested but ANNAS_DOWNLOAD_PATH is not configured. Set ANNAS_DOWNLOAD_PATH on the server before requesting downloads."
created: 2026-05-27
updated: 2026-05-27
---

# Debug Session: download-path-not-configured

## Symptoms

- expected_behavior: MCP article download should return article download URLs/metadata without requiring local file writes.
- actual_behavior: MCP call returns an error requiring `ANNAS_DOWNLOAD_PATH`.
- error_messages: `Download requested but ANNAS_DOWNLOAD_PATH is not configured. Set ANNAS_DOWNLOAD_PATH on the server before requesting downloads.`
- timeline: unknown.
- reproduction: Call the MCP `article_download` tool in a way that includes `download: true`.

## Current Focus

- hypothesis: `article_download` still supports and advertises an opt-in file write path, so MCP clients may request `download: true` and trigger `resolveDownloadRoot()`.
- test: inspect article tool schema/handler and run focused tests after patching.
- expecting: removing or ignoring file-write inputs should make `article_download` return metadata without `ANNAS_DOWNLOAD_PATH`.
- next_action: resolved; verify MCP client reloads tool schema.

## Evidence

- 2026-05-27: `src/tools/article-tools.ts` only calls `resolveDownloadRoot()` inside `if (args.download)`.
- 2026-05-27: `src/anna/file-utils.ts` throws the exact reported error when `configuredRoot` is null.

## Eliminated

## Resolution

- root_cause: `article_download` advertised `download` and `downloadPath` MCP inputs. When an MCP client sent `download: true`, the handler entered the legacy local file-write path and required `ANNAS_DOWNLOAD_PATH`.
- fix: Removed `download` and `downloadPath` from the public article MCP input schema, then removed the stale article local file-write handler path and helpers entirely. Updated the tool description/read-only annotations and documented article downloads as URL/metadata resolution only.
- verification: `~/.bun/bin/bun run typecheck`; `~/.bun/bin/bun test tests/article-tools.test.ts`; `~/.bun/bin/bun test`; MCP schema check against `dist/server.js`
- files_changed: `src/tools/article-tools.ts`, `tests/article-tools.test.ts`, `README.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
