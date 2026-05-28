import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { handleBookSearch, handleBookDownload } from "../src/tools/book-tools";
import type { FetchLike } from "../src/anna/types";
import type { AnnasConfig } from "../src/config";

const config: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: true,
  downloadPath: null,
};

const bookSearchHtml = `
<html>
  <body>
    <div>
      <a class="custom-a block mr-2 sm:mr-4 hover:opacity-80" href="/md5/deadbeef1234">cover</a>
      <div class="max-w-full">
        <a href="/md5/deadbeef1234">Dune</a>
        <a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Frank Herbert</a>
        <a href="/search?q=publisher"><span class="icon-[mdi--company]"></span>Chilton Books</a>
        <div class="text-gray-800">English [en] · EPUB · 0.7 MB</div>
      </div>
    </div>
  </body>
</html>
`;

function buildBookSearchHtml(count: number): string {
  const rows = Array.from({ length: count }, (_, index) => {
    const i = index + 1;
    const hash = `bookhash${String(i).padStart(2, "0")}`;
    return `
    <div>
      <a class="custom-a block mr-2 sm:mr-4 hover:opacity-80" href="/md5/${hash}">cover</a>
      <div class="max-w-full">
        <a href="/md5/${hash}">Book ${i}</a>
        <a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Author ${i}</a>
        <a href="/search?q=publisher"><span class="icon-[mdi--company]"></span>Publisher ${i}</a>
        <div class="text-gray-800">English [en] · EPUB · 0.${i} MB</div>
      </div>
    </div>
`;
  }).join("\n");

  return `<html><body>${rows}</body></html>`;
}

function response(body: string): Response {
  return new Response(body, { status: 200 });
}

function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
  const item = result.content[0];
  expect(item?.type).toBe("text");
  return item?.text ?? "";
}

const fastDownloadJson = JSON.stringify({ download_url: "https://cdn.example.com/file.epub" });

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

