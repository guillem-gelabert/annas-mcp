# Phase 13: Circuit Breakers - Research

**Researched:** 2026-05-20
**Domain:** TypeScript async coordination — shared promise deduplication, AbortController lifecycle, per-batch state management
**Confidence:** HIGH

## Summary

Phase 13 adds two batch-scoped circuit breakers to `handleBatchArticleDownload` in `article-tools.ts`. The base URL CB ensures exactly one re-discovery fires per batch by using a shared `rediscoveryPromise: Promise<string> | null` variable. The CDN denylist CB uses a `Set<string>` + `Map<string, Set<AbortController>>` to skip known-bad hosts and abort in-flight requests when a host fails.

The implementation is self-contained: all CB state lives as local variables in `handleBatchArticleDownload`. No new files, no new classes, no new exports. The single-DOI path (`handleSingleArticleDownload` → `withResolvedBaseUrl`) is untouched. The architecture is already well-suited for these additions — the `fetchImpl` injection point, the existing `AbortController` usage in `downloadOneSource`, and the `hostOf()` helper are all directly reusable.

The primary risk is concurrency correctness: two DOIs must both await the *same* re-discovery promise rather than each launching one. The shared-promise-deduplication pattern (check-and-set on a single variable before first `await`) solves this deterministically in a single-threaded JS event loop. A secondary risk is AbortController cleanup — controllers must be unregistered from `cdnAbortMap` on completion to prevent memory growth within a long batch.

**Primary recommendation:** Implement the two CBs as local state in `handleBatchArticleDownload`, pass CDN state to `saveArticleFile` via an optional `cdnState` parameter, and extend `downloadOneSource` with controller registration/unregistration. All design decisions are locked in CONTEXT.md — this research validates them against the actual code.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Base URL Circuit Breaker:**
- Guarantee exactly one re-discovery per batch via a shared `rediscoveryPromise: Promise<string> | null` variable in `handleBatchArticleDownload`; first base_url failure sets it and triggers `manager.updateBaseUrl()` + `manager.resolveBaseUrl()`; all subsequent failures await the same Promise
- DOIs already in-flight when re-discovery triggers are left to fail with their own error; they are NOT retried after re-discovery — CB-01/02 require "remaining DOIs resume", not "retry already-failed ones"
- Bypass `withResolvedBaseUrl` entirely in `handleBatchArticleDownload` — implement base_url resolution inline with CB logic (resolve once up front, re-resolve on first failure); single-DOI path keeps `withResolvedBaseUrl` unchanged (preserves CB-07)
- Re-discovery state lives as local variables in `handleBatchArticleDownload` — no new class or file needed

**CDN Denylist Circuit Breaker:**
- Denylist state: `cdnDenylist = new Set<string>()` and `cdnAbortMap = new Map<string, Set<AbortController>>()` created in `handleBatchArticleDownload`, passed to `saveArticleFile` via optional `cdnState` param
- Denylist enforced in `saveArticleFile` — before each source URL attempt, extract host, check denylist, skip if present; on failure for fast_download sources, add host to denylist and abort all registered controllers for that host via `cdnAbortMap`
- In-flight abort (CB-05): each `downloadOneSource` call creates its own AbortController, registers it in `cdnAbortMap` under the host key before starting the fetch, and unregisters on completion (success or failure); when a host is denylisted, all controllers registered under that host are aborted
- Denylist trigger: non-2xx HTTP response OR network/transport error on `fast_download` source types only; `scidb_pdf` and `scidb` sources are NOT denylisted

**Code Organization:**
- Circuit breaker state stays in `article-tools.ts` as local state within `handleBatchArticleDownload`
- `resolveArticleDownload` (ArticleService) is NOT modified — domain_index loop unchanged
- `saveArticleFile` signature: add optional `cdnState?: { denylist: Set<string>; abortMap: Map<string, Set<AbortController>> }` parameter — backward compatible

### Claude's Discretion
- Exact variable naming within the batch handler for the CB state
- Whether to extract a small `denylistHost(host, cdnState)` helper or inline the abort logic

