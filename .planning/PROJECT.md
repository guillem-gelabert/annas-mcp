# annas-mcp-ts

## What This Is

A Bun-based TypeScript MCP server that ports the capabilities of `iosifache/annas-mcp` from Go to TypeScript. Exposes `article_search`, `article_download`, `book_search`, `book_download`, and `update_base_url` as MCP tools. Automatically discovers and caches the Anna's Archive base URL from Wikipedia, with manual override support and offline recovery for all tools.

## Core Value

MCP clients can reliably search for articles and books, and obtain usable download URLs/metadata from Anna's Archive through a small, Bun-native TypeScript server — even as the mirror URL changes.

## Current Milestone: v1.5 (TBD)

**Goal:** TBD — v1.4 DOI Verification shipped 2026-05-27.

## Shipped Milestones

- ✅ **v1.0 MVP** — Phases 1–4 (shipped 2026-05-18): article_search + article_download, auth, base URL config
- ✅ **v1.1 Mirror Resilience** — Phases 5–7 (shipped 2026-05-19): Wikipedia-based URL discovery, server-side cache, update_base_url tool
- ✅ **v1.2 Book Tools** — Phases 8–10 (shipped 2026-05-19): book_search + book_download, file-utils.ts, tech debt clearance
- ✅ **v1.3 Batch Article Download** — Phases 11–14 (shipped 2026-05-21): dois[] input, parallel pipeline, circuit breakers, codex remediation
- ✅ **v1.4 DOI Verification** — Phases 15–17 (shipped 2026-05-27): CrossRef title lookup, Jaccard confidence scoring, verification field in article_download responses

## Current State (v1.4 shipped)

**Shipped:** v1.4 DOI Verification — 2026-05-27
**Latest:** `article_download` responses include `verification: { crossrefTitle, annasTitle, confidence }` on every result
**Codebase:** ~1,150 LOC TypeScript (src) + ~900 LOC (tests) ≈ 2,050 total
**Stack:** Bun, TypeScript, MCP SDK (`@modelcontextprotocol/sdk`)
**Tools:** `article_search`, `article_download`, `book_search`, `book_download`, `update_base_url`
**Build:** Bun-native + Node/npx compatibility layer
**Tests:** 104 passing across 9 test files

## Requirements

### Validated

- ✓ Provide an MCP server runnable with Bun. — v1.0 phases 1-4
- ✓ Expose `article_search` for searching articles by DOI or keywords. — v1.0 phases 2-3
- ✓ Expose `article_download` for resolving article download URLs and metadata by DOI. — v1.0 phases 2-3
- ✓ Authenticate Anna's Archive API requests with `ANNAS_SECRET_KEY`. — v1.0 phase 1
- ✓ Support configurable Anna's Archive mirror/base URL through `ANNAS_BASE_URL`. — v1.0 phase 1
- ✓ Return download metadata and URLs from `article_download` without writing files locally. — v1.0 phase 2
- ✓ Document MCP client configuration and required environment variables. — v1.0 phase 4
- ✓ Expose `update_base_url` as an MCP tool for refreshing the cached Anna's Archive base URL. — v1.1 phase 7
- ✓ Discover base URL candidates from the Anna's Archive Wikipedia infobox link cell. — v1.1 phase 5
- ✓ Exclude Wikipedia links added less than 24 hours ago based on page revision history. — v1.1 phase 5
- ✓ Cache discovered base URL results and use them for automatic base URL selection. — v1.1 phase 6
- ✓ Preserve `ANNAS_BASE_URL` as the manual override when it is set. — v1.1 phase 6
- ✓ Return clear guidance when a manually configured `ANNAS_BASE_URL` appears offline. — v1.1 phase 7
- ✓ Recover from offline automatic base URLs by invoking the update/discovery path. — v1.1 phase 7
- ✓ Expose `book_search` for searching Anna's Archive books by title/author/ISBN/identifier. — v1.2 phase 8
- ✓ `book_search` returns 8-field structured results (language, format, publisher, title, authors, size, hash, pageUrl). — v1.2 phase 8
- ✓ `book_search` uses `BaseUrlManager` with offline recovery. — v1.2 phase 8
- ✓ Expose `book_download` for resolving book download URLs by MD5 hash; optional file write. — v1.2 phase 9
- ✓ `book_download` file writing reuses shared security utilities from `file-utils.ts`. — v1.2 phase 9
- ✓ Extract shared security utilities to `file-utils.ts` eliminating duplication. — v1.2 phase 9 (REF-01)
- ✓ Surface `readCache()` errors in `update_base_url` output. — v1.2 phase 10 (TD-01)
- ✓ Test offline automatic retry path end-to-end. — v1.2 phase 10 (TD-02)
- ✓ Fix `WIKIPEDIA_SELECTOR` misleading constant name and value. — v1.2 phase 10 (TD-03)
- ✓ Return actionable guidance when both mirrors are offline. — v1.2 phase 10 (TD-04)

### Validated (v1.4)

- ✓ Cross-validate Anna's Archive DOI resolution against CrossRef to detect wrong-paper returns — v1.4 phase 17
- ✓ Surface verification confidence (`high` / `low` / `unverified`) in `article_download` response — v1.4 phase 17
- ✓ Handle CrossRef unavailability gracefully — never block sources on a third-party API failure — v1.4 phase 17
- ✓ CrossRef API client (`fetchCrossRefTitle`) retrieves canonical paper title by DOI — v1.4 phase 15
- ✓ Jaccard similarity confidence scoring (`computeConfidence`) on normalized word sets — v1.4 phase 16

### Validated (v1.3)

