# Requirements: annas-mcp-ts v1.4 DOI Verification

**Milestone:** v1.4 DOI Verification
**Status:** Complete
**Last updated:** 2026-05-27

---

## v1.4 Requirements

### CrossRef Integration

- [x] **VER-01**: After Anna's Archive resolves a DOI to metadata, fetch the canonical title from CrossRef (`https://api.crossref.org/works/{doi}`) using the `title` field in the response
- [x] **VER-02**: CrossRef fetch uses a descriptive `User-Agent` header per CrossRef etiquette (e.g. `annas-mcp-ts/1.4 (mailto:...)` or a configurable contact string)
- [x] **VER-03**: CrossRef fetch has a timeout (≤ 5 seconds) and does not block or delay the Anna's Archive sources being returned

### Title Comparison

- [x] **VER-04**: Title comparison is case-insensitive and strips punctuation before comparing
- [x] **VER-05**: Confidence is `"high"` when normalized word-overlap (Jaccard similarity on word sets) is ≥ 0.5, `"low"` when < 0.5
- [x] **VER-06**: Confidence is `"unverified"` when CrossRef is unreachable, times out, returns a non-200 status, or returns no title for the DOI

### Response Shape

- [x] **VER-07**: Single-DOI `article_download` response includes a `verification` object: `{ crossrefTitle: string | null, annasTitle: string | null, confidence: "high" | "low" | "unverified" }`
- [x] **VER-08**: Batch `article_download` response includes `verification` per article result (same shape)
- [x] **VER-09**: Verification never causes a hard failure — if CrossRef errors, the tool still returns sources and sets `confidence: "unverified"`

### Backwards Compatibility

- [x] **VER-10**: Single-DOI response shape is additive only — no existing fields removed or renamed
- [x] **VER-11**: All existing tests continue to pass; the verification field is testable via a mock CrossRef fetch implementation

---

## Future Requirements

_(Deferred from this milestone)_

- Configurable confidence threshold (currently hardcoded at 0.5 Jaccard)
- Author cross-validation in addition to title (CrossRef also returns authors)
- `article_search` DOI auto-detection (query starting with `10.` routes to DOI lookup — parity with Go upstream)

---

## Out of Scope

- Blocking downloads on low confidence — verification is informational; callers decide
- Author or journal validation — title alone is sufficient signal for v1.4
- Caching CrossRef responses — CrossRef is fast and free; caching adds complexity without clear need
- `book_download` verification — books use MD5 hash not DOI; no CrossRef equivalent

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| VER-01 | Phase 15 | Complete |
| VER-02 | Phase 15 | Complete |
| VER-03 | Phase 15 | Complete |
| VER-04 | Phase 16 | Complete |
| VER-05 | Phase 16 | Complete |
| VER-06 | Phase 16 | Complete |
| VER-07 | Phase 17 | Complete |
| VER-08 | Phase 17 | Complete |
| VER-09 | Phase 17 | Complete |
| VER-10 | Phase 17 | Complete |
| VER-11 | Phase 17 | Complete |
