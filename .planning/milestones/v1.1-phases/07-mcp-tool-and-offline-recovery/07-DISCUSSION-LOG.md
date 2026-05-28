# Phase 7: MCP Tool and Offline Recovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md.

**Date:** 2026-05-19
**Phase:** 7-MCP Tool and Offline Recovery
**Areas discussed:** MCP tool surface, offline routing, docs/tests

---

## MCP tool surface

| Option | Description | Selected |
|--------|-------------|----------|
| Add dedicated tool | Introduce `update_base_url` with structured output | ✓ |
| Keep internal only | No MCP tool for updates | |

**User's choice:** Dedicated tool.
**Notes:** Existing article tool schemas stay unchanged.

---

## Offline routing

| Option | Description | Selected |
|--------|-------------|----------|
| Manual override guidance + automatic single retry | Manual mode errors with guidance, automatic mode retries once | ✓ |
| Always auto-switch | Override manual env setting | |

**User's choice:** Manual override wins with explicit guidance; automatic mode may refresh and retry once.
**Notes:** No silent override of manual `ANNAS_BASE_URL`.

---

## Docs and tests

| Option | Description | Selected |
|--------|-------------|----------|
| Update README and extend mocked tests | Cover tool behavior and cache semantics | ✓ |
| Minimal docs change | Defer coverage to later | |

**User's choice:** Update both docs and tests in this milestone.
**Notes:** Also clarify distinction from MCP client cache hints.

---

## the agent's Discretion

None.

## Deferred Ideas

None.
