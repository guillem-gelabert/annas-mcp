# Architecture Research: Mirror Resilience

## Proposed Components

```text
MCP client
  |
  | stdio JSON-RPC
  v
src/server.ts
  |
  +-- tools/article-tools.ts
  +-- tools/base-url-tools.ts
          |
          v
     anna/article-service.ts
          |
          +-- anna/client.ts
          +-- anna/base-url-service.ts
          +-- anna/wikipedia.ts
          +-- anna/base-url-cache.ts
          +-- config.ts
```

## Component Boundaries

| Component | Responsibility | Should Not Do |
|-----------|----------------|---------------|
| `base-url-tools.ts` | Register/handle `update_base_url`, format MCP response. | Parse Wikipedia HTML directly. |
| `base-url-service.ts` | Orchestrate discovery, age checks, cache reads/writes, and selected URL decision. | Know MCP protocol details. |
| `wikipedia.ts` | Build MediaWiki API requests and parse returned page/revision data. | Know Anna's Archive article workflows. |
| `base-url-cache.ts` | Persist and load trusted discovery results. | Fetch network resources. |
| `config.ts` | Distinguish manual `ANNAS_BASE_URL` from automatic default/discovery behavior. | Trigger network discovery during env parsing. |
| `anna/client.ts` | Use a resolved base URL and classify network/offline failures. | Mutate cache directly. |

## Data Flow

### Explicit Refresh

1. MCP client calls `update_base_url`.
2. Tool calls base URL service refresh.
3. Service fetches current Anna's Archive page HTML through MediaWiki parse/current-page access.
4. Service extracts candidates from the specified infobox URL cell.
5. Service scans bounded revision content/timestamps to prove each candidate existed at least 24 hours ago.
6. Service writes trusted result to cache and returns structured evidence.

### Article Request With Manual Env

1. `ANNAS_BASE_URL` is set.
2. Article client uses that URL.
3. If the URL is offline/unreachable, tool returns an error telling the user to update or delete `ANNAS_BASE_URL`.
4. No automatic switch occurs.

### Article Request Without Manual Env

1. `ANNAS_BASE_URL` is unset.
2. Article service resolves base URL from cache or refreshes discovery when needed.
3. Article request uses the selected cached/discovered URL.
4. If the URL is offline, service refreshes and retries once with the newly selected trusted URL.

## Implementation Notes

- `loadConfig` should preserve whether `ANNAS_BASE_URL` was manually provided, not only the normalized string.
- Keep discovery network calls injectable for tests.
- Cache write failures should not crash article tools if a trusted URL can still be returned for the current request, but they should be visible in `update_base_url` output.
- Use HTTPS origins for Anna's Archive candidates.
