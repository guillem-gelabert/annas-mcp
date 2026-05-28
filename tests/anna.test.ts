import { describe, expect, test } from "bun:test";

import {
  articleDetailUrl,
  articleSearchUrl,
  bookSearchUrl,
  fastDownloadUrl,
  scidbDownloadUrl,
  scidbLookupUrl,
} from "../src/anna/client";
import { ArticleService, isDoiQuery } from "../src/anna/article-service";
import { AnnasClient } from "../src/anna/client";
import { BookService } from "../src/anna/book-service";
import { redactKeyInUrl } from "../src/config";
import { BaseUrlManager } from "../src/anna/base-url-manager";
import { withResolvedBaseUrl } from "../src/anna/tool-utils";
import { validateDownloadUrl, sanitizeFilename, safeJoinPath } from "../src/anna/file-utils";
import {
  parseArticleDetail,
  parseArticleSearchResults,
  parseBookSearchResults,
  parseFirstArticleHash,
} from "../src/anna/parse";
import type { FetchLike } from "../src/anna/types";
import type { AnnasConfig } from "../src/config";

const config: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: true,
  downloadPath: null,
};

const searchHtml = `
<html>
  <body>
    <div>
      <a class="custom-a block mr-2 sm:mr-4 hover:opacity-80" href="/md5/abc123def456">cover</a>
      <div class="max-w-full">
        <a href="/md5/abc123def456">Interesting Paper</a>
        <a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Ada Lovelace</a>
        <a href="/search?q=journal"><span class="icon-[mdi--company]"></span>Journal of Tests</a>
        <div class="text-gray-800">English [en] · PDF · 2.4MB · 2025</div>
      </div>
    </div>
  </body>
</html>
`;

const detailHtml = `
<html>
  <head>
    <title>Interesting Paper - Anna's Archive</title>
    <meta name="description" content="Ada Lovelace

Test Publisher

Journal of Tests, vol 1, 2025">
  </head>
  <body>
    <a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Ada Lovelace</a>
    <div class="text-gray-500">PDF · 2.4MB</div>
  </body>
</html>
`;

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    ...init,
  });
}

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

describe("URL construction", () => {
  test("builds article search URL", () => {
    expect(articleSearchUrl(config, "machine learning")).toBe(
      "https://annas-archive.li/search?q=machine+learning&content=journal",
    );
  });

  test("builds book search URL", () => {
    expect(bookSearchUrl(config, "dune frank herbert")).toBe(
      "https://annas-archive.li/search?q=dune+frank+herbert&content=book_any",
    );
  });

  test("builds DOI lookup and SciDB download URLs", () => {
    expect(scidbLookupUrl(config, "10.1038/nature12345")).toBe(
      "https://annas-archive.li/scidb/10.1038%2Fnature12345",
    );
    expect(scidbDownloadUrl(config, "10.1038/nature12345")).toBe(
      "https://annas-archive.li/scidb?doi=10.1038%2Fnature12345",
    );
  });

  test("builds detail and fast-download URLs", () => {
    expect(articleDetailUrl(config, "abc123")).toBe("https://annas-archive.li/md5/abc123");
    expect(fastDownloadUrl(config, "abc123")).toBe(
      "https://annas-archive.li/dyn/api/fast_download.json?md5=abc123&key=feedfacecafebeef",
    );
  });
});

describe("book parsers", () => {
  test("parses book search result cards", () => {
    expect(parseBookSearchResults(bookSearchHtml, "https://annas-archive.li")).toEqual([
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
    ]);
  });

  test("returns empty array for empty HTML", () => {
    expect(parseBookSearchResults("<html></html>", "https://annas-archive.li")).toEqual([]);
  });
});