### Deferred Ideas (OUT OF SCOPE)
- Persistent circuit breaker state across MCP calls
- Configurable CB thresholds
- CDN denylist for `scidb`/`scidb_pdf` sources
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CB-01 | The first `base_url` resolution failure within a batch triggers exactly one re-discovery attempt (not once per article) | Shared-promise deduplication pattern — `rediscoveryPromise` set before first `await`, all concurrent failures await the same promise |
| CB-02 | If re-discovery succeeds, remaining DOIs resume with the new mirror URL | After `rediscoveryPromise` resolves, new baseUrl used for all subsequent `ArticleService` instantiations |
| CB-03 | If re-discovery fails, all remaining unresolved DOIs fast-fail with a clear error (no further re-discovery retries) | `rediscoveryPromise` rejects; all awaiters receive the same error; a `rediscoveryFailed: boolean` flag blocks further attempts |
| CB-04 | A shared per-host denylist accumulates CDN host failures across the batch | `cdnDenylist: Set<string>` created in `handleBatchArticleDownload`, passed to `saveArticleFile` |
| CB-05 | When a CDN host is added to the denylist, in-flight requests to that host are aborted via `AbortController` | `cdnAbortMap: Map<string, Set<AbortController>>` — controllers registered before fetch, aborted on denylist add |
| CB-06 | Subsequent articles skip denylisted hosts and proceed directly to the next `domain_index` or scidb fallback | `saveArticleFile` checks `cdnDenylist` before each source attempt, skips `fast_download` sources whose host is listed |
| CB-07 | Single-DOI path is unaffected — existing domain_index loop behavior is preserved | `handleSingleArticleDownload` calls `withResolvedBaseUrl` unchanged; `saveArticleFile` with no `cdnState` behaves as before |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Base URL re-discovery (CB-01/02/03) | `handleBatchArticleDownload` (batch coordinator) | `BaseUrlManager` (existing API) | One re-discovery per batch is a batch-coordination concern, not a service concern |
| CDN denylist accumulation (CB-04) | `saveArticleFile` (download layer) | `handleBatchArticleDownload` (state owner) | Host failures are detected during download; denylist state created by batch owner, enforced by download layer |
| In-flight abort (CB-05) | `downloadOneSource` (fetch layer) | `saveArticleFile` (abort trigger) | Controllers live where fetches live; abort is triggered when denylist is written |
| Denylist skip (CB-06) | `saveArticleFile` (source iteration) | — | Source skipping happens in the loop that tries each source |
| Single-DOI isolation (CB-07) | `handleSingleArticleDownload` (untouched) | — | No CB state passed; backward compatible by design |

---

## Standard Stack

No new packages. This phase uses only:

| Asset | Location | Purpose |
|-------|----------|---------|
| `AbortController` | Built-in (Web API, Bun native) | Cancel in-flight requests |
| `Set<string>` | Built-in | CDN host denylist |
| `Map<string, Set<AbortController>>` | Built-in | In-flight request registry keyed by host |
| `Promise<string> \| null` | Built-in | Re-discovery deduplication |
| `isLikelyOfflineBaseUrlError` | `base-url-manager.ts:265` | Detect base_url failures (already exported) |
| `manager.updateBaseUrl()` | `base-url-manager.ts:83` | Trigger mirror re-discovery |
| `manager.resolveBaseUrl()` | `base-url-manager.ts:66` | Get the (re)discovered URL |
| `hostOf(url)` | `article-tools.ts:514` | Extract host for denylist keying (already exists) |

**Installation:** None required. [VERIFIED: codebase inspection]

---

## Package Legitimacy Audit

> No external packages are installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
handleBatchArticleDownload
│
├── [pre-flight] resolveBaseUrl() → baseUrl (initial)
│     │
│     └─ rediscoveryPromise: Promise<string> | null = null
│        rediscoveryFailed: boolean = false
│
├── Stage 1: Promise.allSettled(dois.map(doi => lookupOne(doi, baseUrl)))
│     │
│     └── lookupOne(doi, baseUrl):
│           try: new ArticleService(cfg{baseUrl}).resolveArticleDownload(doi)
│           catch isLikelyOfflineBaseUrlError:
│             if rediscoveryFailed → throw fast-fail error
│             if !rediscoveryPromise → set rediscoveryPromise = discover()
│             newBaseUrl = await rediscoveryPromise
│             retry: new ArticleService(cfg{newBaseUrl}).resolveArticleDownload(doi)
│
├── Stage 2 (download:true): Promise.allSettled(resolvedItems.map(item =>
│     saveArticleFile(resolution, path, fetchImpl, cdnState)))
│     │
│     └── saveArticleFile(resolution, path, fetchImpl, cdnState?):
│           for source in resolution.sources:
│             if cdnState && source.type === "fast_download":
│               host = hostOf(source.url)
│               if cdnState.denylist.has(host) → skip (CB-06)
│             try: downloadOneSource(source, filePath, fetchImpl, cdnState)
│             catch (fast_download only):
│               if cdnState: denylistHost(host, cdnState)  ← adds to set + aborts in-flight (CB-04/05)
│               continue to next source
│
└── downloadOneSource(source, filePath, fetchImpl, cdnState?):
      controller = new AbortController()
      if cdnState && source.type === "fast_download":
        register controller in cdnState.abortMap[host]
      try: fetch(url, { signal: controller.signal })
      finally: unregister controller from cdnState.abortMap[host]
