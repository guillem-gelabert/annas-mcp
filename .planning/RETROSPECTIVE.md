# Retrospective: annas-mcp-ts

---

## Milestone: v1.1 — Mirror Resilience

**Shipped:** 2026-05-19  
**Phases:** 3 | **Plans:** 3

### What Was Built

- Wikipedia revisions-driven base URL discovery with bounded scanning and 24-hour trust logic
- Server-side JSON cache for discovered base URLs; manual `ANNAS_BASE_URL` always wins
- `update_base_url` MCP tool with structured output (selected URL, candidates, revision evidence)
- Offline recovery in article tools: manual override → actionable guidance; auto URL → discovery refresh + single retry
- Node/npx compatibility build for MCP clients that cannot run Bun directly
- Security hardening: 20s request timeout, DOI `encodeURIComponent` sanitization, API error redaction

### What Worked

- **Single-session delivery**: All 3 phases executed, security remediations, and npx build landed in one session (2026-05-19). Coarse granularity + YOLO mode kept overhead minimal.
- **Disk-based cache as shared state**: Using a JSON file at `DEFAULT_CACHE_FILE` let per-invocation `BaseUrlManager` instances share state without singleton complexity. Simple and correct for MCP's call frequency.
- **Wikipedia revision trust logic**: The 24-hour age check is implemented cleanly and self-contained within `discoverFromRevisions()`. Trust logic is easy to reason about and has good test coverage.
- **Security as a quick task**: Bundling security remediations into a single quick task (`260519-g0n`) after the main phases was efficient — kept phase scope clean, addressed all SECURITY.md findings in one commit.

### What Was Inefficient

- **No VERIFICATION.md files produced**: All 3 phases completed without the verifier generating formal artifacts. This created audit friction — the milestone audit had to fall back to integration-checker code inspection rather than reading phase-level verification history.
- **Selector constant mismatch left unresolved**: `WIKIPEDIA_SELECTOR` was kept as a documentary constant even though it's never evaluated. Discovered during audit, deferred to v1.2. Would have been faster to either implement it or remove it during phase 5.
- **Retry path untested**: The offline automatic retry path in `withResolvedBaseUrl()` went to production without test coverage. Should have been caught during phase 7 execution.

### Patterns Established

- **Quick task for cross-cutting concerns**: Security remediations and build changes that don't belong to a specific feature phase work well as numbered quick tasks with their own SUMMARY.md.
- **Per-invocation manager with shared disk cache**: For low-frequency MCP tool calls, constructing a fresh manager per call and letting cache state persist to disk is simpler than managing a server-wide singleton.
- **Audit then complete**: The `/gsd:audit-milestone` → `/gsd:complete-milestone` sequence caught 4 tech debt items before archiving, giving a clear backlog for v1.2.

### Key Lessons

- **Run verifier during execute-phase, not retroactively**: Missing VERIFICATION.md files forced the audit to do extra integration checking work. The verifier should run as part of phase execution.
- **Test the error recovery path**: Complex recovery logic (offline retry, double-failure) needs test coverage even if the happy path is well-tested. Write the test alongside the code.
- **Document extraction method, not intent**: If a constant describes what you *want* to do but the code does something different, fix one or the other before shipping.

### Cost Observations

- Model mix: Budget profile (Sonnet primary)
- Sessions: 1 (all v1.1 work in single session)
- Notable: Coarse granularity with YOLO mode eliminated most planning overhead — 3 phases in one session is efficient for this type of incremental feature work

---

## Milestone: v1.2 — Book Tools

**Shipped:** 2026-05-19
**Phases:** 3 | **Plans:** 5

### What Was Built

- `book_search` MCP tool with 8-field structured output, mirror resilience, and live-tested against real Anna's Archive API
- Generic `withResolvedBaseUrl<S,T>` extracted to `tool-utils.ts` — eliminates duplication between all four search/download tools
- `book_download` MCP tool — MD5 hash → fast_download URL; optional `download: true` writes file with format-based extension
- `file-utils.ts` shared security module: HTTPS validation, path traversal guard, atomic write, 100 MB cap, 30s timeout — imported by both article and book tools
- 4 v1.1 tech debt items cleared: readCache error surfacing, retry path test, selector rename, double-offline actionable guidance
- Post-milestone quick task: typed `BookNotFoundError` catch, `BROWSER_USER_AGENT` import consolidation, `getFileExtension` intent documented

### What Worked

