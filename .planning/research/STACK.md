# Stack Research: Mirror Resilience

## Recommendation

Keep the existing Bun TypeScript stack and add a small Wikipedia discovery layer:

- Runtime/package manager/test runner: Bun
- MCP library: `@modelcontextprotocol/sdk`
- Schema validation: Zod
- HTML parsing: existing `cheerio`
- Wikipedia API access: native `fetch` against MediaWiki Action API
- Cache storage: small JSON file in a user cache directory, not inside the repo
- Testing: `bun test` with mocked `fetch` and Wikipedia API fixtures

## Rationale

MediaWiki's Action API is enough for this milestone. `action=parse` can retrieve parsed HTML for the current Anna's Archive page, while `action=query&prop=revisions` can retrieve revision timestamps and content for bounded history scans. The revision API supports `rvprop=timestamp|ids|content`, `rvslots=main`, `rvlimit`, and continuation, with a 50-revision limit when content is requested.

The implementation should not add a Wikipedia SDK. Native `fetch` is already injectable in the codebase, and the required calls are simple query-string requests.

## Specific Libraries

| Concern | Recommendation | Confidence | Notes |
|---------|----------------|------------|-------|
| Current page HTML | MediaWiki `action=parse` | High | Retrieves parsed HTML that can be queried with the user-provided selector. |
| Revision age | MediaWiki `action=query&prop=revisions` | High | Use timestamps plus revision content to determine when candidate URLs first appeared. |
| HTML parsing | Existing `cheerio` | High | Already installed and used by parser code. |
| Cache | Bun file APIs or Node-compatible fs/path/os | High | Store JSON under a user cache directory; never write article downloads. |
| Tests | `bun:test` with mocked `fetch` | High | Avoid live Wikipedia and Anna's Archive dependency in CI. |

## What Not To Add

- Do not add a CLI for refreshing the base URL.
- Do not silently override `ANNAS_BASE_URL` when it is set.
- Do not trust a current Wikipedia link if its 24-hour revision age cannot be proven.
- Do not make tests depend on live Wikipedia or live Anna's Archive.

## Sources

- MediaWiki Revisions API: https://www.mediawiki.org/wiki/API:Revisions
- MediaWiki Parse API: https://www.mediawiki.org/wiki/API:Parsing_wikitext
- MediaWiki Extlinks API: https://www.mediawiki.org/wiki/API:Extlinks
- Anna's Archive Wikipedia page: https://en.wikipedia.org/wiki/Anna%27s_Archive
