# 07-01 SUMMARY

Completed MCP and recovery integration across server, tools, docs, and tests.

Completed:
- Added `src/tools/base-url-tools.ts` with `update_base_url` tool.
- Registered new tool in `src/server.ts`.
- Added runtime base URL resolution and offline handling in `src/tools/article-tools.ts`.
- Added one-refresh retry path for automatic mode and explicit manual override guidance.
- Updated README and added tests in `tests/base-url-tools.test.ts`.
