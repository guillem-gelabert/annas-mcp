---
phase: 18
plan: "18-01"
title: "Real LLM token eval — Go vs TS MCP server comparison"
status: checkpoint
checkpoint: "human-verify — run bun scripts/token-eval.ts with real ANNAS_SECRET_KEY and ANTHROPIC_API_KEY"
subsystem: scripts
tags: [benchmark, token-eval, go, typescript, mcp]
dependency_graph:
  requires: []
  provides: [token-eval-script]
  affects: [package.json]
tech_stack:
  added: ["@anthropic-ai/sdk@0.99.0"]
  patterns: [MCP-stdio-client, Claude-messages-api]
key_files:
  created:
    - scripts/token-eval.ts
  modified:
    - package.json
    - bun.lock
decisions:
  - "stderr must be set to 'pipe' in StdioServerParameters to access transport.stderr stream"
  - "Scenario 4 Go path: 5 sequential single-DOI runScenario calls with token sums (Go has no batch tool)"
metrics:
  completed: "2026-05-28"
---

# Phase 18 Plan 01: Real LLM Token Eval — Go vs TS MCP Server Summary

## One-liner

Token eval harness using Claude API + MCP stdio clients to measure actual input/output token counts across 6 scenarios for both Go and TS servers.

## What was done

- Added `@anthropic-ai/sdk@0.99.0` to `package.json` dependencies
- Created `scripts/token-eval.ts`: full eval harness that:
  1. Validates `ANNAS_SECRET_KEY` and `ANTHROPIC_API_KEY` env vars before doing anything
  2. Builds the Go binary from `annas-mcp-go/` via `go build`
  3. Spawns both MCP servers as stdio child processes using `StdioClientTransport`
  4. Fetches tool definitions from each server and converts them to `Anthropic.Tool[]` shape
  5. Runs 6 scenarios via `anthropic.messages.create` (model: `claude-sonnet-4-6`)
  6. For scenario 4 (batch 5 DOIs): calls TS once with full batch prompt; calls Go 5 times sequentially, one per DOI, and sums token counts
  7. Prints a Markdown comparison table to stdout with per-scenario Ratio (TS/Go) and a Total row

## Status

Awaiting human verification: run `ANNAS_SECRET_KEY=... ANTHROPIC_API_KEY=... bun scripts/token-eval.ts`

## Files created/modified

- `scripts/token-eval.ts` (new) — MCP client harness + Claude API token measurement
- `package.json` (modified) — added `@anthropic-ai/sdk` dependency
- `bun.lock` (modified) — lockfile updated with new dependency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Config] Added `stderr: "pipe"` to StdioServerParameters**
- **Found during:** Task 2 — reviewing `StdioClientTransport` type definitions
- **Issue:** The plan's `connectServer` code accesses `transport.stderr?.on("data", ...)` but the `stderr` property on `StdioClientTransport` only returns a stream when `StdioServerParameters.stderr` is set to `"pipe"` (per SDK docs). Without it, `transport.stderr` is always `null` and stderr output from child processes is silently discarded.
- **Fix:** Added `stderr: "pipe"` to both Go and TS server parameters
- **Files modified:** `scripts/token-eval.ts`
- **Commit:** 1181391

## Self-Check: PASSED

- `scripts/token-eval.ts` exists at `/Users/guillem/vault/projects/_tools/annas-mcp/scripts/token-eval.ts`
- Task 1 commit: 065c168
- Task 2 commit: 1181391
- `bun run typecheck` exits 0 with no errors
