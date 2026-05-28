# Phase 6: Base URL Cache and Selection - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning
**Mode:** Autonomous capture

<domain>
## Phase Boundary

Persist trusted discovery results in a local server-side JSON cache and resolve the effective runtime base URL from manual override or automatic cache/discovery mode.

</domain>

<decisions>
## Implementation Decisions

### Cache Model
- **D-01:** Store cache as JSON at `~/.cache/annas-mcp-ts/base-url-cache.json`.
- **D-02:** Cache record includes selected base URL, timestamp, selector/source metadata, revision evidence, and trusted/skipped candidates.

### Runtime Selection
- **D-03:** If `ANNAS_BASE_URL` is set, it always wins (`manualBaseUrl: true`).
- **D-04:** If manual override is not set, use cache; if cache is empty, run discovery refresh.

### Failure Behavior
- **D-05:** Cache read failures should fall back to discovery.
- **D-06:** Cache write failures should be surfaced through tool error paths and never through stdout logs.

### the agent's Discretion
No unresolved discretion areas.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/ROADMAP.md` — Phase 6 scope and success criteria.
- `.planning/REQUIREMENTS.md` — `CACHE-01` to `CACHE-05`.
- `.planning/phases/05-wikipedia-base-url-discovery/05-CONTEXT.md` — trusted discovery and host filter decisions.
- `src/config.ts` — base URL normalization and env handling.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/anna/base-url-manager.ts` — discovery implementation and cache read/write APIs.
- `src/config.ts` — normalization and manual override flag.

### Established Patterns
- Use injectable `fetch` and isolated helper modules.
- Return structured tool output and avoid stdout side effects.

### Integration Points
- `src/tools/article-tools.ts` runtime base URL resolution.
- `src/tools/base-url-tools.ts` cache refresh surface.

</code_context>

<specifics>
## Specific Ideas

No additional specifics beyond roadmap and prior phase decisions.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

---

*Phase: 6-Base URL Cache and Selection*
*Context gathered: 2026-05-19*
