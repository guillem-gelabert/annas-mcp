# Phase 7: MCP Tool and Offline Recovery - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning
**Mode:** Autonomous capture

<domain>
## Phase Boundary

Expose `update_base_url` as an MCP tool, classify offline mirror failures in article calls, and enforce manual override guidance vs automatic retry behavior.

</domain>

<decisions>
## Implementation Decisions

### MCP Surface
- **D-01:** Add `update_base_url` as a dedicated MCP tool with structured content.
- **D-02:** Keep existing `article_search` and `article_download` schemas unchanged.

### Offline Recovery
- **D-03:** Detect likely offline base URL failures from fetch/network and gateway-like errors.
- **D-04:** In manual mode (`ANNAS_BASE_URL` set), return actionable error asking user to update/remove env var.
- **D-05:** In automatic mode, refresh discovery and retry once with the refreshed trusted base URL.

### Documentation and Tests
- **D-06:** Document override semantics, update tool behavior, and server-side cache distinction.
- **D-07:** Add tests for discovery trust, tool output, and manual/automatic selection behavior.

### the agent's Discretion
No unresolved discretion areas.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/ROADMAP.md` — Phase 7 scope and success criteria.
- `.planning/REQUIREMENTS.md` — `BASE-*`, `REC-*`, `DOC-06`, `TEST-01`.
- `.planning/phases/05-wikipedia-base-url-discovery/05-CONTEXT.md` — trust model.
- `.planning/phases/06-base-url-cache-and-selection/06-CONTEXT.md` — selection and cache model.
- `README.md` — user-facing behavior and constraints.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/tools/article-tools.ts` handler structure and error mapping.
- `src/server.ts` MCP tool registration pattern.
- `src/anna/base-url-manager.ts` discovery and cache APIs.

### Established Patterns
- Structured MCP responses with `structuredContent`.
- Handler-level error boundaries that avoid crashing server.

### Integration Points
- Register new tool in `src/server.ts`.
- Reuse article handler path for retry and manual override messaging.
- Extend tests under `tests/` with mocked network flows.

</code_context>

<specifics>
## Specific Ideas

No additional specifics beyond milestone decisions and prior phase context.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

---

*Phase: 7-MCP Tool and Offline Recovery*
*Context gathered: 2026-05-19*