```

### Recommended Project Structure

No structural changes. All changes are within:

```
src/tools/article-tools.ts    ← only modified file
```

### Pattern 1: Shared Promise Deduplication (Base URL CB)

**What:** Multiple concurrent async operations all need the same one-time async result. First caller sets a shared variable to the in-flight promise; all subsequent callers (including those that arrive before the first resolves) await the same promise.

**When to use:** Any scenario requiring "exactly one of X per concurrent group" — re-discovery, token refresh, initialization.

**Why it works in JS:** Assignment before the first `await` is synchronous. If two `lookupOne` calls both detect a base_url error, the first one to reach `if (!rediscoveryPromise)` sets it synchronously; the second will see it already set and skip straight to `await rediscoveryPromise`.

**Example:**
```typescript
// Source: pattern verified against existing codebase — withResolvedBaseUrl is the per-call version
let rediscoveryPromise: Promise<string> | null = null;
let rediscoveryFailed = false;

async function lookupOne(doi: string, currentBaseUrl: string): Promise<ArticleDownloadResolution> {
  const service = new ArticleService({ ...config, baseUrl: currentBaseUrl }, fetchImpl);
  try {
    return await service.resolveArticleDownload(doi);
  } catch (error) {
    if (!isLikelyOfflineBaseUrlError(error)) throw error;

    if (rediscoveryFailed) {
      throw new Error("Mirror re-discovery failed; cannot resolve remaining DOIs.");
    }

    // Deduplication: only the first caller launches re-discovery
    if (!rediscoveryPromise) {
      rediscoveryPromise = manager.updateBaseUrl()
        .then(() => manager.resolveBaseUrl())
        .catch((err) => {
          rediscoveryFailed = true;
          throw err;
        });
    }

    const newBaseUrl = await rediscoveryPromise;
    const retryService = new ArticleService({ ...config, baseUrl: newBaseUrl }, fetchImpl);
    return retryService.resolveArticleDownload(doi);
  }
}
```
[VERIFIED: pattern derived from `withResolvedBaseUrl` in `tool-utils.ts:10-46` + `base-url-manager.ts` API]

### Pattern 2: AbortController Registration / Unregistration

**What:** Track in-flight requests by host. When a host is denylisted, abort all its tracked controllers.

**When to use:** Any fan-out scenario where a downstream failure should cancel peer requests to the same endpoint class.

**Example:**
```typescript
// Source: extends existing downloadOneSource pattern (article-tools.ts:387)
async function downloadOneSource(
  source: DownloadSource,
  filePath: string,
  fetchImpl?: FetchLike,
  cdnState?: CdnState,
): Promise<string> {
  const controller = new AbortController();
  const host = hostOf(source.url);

  // Register before any await
  if (cdnState && source.type === "fast_download") {
    const set = cdnState.abortMap.get(host) ?? new Set();
    set.add(controller);
    cdnState.abortMap.set(host, set);
  }

  try {
    // ... existing fetch logic using controller.signal
    return await doFetch(source.url, controller, fetchImpl);
  } finally {
    // Always unregister — prevents memory growth and stale aborts
    if (cdnState && source.type === "fast_download") {
      cdnState.abortMap.get(host)?.delete(controller);
    }
  }
}
```
[VERIFIED: extends `downloadOneSource` at `article-tools.ts:387-511`]

### Pattern 3: Host Denylist Enforcement in Source Loop

**What:** Before attempting each source, check the host against the denylist; skip fast_download sources whose host is listed. On failure, add the host to the denylist and trigger abort of peers.

**Example:**
```typescript
// Source: extends saveArticleFile at article-tools.ts:343
for (const source of resolution.sources) {
  validateDownloadUrl(source.url);
  const host = hostOf(source.url);

  if (cdnState && source.type === "fast_download" && cdnState.denylist.has(host)) {
    attemptErrors.push(`${source.type} (${host}): skipped — host denylisted`);
    continue; // CB-06
  }

  try {
    return await downloadOneSource(source, filePath, fetchImpl, cdnState);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    attemptErrors.push(`${source.type} (${host}): ${message}`);

    // Only denylist fast_download failures (scidb* use different network path)
    if (cdnState && source.type === "fast_download") {
      denylistHost(host, cdnState); // adds to Set, aborts in-flight (CB-04/CB-05)
    }
  }
}
```
[VERIFIED: extends `saveArticleFile` at `article-tools.ts:343-385`]

### Anti-Patterns to Avoid

- **Launching re-discovery inside Promise.allSettled map without deduplication:** Each DOI that detects a base_url error would launch its own `updateBaseUrl()` call. Violates CB-01. Fix: check-and-set `rediscoveryPromise` before any `await`.
- **Retrying in-flight DOIs after re-discovery:** CONTEXT.md is explicit — DOIs already in-flight are left to fail with their own error. Don't add retry logic for already-started lookups.
- **Passing `cdnState` to `handleSingleArticleDownload`:** Would change single-DOI behavior and break CB-07. The `cdnState` param on `saveArticleFile` must be optional and only populated from `handleBatchArticleDownload`.
- **Denylisting `scidb` / `scidb_pdf` sources:** Different failure modes; explicitly out of scope per CONTEXT.md.
- **Not unregistering AbortControllers on completion:** If a controller is not removed from `cdnAbortMap` after a successful download, a later denylist event for the same host would attempt to abort an already-completed operation. Harmless but produces noise; unregister in `finally`.
- **Denylist check on `scidb`/`scidb_pdf` sources:** Only `fast_download` sources should be checked/denylisted. Running the check on scidb sources would incorrectly block the fallback path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Promise deduplication | Custom mutex / lock class | `let p: Promise<T> \| null` — JS single-thread guarantee makes this safe |
| Abort on failure | Polling / flag-based cancellation | `AbortController.abort()` — native, already used in `downloadOneSource` |
| Host extraction | Custom URL parser | `hostOf(url)` at `article-tools.ts:514` — already exists |
| Base URL error detection | Custom error classifier | `isLikelyOfflineBaseUrlError` at `base-url-manager.ts:265` — already exported |

---

## Common Pitfalls

### Pitfall 1: Re-Discovery Race Between Concurrent DOI Lookups

**What goes wrong:** Two DOIs hit base_url failures within the same microtask turn. If the deduplication check (`if (!rediscoveryPromise)`) is placed after an `await`, both callers see `null` and each launches `updateBaseUrl()`. This fires `updateBaseUrl` twice, violating CB-01.

**Why it happens:** Placing the check after an `await` point means the check is no longer synchronous with respect to other concurrent tasks.

**How to avoid:** Set `rediscoveryPromise` synchronously — before any `await` in the CB handler:
```typescript
// CORRECT — assignment before first await
if (!rediscoveryPromise) {
  rediscoveryPromise = manager.updateBaseUrl().then(() => manager.resolveBaseUrl());
}
const newBaseUrl = await rediscoveryPromise;

