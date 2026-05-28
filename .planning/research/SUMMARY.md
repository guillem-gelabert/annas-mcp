# Research Summary: Mirror Resilience

## Stack

Keep the existing Bun TypeScript MCP stack. Add a small MediaWiki Action API client using native `fetch`, reuse `cheerio` for the user-specified infobox selector, and persist trusted discovery results as JSON in a user cache location.

## Table Stakes

- Add `update_base_url` as a third MCP tool.
- Extract candidate Anna's Archive URLs from the Wikipedia infobox URL cell.
- Verify candidate age through Wikipedia revision history before trusting it.
- Discard candidates that have not been present for at least 24 hours or whose age cannot be proven.
- Cache trusted discovery results with evidence metadata.
- Use cached/discovered base URL only when `ANNAS_BASE_URL` is not set.
- If a manual `ANNAS_BASE_URL` is offline, return clear guidance to update or delete the env var.
- If an automatic cached/discovered URL is offline, refresh discovery and retry once.

## Watch Out For

- Do not silently override manual env configuration.
- Do not trust current Wikipedia HTML without revision evidence.
- Bound revision-history scans so refresh cannot become unbounded.
- Keep live network access out of normal unit tests.
- Keep all diagnostics out of stdout while MCP stdio is active.

## Architecture Direction

Add three isolated modules:

- `anna/wikipedia.ts` for MediaWiki calls and page/revision parsing
- `anna/base-url-cache.ts` for JSON cache persistence
- `anna/base-url-service.ts` for discovery, trust decisions, cache updates, and selected URL resolution

Then wire them into:

- `config.ts` to track manual vs automatic base URL mode
- `anna/client.ts`/`article-service.ts` to classify offline failures and retry only in automatic mode
- `tools/base-url-tools.ts` and `server.ts` to expose `update_base_url`

## Sources

- MediaWiki Revisions API: https://www.mediawiki.org/wiki/API:Revisions
- MediaWiki Parse API: https://www.mediawiki.org/wiki/API:Parsing_wikitext
- MediaWiki Extlinks API: https://www.mediawiki.org/wiki/API:Extlinks
- Anna's Archive Wikipedia page: https://en.wikipedia.org/wiki/Anna%27s_Archive