describe("parsers", () => {
  test("parses article search result cards", () => {
    expect(parseArticleSearchResults(searchHtml, "https://annas-archive.li")).toEqual([
      {
        title: "Interesting Paper",
        authors: "Ada Lovelace",
        journal: "Journal of Tests",
        size: "2.4MB",
        hash: "abc123def456",
        pageUrl: "https://annas-archive.li/md5/abc123def456",
      },
    ]);
  });

  test("parses first hash from DOI lookup HTML", () => {
    expect(parseFirstArticleHash(searchHtml)).toBe("abc123def456");
  });

  test("parses article detail metadata", () => {
    expect(parseArticleDetail(detailHtml)).toEqual({
      title: "Interesting Paper",
      authors: "Ada Lovelace",
      journal: "Journal of Tests, vol 1, 2025",
      size: "2.4MB",
    });
  });
});

describe("withResolvedBaseUrl offline retry", () => {
  test("retries with refreshed URL after offline error", async () => {
    let runCallCount = 0;
    const manager = {
      async resolveBaseUrl() { return "annas-archive.li"; },
      async updateBaseUrl() { return {}; },
    } as unknown as BaseUrlManager;

    const retryConfig = { ...config, manualBaseUrl: false };

    const result = await withResolvedBaseUrl(
      { config: retryConfig },
      manager,
      (cfg) => cfg.baseUrl,
      async (baseUrl) => {
        runCallCount++;
        if (runCallCount === 1) {
          throw new Error("enotfound annas-archive.li");
        }
        return `resolved-via-${baseUrl}`;
      },
    );

    expect(runCallCount).toBe(2);
    expect(result.results).toBe("resolved-via-annas-archive.li");
  });

  test("surfaces actionable message when retry also fails offline", async () => {
    const manager = {
      async resolveBaseUrl() { return "annas-archive.li"; },
      async updateBaseUrl() { return {}; },
    } as unknown as BaseUrlManager;

    const retryConfig = { ...config, manualBaseUrl: false };

    await expect(
      withResolvedBaseUrl(
        { config: retryConfig },
        manager,
        (cfg) => cfg.baseUrl,
        async () => { throw new Error("enotfound annas-archive.li"); },
      ),
    ).rejects.toThrow("Both the current mirror and the fallback discovery appear offline");
  });
});

