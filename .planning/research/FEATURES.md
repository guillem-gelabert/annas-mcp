# Features Research: Mirror Resilience

## Table Stakes

### Base URL Discovery

- Server can fetch the current Anna's Archive Wikipedia page content.
- Discovery extracts candidate URLs from the infobox URL cell identified by:
  `#mw-content-text > div.mw-content-ltr.mw-parser-output > table.infobox.vcard > tbody > tr:nth-child(5) > td`
- Discovery normalizes candidates to the same base URL format used by `src/config.ts` today.
- Discovery ignores non-http(s), duplicate, malformed, and non-Anna's-Archive-looking links.

### 24-Hour Link Trust

- Server verifies each candidate against Wikipedia revision history.
- A candidate is trusted only if a revision at least 24 hours old contains the same candidate.
- Candidates whose age cannot be proven are reported as skipped, not silently used.
- Revision scans are bounded and return clear errors when the history check cannot complete.

### Caching

- Server persists the most recent trusted discovery result.
- Cache records include candidate URL, source page, checked-at timestamp, revision evidence, and skipped candidate reasons.
- Normal article tools can use cached/discovered base URL only when `ANNAS_BASE_URL` is not set.
- Stale or offline cached URLs trigger refresh attempts in automatic mode.

### MCP Tool Surface

- Server registers a new tool named `update_base_url`.
- Tool refreshes discovery/cache and returns structured details: selected base URL, trusted candidates, skipped candidates, source page, and checked-at timestamp.
- Tool explains when manual `ANNAS_BASE_URL` is set and therefore wins over cached discovery.

### Offline Mirror Recovery

- Client identifies network failures consistent with an offline/unreachable base URL.
- If `ANNAS_BASE_URL` is set, article tools do not auto-switch; they return an MCP-facing error asking the user to update or delete the env var.
- If `ANNAS_BASE_URL` is not set, article tools can refresh discovery and retry with the selected cached/discovered base URL.

## Differentiators

- Clear manual override semantics: explicit env configuration wins.
- Transparent evidence for why a Wikipedia URL is trusted or skipped.
- Recovery happens through the same `update_base_url` path that users can call directly.

## Anti-Features

- No silent fallback away from a manually configured `ANNAS_BASE_URL`.
- No trusting freshly-added Wikipedia links.
- No dependency on Wikipedia availability for every article request when a cache exists.
- No writing downloaded article files.

## Dependencies Between Features

- Discovery and revision-age verification must exist before cache refresh is useful.
- Cache integration must exist before article tools can use automatic base URLs.
- Network error classification must be added before automatic retry behavior.
- MCP registration depends on the discovery service returning stable structured results.