// WRONG — await before assignment
await someCheck();
if (!rediscoveryPromise) { ... }  // another task may have already set this
```
[ASSUMED — derived from JS event loop semantics, standard pattern for token refresh deduplication]

**Warning signs:** Test that asserts `updateBaseUrl` called exactly once fails when two DOIs fail concurrently.

### Pitfall 2: AbortError Propagation Masking Real Errors

**What goes wrong:** When a CDN host is denylisted and its in-flight controllers are aborted, those pending `downloadOneSource` calls reject with `AbortError`. If the error handler in `saveArticleFile` treats `AbortError` as a regular download failure, it will attempt to denylist the same host a second time, and may also add a confusing error message to `attemptErrors`.

**Why it happens:** `controller.abort()` causes the fetch to reject with a `DOMException` of type `AbortError`. This is a signal that the download was cancelled externally, not a network failure to be retried.

**How to avoid:** In the catch block of `downloadOneSource` (or in `saveArticleFile`'s error handler), check `error instanceof DOMException && error.name === 'AbortError'` (or in Bun: check `error.name === 'AbortError'`). If detected, either re-throw without logging to `attemptErrors`, or record a distinct "aborted" message and skip the denylist-add step.

**Warning signs:** `attemptErrors` contains duplicate host entries; `cdnDenylist.size` is larger than the number of unique failed hosts.

### Pitfall 3: cdnState Not Wired to Both Lookup and Download Stages

**What goes wrong:** The CDN denylist is correctly passed to Stage 2 (download), but Stage 1 (parallel lookups) completes before downloads start. Since `resolveArticleDownload` builds the `sources` array (including fast_download URLs), the denylist has no effect on Stage 1 — that's expected. But if Stage 2 iterates `resolvedItems` sequentially, the denylist only helps for articles processed after the first failure. Stage 2 must remain parallel (`Promise.allSettled`) to get maximum benefit from the CDN CB.

**Why it happens:** Converting Stage 2 to sequential iteration (e.g., a for-of loop) was a real consideration in earlier phases. The CDN CB's benefit is proportional to how many concurrent downloads are in-flight when the first host fails.

**How to avoid:** Keep Stage 2 as `Promise.allSettled(resolvedItems.map(...))`. The `cdnState` object is shared across all concurrent downloads by reference — mutations (adding to the denylist) are visible to all concurrently-running `saveArticleFile` calls.

**Warning signs:** Test for "second article skips denylisted host" fails when the two downloads are run sequentially.

### Pitfall 4: base_url CB and `withResolvedBaseUrl` Mismatch

**What goes wrong:** In the current batch handler (Phase 12), lookups go through `withResolvedBaseUrl`, which has its own per-call re-discovery logic. If the CB `rediscoveryPromise` approach is layered on top of `withResolvedBaseUrl` (rather than replacing it), `withResolvedBaseUrl` may fire its own `updateBaseUrl()` independently, violating CB-01.

**Why it happens:** Forgetting to bypass `withResolvedBaseUrl` when adding the inline CB logic.

**How to avoid:** Per CONTEXT.md locked decision: bypass `withResolvedBaseUrl` entirely in `handleBatchArticleDownload`. The batch handler resolves the base URL once up front, then uses inline CB logic. `withResolvedBaseUrl` is only used by `handleSingleArticleDownload` and `handleArticleSearch`.

**Warning signs:** `updateBaseUrl` is called more than once in a batch with a single failing base URL.

---

## Code Examples

### Wiring CB State in handleBatchArticleDownload

```typescript
// Source: article-tools.ts:216 (to be modified)
async function handleBatchArticleDownload(
  args: { dois: string[]; download?: boolean; downloadPath?: string },
  dependencies: ArticleToolDependencies,
): Promise<CallToolResult> {
  // ... pre-flight path validation ...

  const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);

  // Base URL CB state (CB-01/02/03)
  let baseUrl = await manager.resolveBaseUrl();
  let rediscoveryPromise: Promise<string> | null = null;
  let rediscoveryFailed = false;

  // CDN denylist CB state (CB-04/05/06)
  const cdnDenylist = new Set<string>();
  const cdnAbortMap = new Map<string, Set<AbortController>>();
  const cdnState = { denylist: cdnDenylist, abortMap: cdnAbortMap };

  // Stage 1: parallel lookups with base URL CB inline
  const lookupSettled = await Promise.allSettled(
    args.dois.map(async (doi) => {
      // ... uses baseUrl, rediscoveryPromise, rediscoveryFailed ...
    }),
  );

  // Stage 2: parallel downloads with CDN state
  // saveArticleFile(..., dependencies.fetchImpl, cdnState)
}
```
[VERIFIED: derived from `article-tools.ts:216-303`]

### CdnState Type (inline or extracted)

```typescript
// Can be defined inline or as a local type alias
type CdnState = {
  denylist: Set<string>;
  abortMap: Map<string, Set<AbortController>>;
};
```
[ASSUMED — naming is Claude's discretion per CONTEXT.md]

### Helper: denylistHost (if extracted)

```typescript
function denylistHost(host: string, cdnState: CdnState): void {
  cdnState.denylist.add(host);
  const controllers = cdnState.abortMap.get(host);
  if (controllers) {
    for (const controller of controllers) {
      controller.abort();
    }
    cdnState.abortMap.delete(host); // clean up after abort
  }
}
```
[ASSUMED — whether to extract this helper is Claude's discretion per CONTEXT.md]

---

## State of the Art

| Old Approach (Phase 12) | New Approach (Phase 13) | Impact |
|------------------------|------------------------|--------|
| `withResolvedBaseUrl` per-DOI in batch | Inline base URL resolution with shared `rediscoveryPromise` | One re-discovery per batch instead of one per DOI |
| `saveArticleFile` has no CDN awareness | `saveArticleFile` receives optional `cdnState` | Failed CDN hosts are skipped for subsequent downloads |
| `downloadOneSource` timeout-only `AbortController` | `downloadOneSource` also registers in `cdnAbortMap` | In-flight requests cancelled immediately on host denylist |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | JS single-threaded event loop guarantees that `if (!rediscoveryPromise) { rediscoveryPromise = ... }` before any `await` is atomic with respect to other concurrent async tasks | Architecture Patterns, Pitfalls | If wrong, deduplication fails and multiple re-discoveries fire; but this is a foundational JS guarantee — risk is negligible |
| A2 | Bun's AbortError is detectable via `error.name === 'AbortError'` | Common Pitfalls | If wrong, abort errors are treated as regular failures; tests would catch this quickly |
| A3 | Naming convention: `cdnState`, `cdnDenylist`, `cdnAbortMap`, `rediscoveryPromise`, `rediscoveryFailed` | Code Examples | Claude's discretion per CONTEXT.md — planner may choose different names |
| A4 | `denylistHost` extracted as a helper function | Code Examples | Inline vs. helper is Claude's discretion per CONTEXT.md |

---

## Open Questions

1. **AbortError detection in Bun**
   - What we know: `AbortController.abort()` causes a `DOMException` / error with `name: 'AbortError'` in browsers and Node.js
   - What's unclear: Whether Bun's fetch throws a standard `DOMException` or a different error type on abort
   - Recommendation: Add a targeted test that aborts a controller and checks `error.name`; existing tests in `article-tools.test.ts` can serve as a model

2. **re-discovery failure messaging for CB-03**
   - What we know: When `rediscoveryPromise` rejects, all awaiters receive the rejection; `rediscoveryFailed = true` blocks further attempts
   - What's unclear: Whether the error message should name each DOI that fast-failed or just state "re-discovery failed"
   - Recommendation: Per REQUIREMENTS.md "clear error" — include the failing DOIs in the error message; the planner should specify the exact wording

---

## Environment Availability

> Step 2.6: SKIPPED — no new external dependencies. Phase is code-only changes to `article-tools.ts`.

---

## Security Domain

> `security_enforcement` not explicitly set to `false` in config.json — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | CB state is internal; no new user inputs |
| V6 Cryptography | no | — |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unbounded `cdnAbortMap` growth | Denial of Service | Unregister controllers in `finally`; batch is bounded by `dois.length` |
| Abort signal not cleared after successful download | Resource exhaustion | `finally` block in `downloadOneSource` removes controller from map |
| Re-discovery exposes discovery failure details in error messages | Information disclosure | Error messages already use generic wording in `withResolvedBaseUrl`; preserve that pattern |

No security-critical changes. The CBs operate on internal state only and do not process untrusted input beyond what already flows through the existing fetch layer.

---

## Sources

### Primary (HIGH confidence)
- `src/tools/article-tools.ts` — complete source of `handleBatchArticleDownload`, `saveArticleFile`, `downloadOneSource`, `hostOf` — verified by direct read
- `src/anna/tool-utils.ts` — `withResolvedBaseUrl` implementation — verified by direct read
- `src/anna/base-url-manager.ts` — `resolveBaseUrl`, `updateBaseUrl`, `isLikelyOfflineBaseUrlError` APIs — verified by direct read
- `src/anna/article-service.ts` — `resolveArticleDownload` domain_index loop — verified by direct read
- `tests/article-tools.test.ts` — existing test patterns and mock structure — verified by direct read
- `.planning/phases/13-circuit-breakers/13-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- JavaScript event loop specification: synchronous assignment before `await` is atomic with respect to other microtasks — standard specification behavior, not version-specific

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all assets verified in codebase
- Architecture: HIGH — all patterns derived directly from existing code
- Pitfalls: HIGH (Pitfall 1/3/4) / MEDIUM (Pitfall 2 — Bun-specific AbortError type unconfirmed)

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (stable codebase, no external deps)