describe("BookService", () => {
  test("searches books by query", async () => {
    const fetchMock: FetchLike = async (input) => {
      expect(String(input)).toContain("content=book_any");
      return response(bookSearchHtml);
    };

    const service = new BookService(config, fetchMock);
    const results = await service.searchBooks("dune");

    expect(results).toHaveLength(1);
    expect(results[0]?.hash).toBe("deadbeef1234");
  });

  test("resolveBookDownload returns resolution with fastDownloadUrls", async () => {
    const fetchMock: FetchLike = async () =>
      new Response(JSON.stringify({ download_url: "https://cdn.example.com/book.epub" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const service = new BookService(config, fetchMock);
    const result = await service.resolveBookDownload("abc123");

    expect(result.book).toEqual({ hash: "abc123" });
    expect(result.fastDownloadUrls).toContain("https://cdn.example.com/book.epub");
    expect(result.fastDownloadUrls.length).toBeGreaterThanOrEqual(1);
  });

  test("resolveBookDownload throws when API returns no URL", async () => {
    const fetchMock: FetchLike = async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const service = new BookService(config, fetchMock);
    await expect(service.resolveBookDownload("abc123")).rejects.toThrow("no download URL");
  });
});

describe("secret redaction", () => {
  test("redactKeyInUrl replaces key value in query string", () => {
    expect(redactKeyInUrl("https://x/api?md5=abc&key=secret123")).toBe(
      "https://x/api?md5=abc&key=[redacted]",
    );
    expect(redactKeyInUrl("https://x/api?key=secret123&md5=abc")).toBe(
      "https://x/api?key=[redacted]&md5=abc",
    );
  });

  test("redactKeyInUrl leaves other params untouched and is a no-op without key=", () => {
    expect(redactKeyInUrl("https://x/api?md5=abc")).toBe("https://x/api?md5=abc");
    expect(redactKeyInUrl("")).toBe("");
  });

  test("fetchFastDownload error does not leak the secret", async () => {
    const fetchMock: FetchLike = async () => {
      throw new Error("connect ECONNREFUSED https://annas-archive.li/dyn/api/fast_download.json?md5=h&key=feedfacecafebeef");
    };
    const client = new AnnasClient(config, fetchMock);
    let caught: unknown;
    try {
      await client.fetchFastDownload("h");
    } catch (e) {
      caught = e;
    }
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).not.toContain("feedfacecafebeef");
    expect(message).toContain("[redacted]");
  });
});

describe("file-utils security utilities", () => {
  test("validateDownloadUrl accepts HTTPS public URL", () => {
    const url = validateDownloadUrl("https://cdn.example.com/file.epub");
    expect(url).toBeInstanceOf(URL);
  });

  test("validateDownloadUrl rejects HTTP", () => {
    expect(() => validateDownloadUrl("http://cdn.example.com/file.epub")).toThrow("non-HTTPS");
  });

  test("validateDownloadUrl rejects localhost", () => {
    expect(() => validateDownloadUrl("https://localhost/file")).toThrow("private/loopback");
  });

  test("validateDownloadUrl rejects private IP", () => {
    expect(() => validateDownloadUrl("https://192.168.1.100/file")).toThrow("private/loopback");
  });

  test("sanitizeFilename removes path traversal components", () => {
    const name = sanitizeFilename("../../etc/passwd");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
  });

  test("sanitizeFilename preserves safe names", () => {
    expect(sanitizeFilename("My Book.epub")).toBe("My Book.epub");
  });

  test("safeJoinPath returns correct path for safe input", () => {
    expect(safeJoinPath("/tmp/downloads", "book.epub")).toBe("/tmp/downloads/book.epub");
  });

  test("safeJoinPath returns safe path even for traversal input", () => {
    const result = safeJoinPath("/tmp/downloads", "../etc/passwd");
    expect(result).toBe("/tmp/downloads/passwd");
    expect(result).not.toContain("..");
  });
});

describe("ArticleService", () => {
  test("detects DOI-like queries by upstream-compatible prefix", () => {
    expect(isDoiQuery("10.1038/nature12345")).toBe(true);
    expect(isDoiQuery("machine learning")).toBe(false);
  });

  test("searches article keywords", async () => {
    const fetchMock: FetchLike = async (input) => {
      expect(String(input)).toBe("https://annas-archive.li/search?q=machine+learning&content=journal");
      return response(searchHtml);
    };

    const service = new ArticleService(config, fetchMock);
    const results = await service.searchArticles("machine learning");

    expect(results).toHaveLength(1);
    expect(results[0]?.hash).toBe("abc123def456");
  });

  test("looks up DOI and resolves non-writing download metadata", async () => {
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("/scidb/10.1038%2Fnature12345")) {
        return response(searchHtml);
      }
      if (url.includes("/md5/abc123def456")) {
        return response(detailHtml);
      }
      if (url.includes("/dyn/api/fast_download.json")) {
        return Response.json({ download_url: "https://download.example/paper.pdf" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const service = new ArticleService(config, fetchMock);
    const resolution = await service.resolveArticleDownload("10.1038/nature12345");

    expect(resolution.article).toMatchObject({
      doi: "10.1038/nature12345",
      hash: "abc123def456",
      title: "Interesting Paper",
      downloadUrl: "https://annas-archive.li/scidb?doi=10.1038%2Fnature12345",
    });
    expect(resolution.sources).toEqual([
      {
        type: "fast_download",
        url: "https://download.example/paper.pdf",
      },
      {
        type: "scidb",
        url: "https://annas-archive.li/scidb?doi=10.1038%2Fnature12345",
      },
    ]);
  });
});