- **VERIFICATION.md produced for phases 8 and 9**: Both phases generated formal verification artifacts, finally closing the recurring gap from v1.0 and v1.1.
- **Phase 10 as explicit tech debt phase**: Grouping all 4 TD items into one phase (instead of scattering them across feature phases) kept the feature phases clean and gave the debt work its own verification checkpoint.
- **Quick task for post-audit fixes**: Using `/gsd:quick` to resolve the 3 audit warnings before archiving was exactly the right tool — small, atomic, tracked in STATE.md, no ROADMAP disruption.
- **file-utils.ts extraction as REF-01**: Treating security utility deduplication as a first-class requirement (not a refactor) gave it a clear verification criterion and prevented it from being skipped.
- **Live MCP testing in audit**: Running `book_search` and `book_download` against the actual server during the audit gave confidence the tools work end-to-end, not just in unit tests.

### What Was Inefficient

- **Phase 10 missing PLAN.md/SUMMARY.md**: Tech debt phase executed inline without creating standard plan artifacts. Required a post-milestone quick task to create the SUMMARY.md. Should create at minimum a brief PLAN.md even for inline phases.
- **REQUIREMENTS.md checkboxes never updated**: All 13 requirements remained `[ ]` throughout the milestone despite being satisfied. The traceability table was populated, but the checkbox state was never updated during execution. Creates audit noise.
- **Three audit warnings carried into archiving**: W-01, W-02, W-03 were caught at audit time rather than during phase execution. The phase reviewer or verifier should catch these patterns (dead exports, unused imports, inline constant duplication) before the milestone audit.

### Patterns Established

- **Generic `withResolvedBaseUrl<S,T>`**: A single factory-parameterized helper handles offline retry for all tools. New tools should use this pattern — don't copy the retry logic.
- **`file-utils.ts` as shared security boundary**: All URL validation, path operations, and file writes must go through the shared module. Never inline security-critical code in a tool file.
- **Quick task for post-milestone cleanup**: Audit warnings that don't block shipping are good candidates for a post-audit quick task before archiving rather than blocking the milestone close.
- **Phase 10 as explicit debt phase**: Bundling tech debt items into their own named phase (rather than appending to a feature phase) gives the work visibility, a clear verification criterion, and a natural place to document what was fixed and why.

### Key Lessons

- **Create PLAN.md even for inline phases**: Even when all tasks are known upfront and executed without a formal planning step, write a brief PLAN.md. The SUMMARY.md has no context without it, and the milestone audit has to reconstruct intent from commits.
- **Update requirement checkboxes during execution**: Marking requirements `[x]` as they're satisfied during execute-phase (not just in VERIFICATION.md) prevents traceability gaps at audit time.
- **Run a code smell check before audit**: Dead exports, import consolidation gaps, and inline constant duplication are cheap to catch during code review but create noise in the milestone audit. Add a lightweight code review pass before running `/gsd:audit-milestone`.

### Cost Observations

- Model mix: Budget profile (Sonnet primary)
- Sessions: 1 (all v1.2 work in single session)
- Notable: 5 plans across 3 phases in one session — coarse granularity + YOLO mode continues to be efficient for incremental TypeScript feature work

---

## Milestone: v1.3 — Batch Article Download

**Shipped:** 2026-05-21
**Phases:** 4 | **Plans:** 5 (Phase 14 via direct codex remediation commits)

### What Was Built

- `article_download` extended with `dois: string[]` input — XOR enforcement via Zod `superRefine`; single-DOI path entirely unchanged
- Two-stage `Promise.allSettled` pipeline: concurrent lookups fully settle before concurrent downloads begin; per-article error isolation
- Base URL circuit breaker: `rediscoveryPromise` deduplication — exactly one re-discovery fires per batch regardless of how many concurrent lookups fail
- CDN denylist circuit breaker: per-host `AbortController` aborts in-flight requests; denylists only on host-level errors (NETWORK, HTTP_5XX, local TIMEOUT)
- Phase 14 codex remediation: `ANNAS_BASE_URL` honored in batch, UUID temp files + in-batch filename reservation, full-body timeout, single-rejection stream cleanup
- 95 tests passing across 7 test files (84 pre-Phase-14 + 11 from remediation)

### What Worked

