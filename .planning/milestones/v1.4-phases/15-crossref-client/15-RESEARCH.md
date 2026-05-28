# Phase 15: CrossRef Client - Research

**Researched:** 2026-05-27
**Domain:** CrossRef REST API / TypeScript fetch module
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Module structure:** `src/anna/crossref-client.ts` — mirrors `client.ts` naming convention
- **Export:** standalone async function `fetchCrossRefTitle(doi: string, fetchImpl?: FetchLike): Promise<string | null>`
- **No new type exports** — return type is `string | null`, no alias needed
- **Test file:** `tests/crossref-client.test.ts`
- **User-Agent:** `annas-mcp-ts/1.4 (mailto:noreply@example.com)` — hardcoded constant
- **Version string:** hardcoded `annas-mcp-ts/1.4` (not read from package.json)
- **Timeout:** hardcoded `5000` ms constant via `AbortSignal.timeout(5000)`
- **All failures return `null`** — timeout, non-200 status, network error, parse error; no distinction

### Claude's Discretion

- Internal constant names (e.g. `CROSSREF_TIMEOUT_MS`, `CROSSREF_USER_AGENT`)
- URL construction: `https://api.crossref.org/works/${encodeURIComponent(doi)}`
- Whether to log anything on failure (prefer silent null return, consistent with codebase)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VER-01 | After Anna's Archive resolves a DOI to metadata, fetch the canonical title from CrossRef (`https://api.crossref.org/works/{doi}`) using the `title` field in the response | CrossRef `/works/{doi}` returns `{ message: { title: string[] } }` — extract `message.title[0]` |
| VER-02 | CrossRef fetch uses a descriptive `User-Agent` header per CrossRef etiquette | Hardcoded constant `annas-mcp-ts/1.4 (mailto:noreply@example.com)` follows CrossRef polite-pool convention |
| VER-03 | CrossRef fetch has a timeout (≤ 5 seconds) and does not block or delay Anna's Archive sources | `AbortSignal.timeout(5000)` — same pattern already used in `base-url-manager.ts` line 198 and `client.ts` line 98 |
</phase_requirements>

---

## Summary

Phase 15 creates a single-responsibility module that calls the CrossRef REST API to retrieve a paper title by DOI. The function follows an already-established project pattern: an async standalone function with an optional `fetchImpl: FetchLike` parameter defaulting to the global `fetch`. All failure paths (network error, timeout, non-200, parse error, missing title array) return `null` silently — no throws, no logging — consistent with the informational design of the wider v1.4 verification feature.

The CrossRef `/works/{doi}` endpoint returns a JSON object with shape `{ status: string, message: { title: string[], ... } }`. The canonical title is `message.title[0]`. This is confirmed by a live API call to `https://api.crossref.org/works/10.1038/nature12345`. [VERIFIED: live CrossRef API]

