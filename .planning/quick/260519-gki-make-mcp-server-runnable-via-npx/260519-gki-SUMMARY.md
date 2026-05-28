---
phase: quick
plan: 260519-gki
subsystem: packaging
tags: [build, node, npx, packaging]
key-files:
  modified:
    - package.json
decisions:
  - Use bun build --target node to produce a standalone Node.js bundle for npx compatibility
  - Omit @cfworker/json-schema (not imported anywhere in codebase)
  - Remove "private: true" to allow future publishing
metrics:
  duration: ~5 minutes
  completed: 2026-05-19
---

# Quick Task 260519-gki: Make MCP Server Runnable via npx Summary

**One-liner:** Added Node.js build pipeline with bin entry so `npx annas-mcp` can run the server without Bun.

## What Was Done

### Task 1 - Configure package.json for Node build

Added to `package.json`:
- `bin.annas-mcp` pointing to `./dist/server.js`
- `scripts.build`: bundles `src/server.ts` targeting Node, prepends shebang, sets executable bit
- `scripts.prepublishOnly`: runs build before npm publish

Did NOT add `@cfworker/json-schema` - it is not imported anywhere in the codebase.

Removed `"private": true` to allow future publishing.

Ran `bun install` - no dependency changes, bun.lock unchanged.

All 25 tests passed after change.

### Task 2 - Build and verify

Ran `bun run build` - bundled 332 modules into `dist/server.js` (2.60 MB).

Verified server starts under Node:
```
$ echo "" | ANNAS_SECRET_KEY=test-key node dist/server.js 2>&1
annas-mcp-ts running on stdio
```
Server connected to stdio transport and exited cleanly when stdin closed - correct MCP behavior.

Committed `package.json` as `feat: add Node build for npx/node execution` (commit `1a2bbcf`).

`dist/` is gitignored - `dist/server.js` was not staged or committed.

Final `bun test`: 25 pass, 0 fail.

## Commits

| Hash | Message |
|------|---------|
| 1a2bbcf | feat: add Node build for npx/node execution |

## Deviations from Plan

**1. [Rule 1 - Clarification] @cfworker/json-schema was not present to remove**
- The plan said "remove @cfworker/json-schema" but it was never in package.json
- No action needed - the dependency was absent from the start
- The other additions (bin, build, prepublishOnly) were added as instructed

**2. [Rule 3 - Build verification] Used stdin pipe instead of `timeout` command**
- `timeout` command not available on macOS without GNU coreutils
- Used `echo "" | node dist/server.js` to verify startup - equivalent proof that the server initializes and connects to stdio transport

## Self-Check: PASSED

- package.json modified and committed: FOUND (1a2bbcf)
- dist/ in .gitignore: CONFIRMED
- dist/server.js not committed: CONFIRMED
- 25 tests passing: CONFIRMED
