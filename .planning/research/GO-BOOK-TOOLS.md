# Go Reference: book_search and book_download

Source: https://github.com/iosifache/annas-mcp (read via GitHub API)

---

## API Endpoints Called

### book_search
```
GET https://{ANNAS_BASE_URL}/search?q={encoded_query}&content=book_any
```
- Scrapes the HTML response (no JSON API).
- Same endpoint shape as article_search, but `content=book_any` instead of `content=journal`.

### book_download (two-step)
Step 1 — fetch download URL via fast_download API:
```
GET https://{ANNAS_BASE_URL}/dyn/api/fast_download.json?md5={hash}&key={secretKey}
```
Response: `{ "download_url": "https://...", "error": "..." }` (same struct as article fast_download)

Step 2 — fetch the actual file from the returned `download_url`.

There is **no SciDB fallback for books**. If `fast_download` fails, the whole download fails.
Articles have a SciDB fallback; books do not.

---

## Structs

### Book (Go)
```go
type Book struct {
    Language  string `json:"language"`
    Format    string `json:"format"`   // "EPUB", "PDF", "MOBI", "DJVU", etc. (uppercased)
    Size      string `json:"size"`     // e.g. "0.7MB"
    Title     string `json:"title"`
    Publisher string `json:"publisher"`
    Authors   string `json:"authors"`
    URL       string `json:"url"`      // full page URL on Anna's Archive
    Hash      string `json:"hash"`     // MD5 hash — the book identifier
}
```

### Paper (Go, for comparison)
```go
type Paper struct {
    DOI         string `json:"doi"`
    Title       string `json:"title,omitempty"`
    Authors     string `json:"authors"`
    Journal     string `json:"journal"`
    Size        string `json:"size"`
    Hash        string `json:"hash,omitempty"`
    DownloadURL string `json:"download_url"`
    SciHubURL   string `json:"scihub_url,omitempty"`
    PageURL     string `json:"page_url"`
}
```

Key differences in struct:
- Book has `Language`, `Format`, `Publisher`; Paper has `DOI`, `Journal`, `DownloadURL`, `SciHubURL`.
- Book uses `URL` (page link); Paper uses `PageURL`.
- Book identifier is always `Hash` (MD5); Paper uses `DOI` as primary user-facing identifier.

---

## Tool Input Parameters

### book_search
```
query: string   // search terms (title, author, topic)
```

### book_download
```
hash:   string  // MD5 hash from book_search results
title:  string  // book title — used to construct the filename
format: string  // e.g. "pdf" or "epub" — used as file extension
```
The Go tool constructs an `anna.Book{Hash, Title, Format}` on the fly and calls `.Download()`.
The caller (the LLM) is expected to pass title and format from a previous book_search result.

### article_search (for contrast)
```
query: string   // DOI or keywords; auto-detects DOI if it starts with "10."
```

### article_download (for contrast)
```
doi: string     // DOI; always does a LookupDOI call first, then downloads
```
Article download always re-fetches metadata from the API by DOI — it does NOT accept a pre-existing hash. Book download accepts the hash directly.

---

## HTML Scraping — book_search vs article_search

Both search functions use the **exact same CSS selectors** and DOM structure. The only
difference is the `content=` query param.