CrossRef operates a "polite pool" for clients that identify themselves with a contact address in the `User-Agent` header, giving them higher rate limits. The recommended format is `<tool-name>/<version> (mailto:<contact>)`, e.g. `annas-mcp-ts/1.4 (mailto:noreply@example.com)`. [CITED: https://github.com/CrossRef/rest-api-doc]

**Primary recommendation:** Copy the structure of `BROWSER_USER_AGENT` and `AbortSignal.timeout()` from `src/anna/client.ts` — the implementation is a ~30-line module.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CrossRef title fetch | API/Backend (standalone module) | — | Pure I/O module; no UI, no DB layer |
| fetchImpl injection | API/Backend (function parameter) | — | Same pattern used across all network modules in the project |
| Timeout enforcement | API/Backend | — | `AbortSignal.timeout()` is signal-level, not higher |
| Null-on-failure contract | API/Backend | — | Caller (Phase 16 confidence logic) checks for null |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun:test` | bundled with Bun | Test runner | Already used by every test file in the project |
| `FetchLike` (project type) | — | fetchImpl type annotation | Already defined in `src/anna/types.ts`; use directly |

No new external packages are required. The implementation uses only:
- Native `fetch` (Bun built-in)
- `AbortSignal.timeout()` (Web platform API, available in Bun)
- `encodeURIComponent()` (built-in)

**Installation:** None — no new dependencies.

---

## Package Legitimacy Audit

No external packages are installed in this phase. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
Caller (Phase 16)
      |
      | fetchCrossRefTitle(doi, fetchImpl?)
      v
+---------------------------+
|  crossref-client.ts       |
|  1. build URL             |
|  2. call fetchImpl with   |
|     User-Agent header     |
|     + AbortSignal timeout |
|  3. check response.ok     |
|  4. parse JSON            |
|  5. return message.title[0]|
|     or null on any error  |
+---------------------------+
      |
      | GET https://api.crossref.org/works/{doi}
      v
  CrossRef REST API
  { status, message: { title: string[] } }
```

### Recommended Project Structure

No new directories required. One new file alongside existing modules:

```
src/anna/
├── client.ts            # existing
├── article-service.ts   # existing
├── book-service.ts      # existing
├── base-url-manager.ts  # existing
├── types.ts             # existing — FetchLike lives here
├── crossref-client.ts   # NEW — this phase
└── ...
tests/
├── anna.test.ts         # existing
├── crossref-client.test.ts  # NEW — this phase
└── ...
```

### Pattern 1: Standalone function with optional fetchImpl

This is the project's established injection pattern. Phase 15 applies it at function level (not constructor level) because the module has no persistent state.

```typescript
// Source: pattern observed in src/anna/article-service.ts + src/anna/client.ts
import type { FetchLike } from "./types";

const CROSSREF_USER_AGENT = "annas-mcp-ts/1.4 (mailto:noreply@example.com)";
const CROSSREF_TIMEOUT_MS = 5000;

export async function fetchCrossRefTitle(
  doi: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": CROSSREF_USER_AGENT },
      signal: AbortSignal.timeout(CROSSREF_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json() as { message?: { title?: string[] } };
    return data?.message?.title?.[0] ?? null;
  } catch {
    return null;
  }
}
```

[ASSUMED] — constant names `CROSSREF_USER_AGENT` / `CROSSREF_TIMEOUT_MS` are within Claude's discretion per CONTEXT.md; the above is a recommendation.

### Pattern 2: AbortSignal.timeout() usage

Identical to existing usage in `base-url-manager.ts` line 198:

```typescript
// Source: src/anna/base-url-manager.ts line 196-199
signal: AbortSignal.timeout(WIKIPEDIA_FETCH_TIMEOUT_MS),
```

AbortSignal.timeout() rejects with a `TimeoutError` (a `DOMException` with `name === "TimeoutError"`). Because all errors are caught and returned as `null`, no special handling is needed.

### Pattern 3: Test mock via fetchImpl injection

```typescript
// Source: pattern from tests/article-tools.test.ts
import type { FetchLike } from "../src/anna/types";

const mockFetch: FetchLike = async (_url, _init) => {
  return new Response(
    JSON.stringify({ status: "ok", message: { title: ["Some Paper Title"] } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
```

Tests never make real network calls — pass `mockFetch` as `fetchImpl` argument.

### Anti-Patterns to Avoid

- **Throwing on failure:** Every other failure-path in the codebase that is informational (not blocking) returns `null` or an empty result. Do not throw from `fetchCrossRefTitle`.
- **Logging on failure:** The codebase uses `console.error` only for actionable server errors (e.g. fast-download API error). Silent null return is appropriate here.
- **Reading version from package.json:** The CONTEXT.md explicitly locks the version string as hardcoded. Do not attempt dynamic reads.
- **Class-based module:** Every other class in this project wraps multi-call stateful HTTP clients. This is a single stateless function; a class would be unnecessary overhead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fetch timeout | Custom Promise.race + setTimeout | `AbortSignal.timeout()` | Already used project-wide; timeout propagates correctly through fetch abort chain |
| Optional chaining on JSON | Verbose null guards | `data?.message?.title?.[0] ?? null` | TypeScript optional chaining handles undefined at every level cleanly |
| fetchImpl typing | Inline function type | `FetchLike` from `src/anna/types.ts` | Keeps parameter types consistent across all network modules |

**Key insight:** The entire module is a thin wrapper around a single HTTP GET. The only complexity is the failure envelope — and the project pattern (try/catch returning null) already handles it uniformly.

---

## Common Pitfalls

### Pitfall 1: DOI contains forward slashes — encodeURIComponent is required

**What goes wrong:** DOIs like `10.1038/nature12345` contain `/`. Interpolating raw into a URL path produces `https://api.crossref.org/works/10.1038/nature12345` which is correct by accident — but DOIs with URL-special characters (spaces, `#`, `?`) will break or hit the wrong path segment.
**Why it happens:** DOI syntax allows many characters that are reserved in URLs.
**How to avoid:** Always wrap with `encodeURIComponent(doi)`. The existing `scidbLookupUrl` in `client.ts` does this: `encodeURIComponent(doi)`.
**Warning signs:** Unexpected 404 from CrossRef for DOIs that definitely exist.

### Pitfall 2: message.title is an array, not a string

**What goes wrong:** Treating `response.message.title` as a string throws `TypeError: response.message.title.trim is not a function` or silently returns `"[object Array]"`.
**Why it happens:** CrossRef's schema stores title as `string[]` to support subtitle variants.
**How to avoid:** Always access `message.title[0]` (or `message?.title?.[0]`).
**Warning signs:** Returned value is `"[object Array]"` or a TypeError at runtime.

### Pitfall 3: AbortSignal.timeout() throws, not returns

**What goes wrong:** Timeout manifests as a thrown `DOMException` (`name === "TimeoutError"`), not as a resolved null. If the try/catch is missing, the function rejects its promise.
**Why it happens:** AbortSignal cancellation propagates as an error through the fetch promise chain.
**How to avoid:** Wrap the entire fetch + parse block in `try { ... } catch { return null; }`.

### Pitfall 4: Non-200 responses still call response.json()

**What goes wrong:** CrossRef returns 404 for unknown DOIs and 410 for retracted works. Calling `response.json()` on these returns a CrossRef error object, not a title.
**Why it happens:** `fetch` resolves on any HTTP response; `response.ok` must be checked explicitly.
**How to avoid:** `if (!response.ok) return null;` before parsing.

---

## Code Examples

### CrossRef API response shape (confirmed via live call)

```json
{
  "status": "ok",
  "message-type": "work",
  "message-version": "1.0.0",
  "message": {
    "title": ["LRG1 promotes angiogenesis by modulating endothelial TGF-β signalling"],
    "DOI": "10.1038/nature12345",
    ...
  }
}
```

[VERIFIED: live CrossRef API — `https://api.crossref.org/works/10.1038/nature12345`]

### CrossRef 404 response shape

```json
{
  "status": "failed",
  "message-type": "exception",
  "message": "Resource not found."
}
```

HTTP status code is `404`. The `if (!response.ok) return null` guard handles this before any JSON parsing.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polite access via query param `?mailto=` | `User-Agent` header with `mailto:` contact | CrossRef polite pool documentation | `User-Agent` is the current recommended method; query param still works but is less clean |

**Deprecated/outdated:**
- `?mailto=user@example.com` query parameter: CrossRef originally supported adding contact email as a query param. The current recommendation is to embed it in `User-Agent` as `tool/version (mailto:email)`. Both still work as of 2026. [ASSUMED — based on community knowledge; not re-verified in this session]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Constant names `CROSSREF_TIMEOUT_MS` / `CROSSREF_USER_AGENT` are appropriate | Architecture Patterns | Low — names are within Claude's discretion per CONTEXT.md |
| A2 | `?mailto=` query param approach is deprecated in favor of User-Agent | State of the Art | Low — both approaches return polite-pool treatment; User-Agent is correct per CONTEXT.md regardless |

---

## Open Questions

None — scope is fully constrained by CONTEXT.md decisions. All technical details verified.

---

## Environment Availability

Step 2.6: SKIPPED — this phase creates a new TypeScript module with no external CLI tools, services, or runtimes beyond Bun (already the project runtime). CrossRef is a public API with no auth requirement.

---

## Validation Architecture

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. Section skipped per instructions.

---

## Security Domain

This module makes outbound GET requests to a public API (`api.crossref.org`) with no auth tokens. There is no user-controlled data injected into the URL beyond the DOI string, which is URL-encoded via `encodeURIComponent`. No secrets are involved.

Applicable ASVS categories: V5 Input Validation (DOI → URL encoding handled by `encodeURIComponent`). No auth, no sessions, no cryptography, no access control.

No novel threat patterns; standard outbound HTTP safety is satisfied by the existing try/catch + non-200 guard.

---

## Sources

### Primary (HIGH confidence)
- CrossRef REST API live endpoint — `https://api.crossref.org/works/10.1038/nature12345` — confirmed `message.title` is `string[]`
- `src/anna/client.ts` — `BROWSER_USER_AGENT` constant pattern and `AbortSignal.timeout()` usage
- `src/anna/base-url-manager.ts` line 198 — `AbortSignal.timeout(WIKIPEDIA_FETCH_TIMEOUT_MS)` pattern
- `src/anna/types.ts` — `FetchLike` interface definition
- `tests/anna.test.ts`, `tests/article-tools.test.ts` — `FetchLike` mock pattern used in tests

### Secondary (MEDIUM confidence)
- [CrossRef REST API documentation](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) — polite pool User-Agent recommendation
- [CrossRef rest-api-doc GitHub](https://github.com/CrossRef/rest-api-doc) — API format reference

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing project patterns directly applicable
- Architecture: HIGH — pattern is a direct copy of existing module structure
- API response shape: HIGH — verified via live CrossRef API call
- Pitfalls: HIGH — all pitfalls derived from inspecting the codebase and confirmed API behavior

**Research date:** 2026-05-27
**Valid until:** 2026-08-27 (CrossRef API is stable; 90-day validity)
