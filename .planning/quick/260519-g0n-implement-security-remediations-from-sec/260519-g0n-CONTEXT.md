# Quick Task 260519-g0n: implement security remediations from SECURITY.md - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Task Boundary

Implement the actionable remediations from SECURITY.md for the annas-mcp-ts project.
This is a hardening task — no new features, no behaviour changes visible to callers.

</domain>

<decisions>
## Implementation Decisions

### SEC-01 (API key in URL query param)
- SKIP — Anna's Archive API may require query param; can't fix without API change. Accepted risk.

### SEC-02 (.mcp.json not in .gitignore)
- ADD `.mcp.json` to `.gitignore` immediately.

### SEC-03 (encodeURI allows / in DOI)
- Replace `encodeURI(doi)` with `encodeURIComponent(doi)` in `scidbLookupUrl`.
- Add DOI format regex to Zod schema: `/^10\.\d{4,}[^\s]*$/` on both `article_download` and `article_search` DOI path.

### SEC-04 (no allowlist on ANNAS_BASE_URL)
- SKIP — covered by a future phase (phase-5 base-url-discovery).

### SEC-05 (external error string reflected to MCP caller)
- Log raw server error to `console.error` (stderr).
- Return generic message to MCP caller: "API returned an error. Check server logs for details."
- Apply to all AnnasClientError paths that reach the MCP text response.

### SEC-06 (no request timeout)
- Wrap all outgoing fetch calls with `AbortController` + 20 second timeout.
- Apply to both `fetchText` and `fetchFastDownload` in `src/anna/client.ts`.

### SEC-07 (no validation on download_url)
- Validate `FastDownloadResponse` with a Zod schema at runtime.
- Require `download_url` to be a non-empty string starting with `https://`.
- Silently drop (don't push to sources) if validation fails.

### SEC-10 (redactUrl never called)
- Remove the unused `redactUrl` method from `AnnasClient` — dead code. No callers exist.

### Claude's Discretion
- Test updates: update/add tests to cover the new timeout, URL validation, and error sanitization behaviour.

</decisions>

<specifics>
## Specific References

- `src/anna/client.ts` — fetchText, fetchFastDownload, scidbLookupUrl, redactUrl
- `src/anna/article-service.ts` — resolveArticleDownload (where download_url is consumed)
- `src/tools/article-tools.ts` — articleDownloadInputSchema (DOI Zod schema), error paths
- `.gitignore` — add .mcp.json

</specifics>