describe("book_download MCP handler", () => {
  test("returns download URL without writing file when download is false", async () => {
    const fetchMock: FetchLike = async () => jsonResponse(fastDownloadJson);

    const result = await handleBookDownload(
      { hash: "abc123", title: "Dune", format: "EPUB" },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      book: { hash: "abc123", title: "Dune", format: "EPUB" },
      fastDownloadUrl: "https://cdn.example.com/file.epub",
      filePath: undefined,
    });
  });

  test("returns error when download: true but ANNAS_DOWNLOAD_PATH not configured", async () => {
    const fetchMock: FetchLike = async () => jsonResponse(fastDownloadJson);

    const result = await handleBookDownload(
      { hash: "abc123", download: true },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("ANNAS_DOWNLOAD_PATH");
  });

  test("returns error when downloadPath is relative", async () => {
    const fetchMock: FetchLike = async () => jsonResponse(fastDownloadJson);
    const rooted: AnnasConfig = { ...config, downloadPath: "/tmp/annas-root" };

    const result = await handleBookDownload(
      { hash: "abc123", download: true, downloadPath: "relative/path" },
      { config: rooted, fetchImpl: fetchMock },
    );

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("absolute path");
  });

  test("returns error when downloadPath is outside ANNAS_DOWNLOAD_PATH", async () => {
    const fetchMock: FetchLike = async () => jsonResponse(fastDownloadJson);
    const rooted: AnnasConfig = { ...config, downloadPath: "/tmp/annas-root" };

    const result = await handleBookDownload(
      { hash: "abc123", download: true, downloadPath: "/etc" },
      { config: rooted, fetchImpl: fetchMock },
    );

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("must be inside ANNAS_DOWNLOAD_PATH");
  });

  test("rejects downloadPath traversal payload after resolution", async () => {
    const fetchMock: FetchLike = async () => jsonResponse(fastDownloadJson);
    const rooted: AnnasConfig = { ...config, downloadPath: "/tmp/annas-root" };

    const result = await handleBookDownload(
      { hash: "abc123", download: true, downloadPath: "/tmp/annas-root/../../etc" },
      { config: rooted, fetchImpl: fetchMock },
    );

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("must be inside ANNAS_DOWNLOAD_PATH");
  });

  test("returns error when download response is HTML (login redirect)", async () => {
    let callCount = 0;
    const fetchMock: FetchLike = async () => {
      callCount++;
      if (callCount === 1) {
        return jsonResponse(fastDownloadJson);
      }
      return new Response("<html>Login</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const root = `/tmp/annas-test-${Date.now()}`;
    const rooted: AnnasConfig = { ...config, downloadPath: root };

    const result = await handleBookDownload(
      { hash: "abc123", title: "Dune", format: "EPUB", download: true, downloadPath: root },
      { config: rooted, fetchImpl: fetchMock },
    );

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("HTML response");
  });

  test("returns error when fast_download API fails", async () => {
    const fetchMock: FetchLike = async () => {
      throw new Error("API unreachable");
    };

    const result = await handleBookDownload({ hash: "abc123" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("API unreachable");
  });

  test("returns cached file path without fetching when hash was previously downloaded", async () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-book-test-"));
    let fetchCallCount = 0;
    const fetchMock: FetchLike = async () => {
      fetchCallCount++;
      return new Response(JSON.stringify({ download_url: "https://cdn.example.com/file.epub" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const dummyFile = join(root, "dune.epub");
      writeFileSync(dummyFile, "dummy");
      writeFileSync(join(root, ".annas-cache.json"), JSON.stringify({ "md5:abc123": dummyFile }));

      const rooted: AnnasConfig = { ...config, downloadPath: root };
      const result = await handleBookDownload(
        { hash: "abc123", title: "Dune", format: "EPUB", download: true, downloadPath: root },
        { config: rooted, fetchImpl: fetchMock },
      );

      expect(result.isError).toBeUndefined();
      const sc = result.structuredContent as { filePath?: string };
      expect(sc.filePath).toBe(dummyFile);
      // Resolution calls fast_download API for each domain index (up to 4), but CDN file download is NOT called on cache hit
      expect(fetchCallCount).toBeGreaterThan(0);
      expect(fetchCallCount).toBeLessThanOrEqual(4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("book MCP handlers", () => {
  test("book_search returns structured results", async () => {
    const fetchMock: FetchLike = async () => response(bookSearchHtml);

    const result = await handleBookSearch({ query: "dune" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      query: "dune",
      results: [
        {
          title: "Dune",
          authors: "Frank Herbert",
          publisher: "Chilton Books",
          language: "English [en]",
          format: "EPUB",
          size: "0.7 MB",
          hash: "deadbeef1234",
          pageUrl: "https://annas-archive.li/md5/deadbeef1234",
        },
      ],
    });
  });

  test("book_search returns clear no-results response", async () => {
    const fetchMock: FetchLike = async () => response("<html></html>");

    const result = await handleBookSearch({ query: "nonexistent" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    expect(firstText(result)).toContain("No books found");
    expect(result.structuredContent).toEqual({ query: "nonexistent", results: [] });
  });

  test("book_search defaults to limit=10", async () => {
    const fetchMock: FetchLike = async () => response(buildBookSearchHtml(12));

    const result = await handleBookSearch({ query: "books" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { query: string; results: Array<{ title?: string }> };
    expect(sc.query).toBe("books");
    expect(sc.results).toHaveLength(10);
    expect(sc.results[0]?.title).toBe("Book 1");
    expect(sc.results[9]?.title).toBe("Book 10");
    expect(firstText(result)).toContain("returning first 10");
  });

  test("book_search respects explicit limit override", async () => {
    const fetchMock: FetchLike = async () => response(buildBookSearchHtml(12));

    const result = await handleBookSearch({ query: "books", limit: 4 }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { query: string; results: Array<{ title?: string }> };
    expect(sc.query).toBe("books");
    expect(sc.results).toHaveLength(4);
    expect(sc.results[3]?.title).toBe("Book 4");
    expect(firstText(result)).toContain("returning first 4");
  });

  test("tool failures return MCP errors", async () => {
    const fetchMock: FetchLike = async () => {
      throw new Error("Network error");
    };

    const result = await handleBookSearch({ query: "dune" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("Network error");
  });
});
