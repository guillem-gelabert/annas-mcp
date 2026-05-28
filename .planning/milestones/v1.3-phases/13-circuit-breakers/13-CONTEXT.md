# Phase 13: Circuit Breakers - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add batch-scoped circuit breakers to `handleBatchArticleDownload`:

1. **Base URL CB** — the first `base_url` resolution failure per batch triggers exactly one re-discovery attempt; remaining DOIs resume with the new mirror or fast-fail if re-discovery also fails. Single-DOI path (`withResolvedBaseUrl`) is unchanged.

2. **CDN denylist CB** — a shared `Set<string>` (hosts) + `Map<string, Set<AbortController>>` (in-flight abort registry) is maintained for the batch lifetime; when a fast_download source fails, its host is added to the denylist and all in-flight downloads to that host are aborted; subsequent article downloads skip denylisted hosts.

Both circuit breakers are scoped to a single batch invocation — no persistence across MCP calls.

</domain>

<decisions>
## Implementation Decisions

### Base URL Circuit Breaker
- Guarantee exactly one re-discovery per batch via a shared `rediscoveryPromise: Promise<string> | null` variable in `handleBatchArticleDownload`; first base_url failure sets it and triggers `manager.updateBaseUrl()` + `manager.resolveBaseUrl()`; all subsequent failures await the same Promise
- DOIs already in-flight when re-discovery triggers are left to fail with their own error; they are NOT retried after re-discovery — CB-01/02 require "remaining DOIs resume", not "retry already-failed ones"
- Bypass `withResolvedBaseUrl` entirely in `handleBatchArticleDownload` — implement base_url resolution inline with CB logic (resolve once up front, re-resolve on first failure); single-DOI path keeps `withResolvedBaseUrl` unchanged (preserves CB-07)
- Re-discovery state lives as local variables in `handleBatchArticleDownload` — no new class or file needed

### CDN Denylist Circuit Breaker
- Denylist state: `cdnDenylist = new Set<string>()` and `cdnAbortMap = new Map<string, Set<AbortController>>()` created in `handleBatchArticleDownload`, passed to `saveArticleFile` via optional `cdnState` param
- Denylist enforced in `saveArticleFile` — before each source URL attempt, extract host, check denylist, skip if present; on failure for fast_download sources, add host to denylist and abort all registered controllers for that host via `cdnAbortMap`
- In-flight abort (CB-05): each `downloadOneSource` call creates its own AbortController, registers it in `cdnAbortMap` under the host key before starting the fetch, and unregisters on completion (success or failure); when a host is denylisted, all controllers registered under that host are aborted
- Denylist trigger: non-2xx HTTP response OR network/transport error on `fast_download` source types only; `scidb_pdf` and `scidb` sources are NOT denylisted (they use a different network path)

### Code Organization
- Circuit breaker state stays in `article-tools.ts` as local state within `handleBatchArticleDownload` — CBs are batch execution internals, not reusable utilities
- `resolveArticleDownload` (ArticleService) is NOT modified — domain_index loop unchanged; denylist is enforced at the download layer, not the URL-collection layer; preserves CB-07 exactly
- `saveArticleFile` signature: add optional `cdnState?: { denylist: Set<string>; abortMap: Map<string, Set<AbortController>> }` parameter — backward compatible; single-DOI call passes nothing (no denylist, CB-07 preserved)

### Claude's Discretion
- Exact variable naming within the batch handler for the CB state
- Whether to extract a small `denylistHost(host, cdnState)` helper or inline the abort logic

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleBatchArticleDownload` (article-tools.ts:216) — the function to modify; already has `manager` shared across lookups
- `saveArticleFile` (article-tools.ts:343) — add optional `cdnState` param; loop over sources already exists
- `downloadOneSource` (article-tools.ts:387) — already creates `AbortController` + `setTimeout` for timeout; extend to register in `cdnAbortMap`
- `withResolvedBaseUrl` (tool-utils.ts) — kept unchanged; batch bypasses it inline
- `isLikelyOfflineBaseUrlError` (base-url-manager.ts) — reuse to detect base_url failures in batch inline logic
- `BaseUrlManager.updateBaseUrl()` + `resolveBaseUrl()` — the re-discovery API already in place
- `hostOf(url)` (article-tools.ts:514) — already exists; use for denylist keying

### Established Patterns
- `Promise.allSettled()` for parallel fan-out with per-item error isolation (Phase 12 pattern)
- `AbortController` + `setTimeout` already in `downloadOneSource` for timeouts
- Optional params on helpers (e.g., `fetchImpl?`) for backward-compatible extension
- `ArticleToolDependencies` passed to all handler helpers

### Integration Points
- `handleBatchArticleDownload` is the sole entry point for batch — changes are contained here + `saveArticleFile`/`downloadOneSource`
- `handleSingleArticleDownload` is unchanged — routes through `withResolvedBaseUrl` as before
- Tests import `handleArticleDownload` directly — existing tests must remain green

</code_context>

<specifics>
## Specific Ideas

- Test the base_url CB with a mock `fetchImpl` that fails exactly on the first lookup, succeeds on re-discovery, then succeeds for remaining DOIs — assert `manager.updateBaseUrl` called exactly once
- Test CDN denylist: 2 concurrent articles both try host "cdn1.example.com"; first to fail denylists it; second's in-flight request gets aborted (check AbortError handling)
- Test single-DOI path unchanged: calling `handleArticleDownload({ doi: "..." }, deps)` still routes through `withResolvedBaseUrl` without touching any CB state

</specifics>

<deferred>
## Deferred Ideas

- Persistent circuit breaker state across MCP calls — explicitly out of scope (per REQUIREMENTS.md)
- Configurable CB thresholds (e.g., fail after N errors instead of 1) — no requirement for this
- CDN denylist for `scidb`/`scidb_pdf` sources — different failure modes, deferred

</deferred>
