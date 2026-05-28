# Codex Review: Batch Article Feature

Reviewed against `9f486b5` and the current requirements/planning files on 2026-05-20.

Scope reviewed:
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/phases/12-batch-execution/*`
- `.planning/phases/13-circuit-breakers/*`
- `src/tools/article-tools.ts`
- `tests/article-tools.test.ts`

## Summary

The batch article feature aligns with the core v1.3 API shape and the broad two-stage batch execution model: `article_download` now accepts `doi` or `dois`, batch lookup/download uses `Promise.allSettled`, and per-item errors do not suppress successful items.

However, several implementation and verification gaps remain. The highest-impact misalignment is that the batch path silently re-discovers a new base URL even when `ANNAS_BASE_URL` is manually configured, violating the documented manual-override contract. There are also concurrency bugs in batch file writes, incomplete proof of CB-06 skip behavior, and download-stream correctness issues.

## Alignment Confirmed

### API-01: `doi` or `dois` mutually exclusive input

Status: aligned.

Evidence:
- `articleDownloadInputSchema` defines optional `doi` and `dois` fields and rejects both or neither via `superRefine` in `src/tools/article-tools.ts`.
- Tests cover single DOI, multi DOI, both-provided failure, neither-provided failure, empty array failure, and invalid DOI failure.

### API-02: batch response array, single response unchanged

Status: mostly aligned.

Evidence:
- Batch returns `{ results: ArticleBatchResult[] }` from `handleBatchArticleDownload`.
- Single DOI still returns `{ article, sources, filePath }` from `handleSingleArticleDownload`.
- The single-DOI path is separately tested by the CB-07 regression test.

Caveat:
- `article_download` is registered without an `outputSchema`. This avoids declaring the wrong shape for single vs batch, but it also means MCP clients cannot rely on a declared output schema for this tool.

### BATCH-01, BATCH-02, BATCH-03: parallel batch execution with per-item errors

Status: aligned for unique output filenames; partially unsafe for duplicate titles/DOIs.

Evidence:
- Stage 1 uses `Promise.allSettled(args.dois.map(...))` for lookup fan-out.
- Stage 2 uses `Promise.allSettled(resolvedItems.map(...))` for download fan-out.
- Lookup failures produce `{ doi, error }` without `article` or `sources`.
- Download failures preserve `{ doi, article, sources, error }`.
- Partial batch failures do not set top-level `isError`.

## Misalignments And Bugs

### 1. Manual `ANNAS_BASE_URL` is not honored in batch mode

Severity: High.

Requirement impact:
- Violates `.planning/PROJECT.md` validated requirement: preserve `ANNAS_BASE_URL` as the manual override when set.
- Violates `.planning/PROJECT.md` out-of-scope item: silent fallback away from manual `ANNAS_BASE_URL`.
- Weakens `COMPAT-01` because single DOI and batch DOI behave differently when the manually configured mirror is offline.

Code evidence:
- Single DOI uses `withResolvedBaseUrl`, which explicitly checks `dependencies.config.manualBaseUrl` and returns guidance instead of discovering a replacement mirror.
- Batch mode bypasses `withResolvedBaseUrl` and directly calls `manager.updateBaseUrl()` after an offline error.

Why this matters:
- A user who explicitly configured `ANNAS_BASE_URL` expects that value to win.
- Batch mode can make unexpected Wikipedia/discovery requests and route traffic to a mirror the user did not configure.
- Single DOI and batch DOI now differ under the same configuration and failure condition.

Recommended fix:
- In `handleBatchArticleDownload`, before setting `rediscoveryPromise`, check `dependencies.config.manualBaseUrl`.
- If true, throw the same guidance message used by `withResolvedBaseUrl`:
  `Configured ANNAS_BASE_URL appears offline. Update ANNAS_BASE_URL or delete it to let automatic discovery choose a mirror.`
- Add a batch test with `manualBaseUrl: true` and an offline mirror asserting no `updateBaseUrl()` call occurs.

### 2. Batch file downloads race when two articles resolve to the same filename

Severity: High.

Requirement impact:
- Undermines BATCH-02 for realistic batches containing duplicate DOIs, duplicate titles, missing titles, or same sanitized title.
- The test suite avoids this by forcing distinct titles, so the requirement is not covered for common collision cases.

Code evidence:
- `saveArticleFile` derives `filePath` from title/DOI and checks `existsSync(filePath)` before the file exists.
- `downloadOneSource` writes to a deterministic temp path: `${filePath}.tmp`.
- Parallel Stage 2 calls can pick the same `filePath` and the same temp file before either call has created the final file.

Why this matters:
- Two concurrent downloads can write to the same temp file.
- One rename can win while the other fails or overwrites/interleaves data.
- A result can point at a file written by a different DOI.
- The Phase 12 test comment explicitly says distinct titles are used to avoid this race, which confirms the risk is known but not fixed.

Recommended fix:
- Allocate a unique temp file per download attempt, for example `${filePath}.${crypto.randomUUID()}.tmp`.
- Reserve the final output path atomically instead of using `existsSync` pre-checks, or serialize filename allocation within the batch.
- Prefer deriving the filename from DOI/hash plus sanitized title to reduce collisions.
- Add tests for duplicate DOI and duplicate title batch downloads.

### 3. CDN denylist is triggered by any fast-download error, not just host-level failures

Severity: Medium.

Requirement impact:
- Over-broad implementation of CB-04/CB-06.
- The requirements describe CDN host failures. The current code treats content validation failures and file-size failures as host failures.

Code evidence:
- In `saveArticleFile`, any non-AbortError thrown from a `fast_download` source calls `denylistHost(host, cdnState)`.
- Errors that trigger denylisting include HTTP non-2xx, network errors, HTML response, bad PDF magic bytes, file too large, write errors, and other local validation/write errors.

Why this matters:
- One article returning an HTML/login/error page can cause the host to be skipped or aborted for unrelated articles.
- A content-specific or file-specific failure is not necessarily evidence that the CDN host is bad.
- If SciDB fallback is missing or unavailable, valid downloads from the same host can fail unnecessarily.

Recommended fix:
- Classify errors before denylisting.
- Denylist only network/transport-like failures, timeout/abort caused by the local timeout, and probably repeated 5xx responses.
- Do not denylist on PDF magic-byte failure, size limit, local filesystem errors, path errors, or article-specific HTML content unless there is explicit evidence this represents host-level failure.
- Add tests proving bad content from one fast-download URL does not denylist the host for another URL.

### 4. CB-06 skip behavior is implemented but not actually proven by tests

Severity: Medium.

Requirement impact:
- `.planning/REQUIREMENTS.md` CB-06 says subsequent articles skip denylisted hosts and proceed to the next source.
- `.planning/phases/13-circuit-breakers/13-02-PLAN.md` required `paper2Attempted === false` to prove skip behavior.
- The actual test asserts `paper2CDNAttempted === true`, proving in-flight abort behavior instead.

Code evidence:
- Skip logic exists in `saveArticleFile` before `downloadOneSource` is called.
- The test named `CDN denylist - in-flight request aborted...` verifies that the second CDN request starts and is aborted, not that it is skipped.
- The Phase 13 summary documents the deviation and claims skip is covered implicitly.

Why this matters:
- CB-05 and CB-06 are different behaviors.
- Abort proves an already-started request can be cancelled.
- Skip proves a not-yet-started request avoids the known-bad host.
- A regression that removes the skip guard could still pass the current in-flight abort test.

Recommended fix:
- Add a deterministic third DOI whose download starts after the first DOI has denylisted the host.
- Assert the third DOI never fetches the denylisted fast-download URL and proceeds directly to SciDB fallback or the next source.
- Keep the current abort test for CB-05; add a separate skip test for CB-06.

### 5. Base URL variable is not updated after rediscovery

Severity: Medium.

Requirement impact:
- Weakens CB-02 and the milestone goal to detect endpoint failures once and propagate across the batch.
- The implementation deduplicates rediscovery but not use of the known-good mirror for later lookup calls that enter after rediscovery.

Code evidence:
- `baseUrl` is initialized once before `lookupOne`.
- After `rediscoveryPromise` resolves, `newBaseUrl` is used only for that DOI's retry service.
- The outer `baseUrl` variable remains the stale mirror.

Why this matters:
- Any lookup beginning after rediscovery but before batch completion can still attempt the dead mirror first.
- With the current all-at-once fan-out, most DOIs are already in flight, but this still violates the intended state propagation model and makes future throttling or queued execution wrong.

Recommended fix:
- After `const newBaseUrl = await rediscoveryPromise;`, assign `baseUrl = newBaseUrl;`.
- Add a test with delayed DOI lookup entry or throttled/queued lookup simulation to confirm later lookups use the refreshed mirror directly.

### 6. Download timeout is cleared after response headers, not after body completion

Severity: Medium.

Requirement impact:
- Not a direct v1.3 requirement, but it affects batch robustness and the fast-download circuit breaker's ability to fail fast.

Code evidence:
- `downloadOneSource` starts a timeout with `setTimeout(() => controller.abort(), timeoutMs)`.
- It calls `clearTimeout(timeoutId)` immediately after `fetchFn(...)` resolves, which is after response headers arrive.
- The body stream is consumed afterward with no timeout guarding a stalled body.

Why this matters:
- A server can send headers quickly and then stall the body indefinitely.
- `MAX_BYTES` does not help when no bytes arrive.
- Batch `Promise.allSettled` waits for all downloads, so one stalled body can hang the whole batch response.

Recommended fix:
- Move `clearTimeout(timeoutId)` to the `finally` block so the timeout covers the full body read and file write path.
- Add a test where the response body stalls after headers and assert the source times out/falls back.

### 7. Stream error handling can double-reject and race with cleanup

Severity: Medium.

Requirement impact:
- Not a direct v1.3 requirement, but it affects correctness of downloaded files and fallback behavior.

Code evidence:
- On invalid PDF magic bytes, size limit, or truncated response, the body loop calls `writeStream.destroy(error)`, removes the temp file, and then throws the same error.
- The surrounding catch also calls `writeStream.destroy()` and rejects.
- The stream error handler also rejects and removes the temp file.

Why this matters:
- Multiple async rejection/cleanup paths run for the same failure.
- A future stream event ordering change can produce fragile behavior, including races with `finish`/rename cleanup.
- The code is harder to reason about and test than a single rejection path.

Recommended fix:
- Do not call `writeStream.destroy(error)` inside branches that immediately throw.
- Throw once and centralize destruction/removal in one catch/finally path.
- If destroying in catch, pass the error to `destroy(err)` so the stream follows the error path.
- Add tests for invalid PDF, oversized file, and truncated response that assert no final output file remains.

### 8. Documentation state is internally inconsistent

Severity: Low.

Requirement impact:
- Planning/reporting accuracy issue, not runtime behavior.

Evidence:
- `.planning/REQUIREMENTS.md` marks v1.3 requirements complete.
- `.planning/ROADMAP.md` marks Phases 11-13 complete.
- `.planning/PROJECT.md` still lists v1.3 active items unchecked.
- `.planning/STATE.md` says milestone complete but also has stale progress/status fields.

Why this matters:
- Future agents and reviewers may rely on different planning files and reach different conclusions about whether v1.3 is complete.
- This increases the chance that known gaps are missed or duplicate work is planned.

Recommended fix:
- Reconcile `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, and `.planning/ROADMAP.md` after deciding whether the issues above block completion.
- If issues are accepted as follow-up work, add explicit deferred requirements/tech debt entries rather than leaving contradictory status markers.

## Additional Notes

### Output schema omission

`articleDownloadOutputSchema` and `articleBatchDownloadOutputSchema` are both defined, but `article_download` is registered without `outputSchema` because the single and batch paths return different shapes.

This is defensible if the MCP SDK cannot express a union output schema. However, it is still a client contract limitation and should be documented in the report or README if kept intentionally.

### Non-writing default remains aligned

The original project constraint is now "non-writing by default" rather than "never write files." The implementation writes files only when `download: true` is set and `ANNAS_DOWNLOAD_PATH`/`downloadPath` validation succeeds, which aligns with current `.planning/PROJECT.md` constraints.

## Recommended Remediation Order

1. Fix manual `ANNAS_BASE_URL` handling in batch mode and add a regression test.
2. Fix batch filename/temp-file race for duplicate titles/DOIs and add duplicate-title tests.
3. Split CDN denylist tests into separate abort and skip tests; add a deterministic CB-06 skip case.
4. Narrow CDN denylist triggers to host-level failures only.
5. Move download timeout clearing to cover the full body stream.
6. Simplify stream error cleanup to one rejection path.
7. Reconcile planning docs after the technical fixes or explicitly track the remaining issues as accepted debt.