- **Phase 14 as direct codex remediation**: Taking the codex review findings and fixing them as direct commits (without a formal GSD discuss/plan cycle) was fast and appropriate — the findings were already enumerated and actionable, no planning needed.
- **Two-stage pipeline design**: Fully settling lookups before downloads means batch-scope state (the circuit breaker) is established before any download begins. This was the right architectural choice — prevents interleaving issues where circuit breaker state could be read while still being established.
- **`rediscoveryPromise` deduplication**: The single-promise pattern for exactly-once re-discovery is clean and testable. Mock `BaseUrlManager` injection in tests makes the CB contract lockable without network calls.
- **AbortController per in-flight CDN request**: Wiring `AbortController` to each CDN fetch gave clean test semantics — a hanging fetch mock can be deterministically aborted, and the test asserts the abort path was exercised rather than relying on timing.
- **Deterministic CB-06 test via `_saveArticleFile`**: The codex review correctly flagged the original CB-06 test as non-deterministic. Using `_saveArticleFile` as a testing seam produced a reliable skip-path assertion.

### What Was Inefficient

- **Phase 14 has no phase directory or SUMMARY.md**: The codex review remediation was executed directly without creating `.planning/phases/14-*`. This breaks the milestone archival contract (SUMMARY.md required) and required the milestone archive to reconstruct phase 14 details from git commits.
- **CB-06 test rewrite in Phase 14**: The original Phase 13 Plan 02 test for CB-06 was non-deterministic due to concurrent `Promise.allSettled` semantics. This could have been caught during the plan review if the concurrency model had been reasoned through explicitly. A "concurrent test non-determinism" flag in the plan check would catch this class of issue.
- **Stale article file-write code survived to cleanup**: The article local file-write path existed in the codebase from v1.0 intent but was never active post-v1.0. It took until a post-milestone quick task (2026-05-27) to remove it. Should have been caught during v1.2 tech debt phase.

### Patterns Established

- **Direct codex remediation phase**: For closed, enumerated finding sets (codex review, audit), a direct commit series without GSD planning overhead is appropriate. Document commits as `fix(14-XX)` with finding codes.
- **`rediscoveryPromise` deduplication pattern**: Any batch operation needing exactly-one retry should use a shared promise variable — set it on first failure, subsequent failures `await` the same promise.
- **Testing seam for concurrent skip-path assertions**: When a concurrent skip is non-deterministic under `Promise.allSettled`, expose a `_privateFn` testing seam or restructure the test to assert an observable state change (abort fired, denylist populated) rather than the skip itself.
- **AbortController per CDN request**: Batch operations issuing concurrent CDN requests should register one `AbortController` per request at dispatch time and invoke it on denylist event.

### Key Lessons

- **Create a phase directory even for codex/audit remediation**: Even when phases are driven by external review findings, creating `.planning/phases/14-*/` with a brief PLAN.md and SUMMARY.md preserves the archival contract and avoids milestone-close reconstruction work.
- **Reason through concurrent test semantics at plan review**: Any test involving `Promise.allSettled` over concurrent calls should explicitly address the "both start before either fails" scenario. Add a checklist item in plan review.
- **Remove dead code in the milestone it becomes dead**: When a code path is demoted (article file-write deactivated in v1.0), remove it in that same milestone's tech debt phase. Leaving it creates future confusion about what the code does.

### Cost Observations

- Model mix: Budget profile (Sonnet primary)
- Sessions: ~3 (Phase 11–13 in two sessions, Phase 14 codex remediation in one)
- Notable: Four phases including a codex review pass in under 3 days; the circuit breaker phases (13 + 14) took most of the effort due to concurrency reasoning

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.1 | v1.2 | v1.3 |
|--------|------|------|------|------|
| Phases | 4 | 3 | 3 | 4 |
| Plans | 4 | 3 | 5 | 5 |
| Requirements | 7 | 19 | 13 | 20 |
| LOC added (src) | ~600 | ~400 | ~495 | ~295 |
| Tests (total) | ~15 | 33 | 51 | 95 |
| Timeline | 1 day | 1 day | 1 day | 3 days |
| Audit status | passed | tech_debt | tech_debt | no audit |
| VERIFICATION.md | none | none | phases 8-9 ✓, phase 10 gap | none (phase 14 gap) |
| Phase dir gap | — | — | phase 10 | phase 14 |

**Trend:** Test count growth is healthy (15 → 95 over 4 milestones). VERIFICATION.md and phase directory gaps persist — the recurring issue is phases executed without full GSD ceremony (phase 10 inline, phase 14 as direct commits). Codex review is now providing a useful quality gate (7 findings closed in Phase 14) — worth retaining as a post-execute step for complex phases.
