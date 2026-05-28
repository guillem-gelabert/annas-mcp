# Phase 10: Tech Debt Clearance - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix four v1.1 quality gaps across base-url-manager.ts, tool-utils.ts, and tests. All changes are small surgical fixes, not new features.

- TD-01: readCache() silently swallows non-ENOENT errors (parse/permission) — surface in update_base_url output via cacheWarning field
- TD-02: withResolvedBaseUrl retry path has no test coverage — add end-to-end test
- TD-03: WIKIPEDIA_SELECTOR constant has misleading name/value — update to describe actual wikitext regex method
- TD-04: Double-offline (retry also fails) surfaces raw network error — replace with actionable guidance message

</domain>

<decisions>
## Implementation Decisions

- **D-01 (TD-01):** Change `readCache()` to throw on non-ENOENT errors. In `handleUpdateBaseUrl`, call `manager.readCache()` before `updateBaseUrl()`; if it throws, capture error message. Add `cacheWarning: z.string().optional()` to `updateBaseUrlOutputSchema` and populate it when cache read fails.
- **D-02 (TD-02):** Add test in `tests/anna.test.ts` (or new `tests/tool-utils.test.ts`) for the retry path: mock BaseUrlManager, first `run()` call throws "enotfound" error, second succeeds. `config.manualBaseUrl: false` so the retry path is taken.
- **D-03 (TD-03):** Replace the `WIKIPEDIA_SELECTOR` constant name and value with `WIKITEXT_EXTRACTION_METHOD = "wikitext-url-regex"` to accurately describe that extraction uses URL regex on wikitext content, not CSS selection.
- **D-04 (TD-04):** In `withResolvedBaseUrl` in `tool-utils.ts`, wrap the retry `run()` call in try-catch; if it also throws an offline error, replace with: "Both the current mirror and the fallback discovery appear offline. Try again later or set ANNAS_BASE_URL to a known working mirror."

</decisions>

---

*Phase: 10-Tech Debt Clearance*
*Context gathered: 2026-05-19*
