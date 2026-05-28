# Pitfalls Research: Mirror Resilience

## Pitfall: Trusting vandalized Wikipedia links

**Warning signs:** Current infobox links are accepted without checking revision age.

**Prevention:** Require evidence that each candidate appears in revision content from at least 24 hours before the refresh time. Treat uncertain age as untrusted.

**Phase:** Wikipedia discovery.

## Pitfall: Infinite or expensive revision scans

**Warning signs:** Refresh can paginate indefinitely or request too much content.

**Prevention:** Use bounded revision limits and continuation caps. Return a clear skipped/error state when the bound is exhausted before age can be proven.

**Phase:** Wikipedia discovery.

## Pitfall: Fragile selector coupling

**Warning signs:** Implementation assumes the fifth infobox row is always URL and fails opaquely if Wikipedia changes markup.

**Prevention:** Keep the user-requested selector, but return a clear error when no cell or no candidates are found. Cover selector parsing with fixtures.

**Phase:** Wikipedia discovery.

## Pitfall: Silent override of manual configuration

**Warning signs:** `ANNAS_BASE_URL` is set but article calls switch to cached discovery after an offline error.

**Prevention:** Add explicit config state for manual vs automatic base URL. Manual always wins; offline manual URL returns guidance to update/delete env var.

**Phase:** Config and client integration.

## Pitfall: Cache hides bad state

**Warning signs:** Stale cached URLs keep being used after repeated network failures.

**Prevention:** Classify offline base URL failures and refresh/retry once in automatic mode. Include checked-at and evidence metadata in cache.

**Phase:** Cache integration.

## Pitfall: MCP stdio corruption

**Warning signs:** Discovery progress logs go to stdout.

**Prevention:** Keep stdout exclusively for MCP JSON-RPC. Any diagnostics go to stderr or structured tool output.

**Phase:** Tool registration.

## Pitfall: Live-network-only tests

**Warning signs:** Tests fail when Wikipedia changes or Anna's Archive is unreachable.

**Prevention:** Mock `fetch` and use fixtures for current page HTML, revision responses, offline mirror errors, and cache states.

**Phase:** Tests.
