# Milestones: annas-mcp-ts

## v1.4 DOI Verification — ✅ SHIPPED 2026-05-27

**Phases:** 15–17 | **Plans:** 3 | **Requirements:** 11/11

**Delivered:** Added CrossRef-based DOI cross-validation to `article_download`. Every download call concurrently fetches the canonical paper title from CrossRef and compares it via Jaccard similarity. Low-confidence or unverifiable matches return `isError: true`, protecting callers from wrong-paper returns — 114 tests passing across 10 test files.

**Key accomplishments:**
1. `fetchCrossRefTitle` — standalone CrossRef API client with injectable fetch, 5s AbortSignal timeout, Zod schema validation, null-on-failure contract (7 unit tests)
2. `computeConfidence` — pure Jaccard similarity scorer with 0.5 threshold, case-insensitive + punctuation-stripped normalization, empty-set guards (9 unit tests)
3. Single-DOI and batch `article_download` handlers wired with `Promise.all` parallelism — CrossRef fetch runs concurrently with Anna's Archive lookup
4. Hard-error gating model (intentional post-phase upgrade): high confidence → `{ article, sources }`; low/unverified → `isError: true` with descriptive message
5. Batch mode gates per-article; failed items become `{ doi, error }`, remaining DOIs continue
6. 114 tests pass (5 new verification tests + 99 pre-existing, no regressions)

**Git range:** ec8c3e8 (milestone start) → fd7bf2e (Phase 17 GREEN)
**Archive:** `.planning/milestones/v1.4-ROADMAP.md`

---

## v1.3 Batch Article Download — ✅ SHIPPED 2026-05-21

**Phases:** 11–14 | **Plans:** 5 | **Requirements:** 20/20

**Delivered:** Extended `article_download` to accept `doi` (single) or `dois` (array) with a two-stage parallel pipeline, batch-scoped circuit breakers (base URL re-discovery deduplication + CDN denylist with AbortController), and Phase 14 codex-review remediation closing all seven findings — bringing the server to 95 passing tests and ~1,800 LOC.

**Key accomplishments:**
1. `article_download` extended with `dois: string[]` input — doi XOR dois enforced via Zod superRefine; single-DOI path entirely unchanged
2. Two-stage `Promise.allSettled` pipeline — concurrent lookups settle before concurrent downloads begin; per-article error isolation
3. Base URL circuit breaker — `rediscoveryPromise` deduplication ensures exactly one re-discovery fires per batch
4. CDN denylist circuit breaker — per-host `AbortController` aborts in-flight requests; denylists only on host-level errors
5. Codex remediation (Phase 14) — `ANNAS_BASE_URL` honored in batch, filename-collision safety (UUID temp files), full-body timeout, single-rejection stream cleanup
6. 95 tests pass across 7 test files

**Git range:** 3df0c7e (feat 11-01) → 881c902 (docs 14 reconcile)
**Archive:** `.planning/milestones/v1.3-ROADMAP.md`

---

## v1.2 Book Tools — ✅ SHIPPED 2026-05-19

**Phases:** 8–10 | **Plans:** 5 | **Requirements:** 13/13

**Delivered:** Added `book_search` and `book_download` MCP tools with mirror resilience, extracted shared `file-utils.ts` security module (REF-01), cleared all four v1.1 tech debt items, and resolved three post-milestone audit warnings — bringing the codebase to 51 passing tests and 1,691 LOC.

**Key accomplishments:**
1. `book_search` — searches Anna's Archive by title/author/ISBN with 8-field structured output and live-tested against real API
2. Generic `withResolvedBaseUrl<S,T>` extracted to `tool-utils.ts` — shared offline retry for all four MCP tools
3. `book_download` — resolves fast_download URL by MD5 hash; optional `download: true` writes file format-agnostically
4. `file-utils.ts` shared security module imported by both article and book tools (HTTPS validation, path traversal guard, atomic write, 100 MB cap, 30s timeout)
5. 4 v1.1 tech debt items resolved: readCache error surfacing, retry path test, selector rename, double-offline guidance
6. Post-milestone: 3 audit warnings fixed (typed BookNotFoundError catch, BROWSER_USER_AGENT import consolidation, getFileExtension intent documented)

**Git range:** bba36b2 → 6b0953e
**Archive:** `.planning/milestones/v1.2-ROADMAP.md`

---

## v1.1 Mirror Resilience — ✅ SHIPPED 2026-05-19

**Phases:** 5–7 | **Plans:** 3 | **Requirements:** 19/19

**Delivered:** Made `annas-mcp-ts` resilient to Anna's Archive mirror changes — Wikipedia-based URL discovery with 24-hour trust filtering, server-side JSON cache, `update_base_url` MCP tool, and offline recovery paths for article tools.

**Key accomplishments:**
1. Wikipedia revisions-driven base URL discovery with bounded scanning and strict trust logic
2. Server-side JSON cache with manual-override-wins semantics (`ANNAS_BASE_URL` always takes priority)
3. `update_base_url` MCP tool exposing structured output (selected URL, candidates, revision evidence)
4. Article tools recover from offline automatic mirrors via single discovery refresh + retry
5. Manual `ANNAS_BASE_URL` offline returns actionable MCP guidance instead of a raw error
6. Node/npx build and security hardening (timeout, DOI sanitization, error redaction)

**Tech debt at close:** 4 items (selector metadata misleading, readCache silent errors, retry path untested, double-offline guidance gap) — tracked in v1.2 backlog.

**Git range:** 10a0285 → 723f4b0  
**Archive:** `.planning/milestones/v1.1-ROADMAP.md`

---

## v1.0 MVP — ✅ SHIPPED 2026-05-18

**Phases:** 1–4 | **Plans:** 4

**Delivered:** Bun-native TypeScript MCP server with `article_search` and `article_download` tools backed by Anna's Archive API. Supports `ANNAS_SECRET_KEY` authentication and optional `ANNAS_BASE_URL` mirror selection.

**Archive:** `.planning/v1.0-MILESTONE-AUDIT.md`