Shared scraping pattern (Go's colly / our cheerio):
- Anchor: `a[href^='/md5/']` with class `"custom-a block mr-2 sm:mr-4 hover:opacity-80"`
- Title: `div.max-w-full > a[href^='/md5/']` text
- Authors: `a[href^='/search'] span.icon-[mdi--user-edit]` parent text
- Publisher/journal: `a[href^='/search'] span.icon-[mdi--company]` parent text
- Meta (lang/format/size): `div.text-gray-800` text

Book-specific parsing: Go's `extractMetaInformation()` extracts three fields from the meta string:
- **Language**: first `· ` segment before `[xx]` lang code, strip leading `✅`
- **Format**: first match of `(EPUB|PDF|MOBI|AZW3|AZW|DJVU|CBZ|CBR|FB2|DOCX?|TXT)` regex
- **Size**: first match of `\d+\.?\d*\s*(MB|KB|GB|TB)` regex

Our article parser only extracts `size` from this meta string — it ignores language and format entirely. For books we need all three.

---

## Download Logic Differences

| Aspect | Book | Article |
|---|---|---|
| Primary method | `fast_download` API (requires `ANNAS_SECRET_KEY`) | `fast_download` API if hash + key present |
| Fallback | None — error if fast_download fails | SciDB download (`/scidb?doi=…`) |
| Input to download | MD5 hash (passed by caller) | DOI (looked up fresh every time) |
| Filename | `{sanitizedTitle}.{lowercaseFormat}` | `{sanitizedTitle|DOI}.{ext from Content-Type/Disposition}` |
| File extension | Taken from `book.Format` field (lowercased) | Inferred from HTTP response headers; defaults to `.pdf` |
| Timeout | 30 s (Go constant `HTTPTimeout`) | Our TS: 20 s fast_download, 300 s scidb |
| Size limit | None in Go | Our TS: 100 MB |

Go's `Book.Download()` also calls `out.Sync()` after writing to flush to disk. We already do
an atomic rename via temp file, which is strictly safer.

---

## Error Handling Patterns (Go)

```go
// fast_download API error field
type fastDownloadResponse struct {
    DownloadURL string `json:"download_url"`
    Error       string `json:"error"`
}
// If Error != "" → return fmt.Errorf("API error: %s", apiResp.Error)
// If DownloadURL == "" and no Error → errors.New("API returned empty download URL")
```

Non-200 HTTP status from fast_download API reads up to 512 bytes of body for the error message.
Partial file is deleted on any write failure (deferred cleanup).

---

## File Format Handling

The Go code recognizes these formats in search results:
```
EPUB, PDF, MOBI, AZW3, AZW, DJVU, CBZ, CBR, FB2, DOCX, DOC, TXT
```
Format is uppercased when stored in `Book.Format`, lowercased when used as file extension.

For download, format is **caller-supplied** (from book_search results). If empty, Go defaults to `"bin"`.

---

## book_search Output (Go's `.String()` method)

Go returns a plain-text block per book:
```
Title: ...
Authors: ...
Publisher: ...
Language: ...
Format: ...
Size: ...
URL: ...
Hash: ...
```
One block per result, separated by `\n\n`. No JSON output from the MCP tool itself — just text.
Our TS article tools return structured JSON (with `structuredContent`); we should do the same for books.

---

## Config Requirements

Go requires **both** `ANNAS_SECRET_KEY` and `ANNAS_DOWNLOAD_PATH` to be set at startup — it
errors before any tool is called if either is missing. Our TS config differs:
- `ANNAS_SECRET_KEY` is required at startup.
- `ANNAS_DOWNLOAD_PATH` is optional at startup; required only when `download: true` is passed.

For book_download in TS we should follow the same optional-at-config / required-at-call pattern
we already use for article_download (supporting per-call `downloadPath` override).

---

## What the Go Tool Does That We Must Not Miss

1. **`content=book_any`** query param — without this the search returns articles, not books.
2. **Language field** — parsed from the meta string; not extracted in our current article code.
3. **Format field** — parsed from the meta string; not extracted in our current article code.
4. **Publisher field** — same selector as article's `journal` (`span.icon-[mdi--company]`), but semantically different.
5. **Book hash is passed directly to download** — no server round-trip to resolve it (unlike article which re-fetches by DOI).
6. **No SciDB fallback for books** — books can only be downloaded via fast_download. If the key is missing or the API fails, the download fails hard.
7. **Format as file extension** — book files are saved as `.epub`, `.pdf`, etc. based on the format from search metadata, not from HTTP headers.
