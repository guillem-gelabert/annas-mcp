# Phase 6: Base URL Cache and Selection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md.

**Date:** 2026-05-19
**Phase:** 6-Base URL Cache and Selection
**Areas discussed:** Cache storage, runtime selection, failure behavior

---

## Cache storage

| Option | Description | Selected |
|--------|-------------|----------|
| Local JSON cache | Simple low-tech server-side cache | ✓ |
| External cache service | Redis/memcached | |

**User's choice:** Local low-tech implementation (from milestone discussion).
**Notes:** Cache is server operational state, separate from MCP client caching hints.

---

## Runtime selection

| Option | Description | Selected |
|--------|-------------|----------|
| Manual override wins | `ANNAS_BASE_URL` always wins when set | ✓ |
| Automatic discovery preferred | ignore manual override | |

**User's choice:** Manual override wins.
**Notes:** If manual override is offline, caller should update/delete env var.

---

## Failure behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback to discovery on cache miss/read error | Keep automatic mode resilient | ✓ |
| Hard fail on cache issues | Stop request path | |

**User's choice:** Resilient fallback.
**Notes:** Output remains structured and stderr-safe.

---

## the agent's Discretion

None.

## Deferred Ideas

None.