- ✓ `article_download` accepts `doi: string` (single, existing) or `dois: string[]` (new) as mutually exclusive inputs — v1.3 phase 11
- ✓ Batch handler normalizes both input forms to an internal array and processes all DOIs — v1.3 phase 11
- ✓ Parallel URL/metadata resolution within a batch call — v1.3 phase 12
- ✓ Batch-scoped circuit breaker for `base_url`: first resolution failure triggers one re-discovery; remaining DOIs resume with new mirror or fast-fail — v1.3 phase 13
- ✓ Single-DOI path (`doi: string`) retains existing behavior with no regression — v1.3 phase 13
- ✓ Manual `ANNAS_BASE_URL` honored in batch mode (no silent rediscovery) — v1.3 phase 14
- ✓ Stale article local file-write path removed; `article_download` is URL/metadata-only — quick cleanup 2026-05-27

### Out of Scope

- CLI commands — v1 is MCP-only; a CLI wrapper can be considered after MCP parity is useful.
- `ANNAS_DOWNLOAD_PATH` for article tools — article downloads are non-writing.
- MCP protocol cache as mirror cache — MCP cache hints are client-side freshness hints; mirror resilience needs server-side state. (documented in README)
- Silent fallback away from manual `ANNAS_BASE_URL` — user explicitly wants manual env configuration to win.
- Trusting newly added Wikipedia links — user requires links present for at least 24 hours.
- `book_download` SciDB fallback — Go upstream doesn't implement it; books use fast_download only.
- Magic bytes validation for book files — books are multi-format (EPUB, DJVU, MOBI, etc.); PDF-only check not applicable.
- Streaming book downloads — return URL or write file is sufficient for v1.x.

## Context

The upstream project is `iosifache/annas-mcp`, a Go MCP server and CLI for Anna's Archive. The current upstream README describes four operations: `book_search`, `book_download`, `article_search`, and `article_download`; this project now has full parity with all four operations (plus `update_base_url` for mirror management).

Shipped v1.0 with core article search/download. Shipped v1.1 with mirror resilience: Wikipedia-based discovery, server-side cache, `update_base_url` tool, and offline recovery. Also added Node/npx compatibility and security hardening. Shipped v1.2 with book tools: `book_search` and `book_download` with shared security utilities and full tech debt clearance.

## Constraints

- **Runtime**: Bun-first TypeScript — the package should run naturally under Bun instead of Node-first tooling.
- **Surface area**: MCP server only — no CLI commands in v1.x.
- **Download behavior**: Article tools are non-writing — return URLs and metadata, do not save files to disk.
- **Configuration**: Environment variables — require `ANNAS_SECRET_KEY`; support optional `ANNAS_BASE_URL`. `ANNAS_DOWNLOAD_PATH` is only relevant to legacy book file-write behavior.
- **Responsible use**: The project should document that users are responsible for respecting copyright and using Anna's Archive access appropriately.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build a TypeScript port of `iosifache/annas-mcp` | The goal is to provide a TypeScript/Bun implementation of the existing MCP idea. | ✓ Good — shipped v1.0, v1.1, v1.2, v1.3 |
| Use Bun as the runtime/package manager | User selected Bun for the port. | ✓ Good — also added Node/npx compat layer |
| Limit v1 to MCP server functionality | User selected MCP-only scope and deferred CLI behavior. | ✓ Good — clear scope boundary |
| Include only `article_search` and `article_download` in v1.0 | User explicitly excluded book operations from the initial scope. | ✓ Good — book tools added in v1.2 as planned |
| Return article download URLs/metadata instead of writing files | Keeps safer and simpler; avoids local file management complexity. | ✓ Good — stale article file-write path removed |
| Treat `ANNAS_BASE_URL` as a manual override | User wants explicit env configuration to win; if it is offline, users should update or delete it. | ✓ Good — working in production |
| Use Wikipedia revision age for mirror trust | User wants links present on the Anna's Archive Wikipedia page for at least 24 hours. | ✓ Good — `REVISION_LIMIT=200` bound prevents infinite scanning |
| Per-invocation `BaseUrlManager` (no singleton) | Stateless instantiation; shared cache via disk file avoids concurrency complexity. | ✓ Good — efficient for low-frequency MCP calls |
| Generic `withResolvedBaseUrl<S,T>` in `tool-utils.ts` | Eliminates code duplication; both article and book tools share identical offline retry logic. | ✓ Good — shipped v1.2 phase 8 |
| `book_download` fast_download only, no SciDB fallback | Go upstream does not implement SciDB fallback for books. | ✓ Good — clear scope boundary |
| `file-utils.ts` shared security module | Security-critical code (HTTPS validation, path traversal guard, atomic write) must not be duplicated. | ✓ Good — REF-01 complete |
| `doi` XOR `dois` mutually exclusive inputs via superRefine | Avoids ambiguous handler routing; handler normalizes both to internal array. | ✓ Good — v1.3 phase 11 |
| Two-stage `Promise.allSettled` pipeline (lookups then downloads) | All lookups settle first so batch-scope state (circuit breaker) is established before downloads begin. | ✓ Good — v1.3 phase 12 |
| `rediscoveryPromise` deduplication for base URL CB | Exactly one re-discovery fires per batch regardless of how many concurrent lookups fail simultaneously. | ✓ Good — v1.3 phase 13 |
| Host-level-only CDN denylist trigger | Article-level errors (bad PDF, HTML body) must not penalize the CDN host for other articles. | ✓ Good — v1.3 phase 14 (REM-04) |
| UUID-suffixed temp files + in-batch filename reservation | Concurrent downloads of articles with identical titles race on temp names without this guard. | ✓ Good — v1.3 phase 14 (REM-03) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-27 — v1.4 DOI Verification milestone complete (Phases 15–17)*
