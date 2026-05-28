# Phase 5: Wikipedia Base URL Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 5-Wikipedia Base URL Discovery
**Areas discussed:** Wikipedia fetch strategy, 24-hour proof algorithm, revision scan budget, candidate filtering policy

---

## Wikipedia fetch strategy

| Option | Description | Selected |
|--------|-------------|----------|
| `action=parse` first, raw HTML fallback | API-first extraction with page fallback | |
| `action=parse` only | Use parse API as the only source | |
| Raw page HTML only | Use rendered page scraping only | |
| Revision wikitext as source of truth | Use MediaWiki revisions content as authoritative | ✓ |

**User's choice:** Use revision wikitext/content as source of truth (not page HTML).
**Notes:** User explicitly referenced MediaWiki Revisions API documentation as the canonical basis.

---

## 24-hour proof algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| Any revision older than 24h contains candidate | Presence-based proof | |
| Continuous presence for full 24h | Strict continuity proof | |
| First-introduced revision older than 24h | Introduction-timestamp proof | |
| Latest + older-than-24h presence | Must be in latest and at least one older revision | ✓ |

**User's choice:** Trust if present in the latest revision and also present in at least one revision older than 24h.
**Notes:** User preferred this as simpler than full continuity while still robust enough.

---

## Revision scan budget

| Option | Description | Selected |
|--------|-------------|----------|
| Dual cap (count + lookback window) | Bound by max revisions and max age window | ✓ |
| Count cap only | Bound by number of revisions only | |
| Lookback cap only | Bound by time window only | |
| Other | Custom strategy | |

**User's choice:** Dual cap.
**Notes:** This was selected as option `1` in the decision set.

---

## Candidate filtering policy

| Option | Description | Selected |
|--------|-------------|----------|
| Only `annas-archive.*` hosts | Strict domain family filter | ✓ |
| Broader hosts with priority | Allow additional domains | |
| Constant allowlist in code | Explicit multi-domain allowlist | |
| Other | Custom policy | |

**User's choice:** Only `annas-archive.*` hosts (where `*` is a top-level domain).
**Notes:** This should be enforced before trust evaluation.

---

## the agent's Discretion

None.

## Deferred Ideas

None.
