# annas-mcp-ts

Bun TypeScript MCP server for Anna's Archive article lookup.

This project is a TypeScript port of article-related MCP behavior from [`iosifache/annas-mcp`](https://github.com/iosifache/annas-mcp). It exposes MCP tools for searching articles and resolving article download URLs and metadata from Anna's Archive. It does not require or perform local file downloads for article tools.

## Features

Included:

- MCP stdio server
- `article_search`
- `article_download` for URL and metadata resolution
- `book_search`
- `book_download` with optional file download
- `update_base_url`
- `ANNAS_SECRET_KEY`
- Optional `ANNAS_BASE_URL`
- Structured metadata responses
- Download URL resolution

Not included:

- CLI commands
- Standalone binary packaging

## Requirements

- [Bun](https://bun.sh/)
- Anna's Archive API access and API key
- An MCP client that can run local stdio servers

## Install

```bash
bun install
```

## Configure

Create an environment file or provide these variables from your MCP client:

```bash
ANNAS_SECRET_KEY="your-api-key"
ANNAS_BASE_URL="annas-archive.li"
# Optional, used only by legacy book file-download behavior:
ANNAS_DOWNLOAD_PATH="/path/to/downloads"
```

`ANNAS_SECRET_KEY` is required for API-backed download URL resolution.

`ANNAS_BASE_URL` is optional. When not set, the server uses automatic mirror discovery from the "Anna's Archive" Wikipedia article: a host is trusted only when it appears in the current revision **and** has been present continuously for at least 7 days (verified against older revisions). This means a poisoned single-edit injection cannot promote a new host. Hosts must still match the structural pattern `annas-archive.<tld>`.

When `ANNAS_BASE_URL` is set, it is treated as a manual override and always wins.
If it is offline, tool calls return guidance to update or remove the variable.

Article tools do not use `ANNAS_DOWNLOAD_PATH`. The variable is only relevant to legacy book file-download behavior when `book_download` is called with `download: true`.

### Security note on `ANNAS_SECRET_KEY`

The upstream Anna's Archive `fast_download` API requires the secret key as a `?key=` query parameter. URLs of this form are vulnerable to incidental disclosure via reverse-proxy access logs, network monitoring, and similar. Operational guidance:

- Terminate TLS at the MCP host where possible so the key never appears in a downstream proxy's logs.
- Do not place the MCP server behind a reverse proxy that logs full request URLs without redaction.
- Rotate `ANNAS_SECRET_KEY` periodically and after any suspected log exposure.

The server itself never logs the full fast-download URL; error messages from network failures redact the key.

## Run

### Bun

```bash
bun run src/server.ts
```

### Node.js (without Bun)

Build first (output goes to `dist/`, which is gitignored):

```bash
bun run build
# or: npm run build
```

Then run:

```bash
node dist/server.js
```

Or via npx after publishing to npm:

```bash
npx annas-mcp
```

For development:

```bash
bun run typecheck
bun test
```

## MCP Client Configuration

### Bun

```json
{
  "mcpServers": {
    "annas-mcp-ts": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/annas-mcp/src/server.ts"],
      "env": {
        "ANNAS_SECRET_KEY": "your-api-key"
      }
    }
  }
}
```

If Bun is installed outside the client process `PATH`, use the absolute Bun binary path for `command`, for example `/Users/you/.bun/bin/bun`.

### Node.js

Build the project first (`bun run build` or `npm run build`), then:

```json
{
  "mcpServers": {
    "annas-mcp-ts": {
      "command": "node",
      "args": ["/absolute/path/to/annas-mcp/dist/server.js"],
      "env": {
        "ANNAS_SECRET_KEY": "your-api-key"
      }
    }
  }
}
```

## Tools

### `article_search`

Search for academic articles by DOI or keywords.

Input:

```json
{
  "query": "10.1038/nature12345"
}
```

DOI-like queries beginning with `10.` use Anna's Archive SciDB lookup behavior. Other queries use Anna's Archive journal/article search.

Structured output:

```json
{
  "query": "machine learning",
  "results": [
    {
      "title": "Example Paper",
      "authors": "Example Author",
      "journal": "Example Journal",
      "size": "2.4MB",
      "hash": "md5-hash",
      "pageUrl": "https://annas-archive.li/md5/md5-hash",
      "downloadUrl": "https://annas-archive.li/scidb?doi=..."
    }
  ]
}
```

### `article_download`

Resolve an academic article by DOI and return download URLs/metadata. The article tool does not write files to disk.

Input:

```json
{
  "doi": "10.1038/nature12345"
}
```

Parameters:
- `doi` (required): DOI of the article to resolve (must match format `10.xxxx/...`)

Structured output:

```json
{
  "article": {
    "doi": "10.1038/nature12345",
    "title": "Example Paper",
    "hash": "md5-hash",
    "pageUrl": "https://annas-archive.li/md5/md5-hash",
    "downloadUrl": "https://annas-archive.li/scidb?doi=10.1038%2Fnature12345"
  },
  "sources": [
    { "type": "fast_download", "url": "https://cdn1.example/..." },
    { "type": "fast_download", "url": "https://cdn2.example/..." },
    { "type": "scidb_pdf",     "url": "https://cdn3.example/...hash...pdf" },
    { "type": "scidb",         "url": "https://annas-archive.li/scidb?doi=10.1038%2Fnature12345" }
  ]
}
```

Output fields:
- `article`: Core article metadata
- `sources`: Ordered list of download sources tried in sequence until one succeeds:
  - `fast_download` — member CDN URLs from the `fast_download.json` API (up to 4 servers via `domain_index`); 8 s timeout each
  - `scidb_pdf` — direct CDN URL scraped from the SciDB page and verified to contain the article's MD5 hash; 20 s timeout; present for most but not all articles
  - `scidb` — SciDB HTML page

### `book_search`

Search Anna's Archive for books by title, author, ISBN, or keywords.

Input:

```json
{
  "query": "Thinking, Fast and Slow"
}
```

Structured output:

```json
{
  "query": "Thinking, Fast and Slow",
  "results": [
    {
      "language": "English",
      "format": "EPUB",
      "size": "1.2MB",
      "title": "Thinking, Fast and Slow",
      "publisher": "Farrar, Straus and Giroux",
      "authors": "Daniel Kahneman",
      "pageUrl": "https://annas-archive.li/md5/md5-hash",
      "hash": "md5-hash"
    }
  ]
}
```

All result fields (`language`, `format`, `size`, `title`, `publisher`, `authors`, `pageUrl`, `hash`) are optional strings — absent fields are omitted from the result object.

### `book_download`

Resolve a book's fast_download URL by MD5 hash. Optionally write the file to disk when `download: true` is set. Pass `title` and `format` from a prior `book_search` result to get the correct filename and extension.

Note: `book_download` uses fast_download only (up to 4 CDN servers via `domain_index`). There is no SciDB fallback for books.

Input:

```json
{
  "hash": "md5-hash-from-book-search",
  "title": "Thinking, Fast and Slow",
  "format": "EPUB",
  "download": true,
  "downloadPath": "/absolute/path/to/save"
}
```

Parameters:
- `hash` (required): MD5 hash of the book from `book_search` results
- `title` (optional): Book title, used for filename when downloading
- `format` (optional): File format (e.g. EPUB, PDF), used as file extension when downloading
- `download` (optional, default `false`): If `true`, download the file to disk. Requires either `downloadPath` (per-call) or `ANNAS_DOWNLOAD_PATH` (env var) to be set.
- `downloadPath` (optional, absolute path): Override the download destination for this call only. **Must resolve inside `ANNAS_DOWNLOAD_PATH`** — paths outside the configured root are rejected. `ANNAS_DOWNLOAD_PATH` must be set for any download to succeed.

Structured output:

```json
{
  "book": {
    "title": "Thinking, Fast and Slow",
    "authors": "Daniel Kahneman",
    "format": "EPUB",
    "language": "English",
    "publisher": "Farrar, Straus and Giroux",
    "hash": "md5-hash"
  },
  "fastDownloadUrl": "https://fast-download-host.example/file",
  "filePath": "/path/to/downloads/Thinking_Fast_and_Slow.epub"
}
```

Output fields:
- `book`: Book metadata (fields from `book_search` result, augmented with `title` and `format` from input)
- `fastDownloadUrl`: Resolved fast_download URL for the book
- `filePath` (only present if `download: true` and file was successfully written): Local path where the file was saved

### `update_base_url`

Refresh Anna's Archive mirror discovery from Wikipedia revisions and update the local server-side cache.

Behavior:

- Uses MediaWiki revisions content as source-of-truth.
- Accepts only `annas-archive.*` hosts.
- Trusts candidates only if present in latest revision and in at least one revision older than 7 days.
- Uses bounded revision scanning (dual cap).

The tool returns the selected host, candidate trust/skipped metadata, and revision evidence. This cache is server-side operational state, not MCP client cache hints (`ttlMs`/`cacheScope`).

Structured output:

```json
{
  "selectedBaseUrl": "annas-archive.li",
  "checkedAt": "2026-05-19T10:00:00.000Z",
  "source": "https://en.wikipedia.org/wiki/Anna%27s_Archive",
  "selector": "infobox link cell",
  "mode": "automatic",
  "revisionEvidence": {
    "thresholdIso": "2026-05-18T10:00:00.000Z",
    "revisionsScanned": 12,
    "usedContinuation": false
  },
  "candidates": [
    {
      "host": "annas-archive.li",
      "latestRevisionSeen": true,
      "seenBeforeThreshold": true,
      "trusted": true
    }
  ]
}
```

When `ANNAS_BASE_URL` is set, `mode` is `"manual_override"` and a `note` field is present explaining that the manual URL remains the active runtime base URL.

## Upstream Porting Matrix

Source project: `iosifache/annas-mcp`

| Upstream capability | Upstream name/path | v1 decision | Reason |
|---------------------|--------------------|-------------|--------|
| MCP stdio server | `internal/modes/mcpserver.go` | Port | Core product surface for this TypeScript version. |
| Article search tool | `article_search` | Port | User-selected v1 tool. |
| Article DOI download metadata tool | `article_download` lookup portions of `Paper.Download` | Port | Port DOI lookup and URL resolution only; this TypeScript MCP tool does not write article files to disk. |
| DOI lookup flow | `/scidb/{doi}` lookup in `internal/anna/anna.go` | Port | Required by both article search for DOI queries and download resolution. |
| Article keyword search flow | `/search?q=...&content=journal` in `internal/anna/anna.go` | Port | Required for non-DOI article search. |
| Anna's Archive base URL config | `ANNAS_BASE_URL` | Port | Needed for mirror support. |
| API key config | `ANNAS_SECRET_KEY` | Port | Needed for API-backed download URL resolution. |
| Download path config | `ANNAS_DOWNLOAD_PATH` | Partial | Used by legacy `book_download` file writes only; article tools do not use this setting. |
| Book search tool | `book_search` | Port | Shipped in v1.2. |
| Book download tool | `book_download` | Port | Shipped in v1.2. |
| CLI mode | `internal/modes/cli.go` | Do not port in v1 | MCP-only v1 scope. |
| Go release pipeline | `.goreleaser`, Go binaries | Do not port in v1 | Bun package distribution can come later. |

## Responsible Use

This software is a utility for accessing Anna's Archive through user-provided credentials. Users are responsible for complying with copyright law, license terms, and Anna's Archive access rules. Prefer lawful access to public domain, permissively licensed, and otherwise authorized materials.
