# 05-01 SUMMARY

Implemented revisions-driven base URL discovery in `src/anna/base-url-manager.ts`.

Completed:
- Revisions API ingestion with bounded scan limits.
- Host extraction and strict `annas-archive.*` filter.
- Trust logic: candidate must be in latest revision and one revision older than 24 hours.
- Unit coverage in `tests/base-url.test.ts`.
