import { describe, expect, test } from "bun:test";

import {
  handleArticleDownload,
  handleArticleSearch,
  articleDownloadInputSchema,
} from "../src/tools/article-tools";
import type { FetchLike } from "../src/anna/types";
import type { AnnasConfig } from "../src/config";

const config: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: true,
  downloadPath: null,
};

const searchHtml = `
<div>
  <a class="custom-a block mr-2 sm:mr-4 hover:opacity-80" href="/md5/abc123def456">cover</a>
  <div class="max-w-full">
    <a href="/md5/abc123def456">Interesting Paper</a>
    <a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Ada Lovelace</a>
    <a href="/search?q=journal"><span class="icon-[mdi--company]"></span>Journal of Tests</a>
    <div class="text-gray-800">English [en] · PDF · 2.4MB · 2025</div>
  </div>
</div>
`;

const detailHtml = `
<title>Interesting Paper - Anna's Archive</title>
<meta name="description" content="Ada Lovelace

Test Publisher

Journal of Tests, vol 1, 2025">
<a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Ada Lovelace</a>
<div class="text-gray-500">PDF · 2.4MB</div>
`;

function buildArticleSearchHtml(count: number): string {
  return Array.from({ length: count }, (_, index) => {
    const i = index + 1;
    const hash = `hash${String(i).padStart(2, "0")}abc`;
    return `
<div>
  <a class="custom-a block mr-2 sm:mr-4 hover:opacity-80" href="/md5/${hash}">cover</a>
  <div class="max-w-full">
    <a href="/md5/${hash}">Interesting Paper ${i}</a>
    <a href="/search?q=author"><span class="icon-[mdi--user-edit]"></span>Ada Lovelace</a>
    <a href="/search?q=journal"><span class="icon-[mdi--company]"></span>Journal of Tests</a>
    <div class="text-gray-800">English [en] · PDF · 2.${i}MB · 2025</div>
  </div>
</div>
`;
  }).join("\n");
}

function response(body: string): Response {
  return new Response(body, { status: 200 });
}

function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
  const item = result.content[0];
  expect(item?.type).toBe("text");
  return item?.text ?? "";
}

describe("article MCP handlers", () => {
  test("article_search returns structured results", async () => {
    const fetchMock: FetchLike = async () => response(searchHtml);

    const result = await handleArticleSearch({ query: "machine learning" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      query: "machine learning",
      results: [
        {
          title: "Interesting Paper",
          authors: "Ada Lovelace",
          journal: "Journal of Tests",
          size: "2.4MB",
          hash: "abc123def456",
          pageUrl: "https://annas-archive.li/md5/abc123def456",
        },
      ],
    });
  });

  test("article_search returns clear no-results response", async () => {
    const fetchMock: FetchLike = async () => response("<html></html>");

    const result = await handleArticleSearch({ query: "missing" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    expect(firstText(result)).toContain("No articles found");
    expect(result.structuredContent).toEqual({ query: "missing", results: [] });
  });

  test("article_search defaults to limit=10", async () => {
    const fetchMock: FetchLike = async () => response(buildArticleSearchHtml(12));

    const result = await handleArticleSearch({ query: "many results" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { query: string; results: Array<{ title?: string }> };
    expect(sc.query).toBe("many results");
    expect(sc.results).toHaveLength(10);
    expect(sc.results[0]?.title).toBe("Interesting Paper 1");
    expect(sc.results[9]?.title).toBe("Interesting Paper 10");
    expect(firstText(result)).toContain("returning first 10");
  });

  test("article_search respects explicit limit override", async () => {
    const fetchMock: FetchLike = async () => response(buildArticleSearchHtml(12));

    const result = await handleArticleSearch({ query: "many results", limit: 3 }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { query: string; results: Array<{ title?: string }> };
    expect(sc.query).toBe("many results");
    expect(sc.results).toHaveLength(3);
    expect(sc.results[2]?.title).toBe("Interesting Paper 3");
    expect(firstText(result)).toContain("returning first 3");
  });

  test("article_download returns structured download resolution", async () => {
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

    const result = await handleArticleDownload(
      { doi: "10.1038/nature12345" },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      article: {
        doi: "10.1038/nature12345",
        hash: "abc123def456",
        title: "Interesting Paper",
      },
      sources: [
        {
          type: "fast_download",
          url: "https://download.example/paper.pdf",
        },
        {
          type: "scidb",
          url: "https://annas-archive.li/scidb?doi=10.1038%2Fnature12345",
        },
      ],
    });
    expect(result.structuredContent).not.toHaveProperty("verification");
  });

  test("article_download includes verification when verbose=true", async () => {
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
      if (url.includes("api.crossref.org/works/")) {
        return Response.json({ message: { title: ["Interesting Paper"] } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await handleArticleDownload(
      { doi: "10.1038/nature12345", verbose: true },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      verification: {
        crossrefTitle: "Interesting Paper",
        annasTitle: "Interesting Paper",
        confidence: "high",
      },
    });
  });

  test("article_download resolves DOI with dots and slashes (10.1016/j.aju.2012.11.001)", async () => {
    const doi = "10.1016/j.aju.2012.11.001";
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes(`/scidb/${encodeURIComponent(doi)}`)) {
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

    const result = await handleArticleDownload({ doi }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      article: {
        doi,
        hash: "abc123def456",
        title: "Interesting Paper",
      },
      sources: [
        {
          type: "fast_download",
          url: "https://download.example/paper.pdf",
        },
        {
          type: "scidb",
          url: "https://annas-archive.li/scidb?doi=10.1016%2Fj.aju.2012.11.001",
        },
      ],
    });
  });

  test("tool failures return MCP errors", async () => {
    const fetchMock: FetchLike = async () => new Response("no", { status: 500, statusText: "Server Error" });

    const result = await handleArticleSearch({ query: "machine learning" }, { config, fetchImpl: fetchMock });

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("request failed");
  });

  describe("article_download schema validation", () => {
    test("single doi passes schema validation", () => {
      const result = articleDownloadInputSchema.safeParse({ doi: "10.1038/nature12345" });
      expect(result.success).toBe(true);
    });

    test("multi doi passes schema validation", () => {
      const result = articleDownloadInputSchema.safeParse({
        dois: ["10.1038/nature12345", "10.1016/j.aju.2012.11.001"],
      });
      expect(result.success).toBe(true);
    });

    test("legacy file download fields are not part of the MCP input", () => {
      const result = articleDownloadInputSchema.safeParse({
        doi: "10.1038/nature12345",
        download: true,
        downloadPath: "/tmp/annas-downloads",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ doi: "10.1038/nature12345" });
      }
    });

    test("doi and dois both provided fails validation", () => {
      const result = articleDownloadInputSchema.safeParse({
        doi: "10.1038/nature12345",
        dois: ["10.1016/j.aju.2012.11.001"],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Provide either doi (single) or dois (array), not both");
      }
    });

    test("empty dois array fails validation", () => {
      const result = articleDownloadInputSchema.safeParse({ dois: [] });
      expect(result.success).toBe(false);
    });

    test("invalid doi string in dois array fails validation", () => {
      const result = articleDownloadInputSchema.safeParse({ dois: ["not-a-doi"] });
      expect(result.success).toBe(false);
    });

    test("neither doi nor dois fails validation", () => {
      const result = articleDownloadInputSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Provide either doi (single) or dois (array)");
      }
    });

  });
});

describe("article_download batch execution", () => {
  const doi1 = "10.1038/nature12345";
  const doi2 = "10.1016/j.aju.2012.11.001";

  test("batch dois parallel - concurrent lookups run in parallel (BATCH-01)", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;

    const fetchMock: FetchLike = async (input) => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await Promise.resolve();
      inFlight--;
      const url = String(input);
      if (url.includes("/scidb/")) return response(searchHtml);
      if (url.includes("/md5/")) return response(detailHtml);
      if (url.includes("/dyn/api/fast_download.json")) {
        return Response.json({ download_url: "https://download.example/paper.pdf" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await handleArticleDownload(
      { dois: [doi1, doi2] },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    expect(maxConcurrent).toBeGreaterThan(1);
    const sc = result.structuredContent as { results: unknown[] };
    expect(sc.results).toHaveLength(2);
  });

  test("batch dois parallel - one lookup failure does not suppress other results (BATCH-03)", async () => {
    const failingDoi = "10.9999/failing-doi";
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(failingDoi))) {
        throw new Error(`No article found for DOI: ${failingDoi}`);
      }
      if (url.includes("/scidb/")) return response(searchHtml);
      if (url.includes("/md5/")) return response(detailHtml);
      if (url.includes("/dyn/api/fast_download.json")) {
        return Response.json({ download_url: "https://download.example/paper.pdf" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await handleArticleDownload(
      { dois: [failingDoi, doi1, doi2] },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { results: Record<string, unknown>[] };
    expect(sc.results).toHaveLength(3);

    // Failed item: only doi and error — no article or sources
    expect(sc.results[0]).toEqual({ doi: failingDoi, error: expect.any(String) });
    expect(sc.results[0]).not.toHaveProperty("article");
    expect(sc.results[0]).not.toHaveProperty("sources");

    // Successful items: have article and sources — no error
    expect(sc.results[1]).toMatchObject({ doi: doi1, article: expect.any(Object), sources: expect.any(Array) });
    expect(sc.results[1]).not.toHaveProperty("error");
    expect(sc.results[2]).toMatchObject({ doi: doi2, article: expect.any(Object), sources: expect.any(Array) });
    expect(sc.results[2]).not.toHaveProperty("error");
  });

});

describe("article_download base URL circuit breakers", () => {
  const doi1 = "10.1038/nature12345";
  const doi2 = "10.1016/j.aju.2012.11.001";

  const searchHtml1 = searchHtml.replace(/Interesting Paper/g, "CB Paper One").replace(/abc123def456/g, "hashcb111aaa");
  const detailHtml1 = detailHtml.replace(/Interesting Paper/g, "CB Paper One");

  // Mock BaseUrlManager: resolveBaseUrl returns current value; updateBaseUrl increments counter and switches URL
  function makeMockBaseUrlManager(initialUrl: string, afterUpdateUrl: string) {
    let currentUrl = initialUrl;
    let updateCallCount = 0;
    const manager = {
      resolveBaseUrl: async () => currentUrl,
      updateBaseUrl: async () => {
        updateCallCount++;
        currentUrl = afterUpdateUrl;
      },
      getUpdateCallCount: () => updateCallCount,
    };
    return manager;
  }

  test("base URL CB — updateBaseUrl called exactly once for concurrent DOI failures (CB-01)", async () => {
    const mockManager = makeMockBaseUrlManager("bad-mirror.li", "good-mirror.org");

    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      // All requests to bad mirror throw ECONNREFUSED
      if (url.includes("bad-mirror.li")) {
        throw new Error("ECONNREFUSED bad-mirror.li:443");
      }
      // Requests to good mirror succeed
      if (url.includes("good-mirror.org")) {
        if (url.includes("/scidb/")) return response(searchHtml1);
        if (url.includes("/md5/hashcb111aaa") || url.includes("/md5/hashcb222bbb")) return response(detailHtml1);
        if (url.includes("/dyn/api/fast_download.json")) {
          return Response.json({ download_url: "https://download.example/paper.pdf" });
        }
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    // CB-01 exercises automatic rediscovery, which only runs when manualBaseUrl is false.
    const autoConfig: AnnasConfig = { ...config, manualBaseUrl: false };
    const result = await handleArticleDownload(
      { dois: [doi1, doi2] },
      { config: autoConfig, fetchImpl: fetchMock, baseUrlManager: mockManager as any },
    );

    expect(result.isError).toBeUndefined();
    // CB-01: exactly one re-discovery, not two
    expect(mockManager.getUpdateCallCount()).toBe(1);
    // Both DOIs resolved after re-discovery
    const sc = result.structuredContent as { results: Record<string, unknown>[] };
    expect(sc.results).toHaveLength(2);
    expect(sc.results[0]).toMatchObject({ doi: doi1, article: expect.any(Object) });
    expect(sc.results[1]).toMatchObject({ doi: doi2, article: expect.any(Object) });
  });

  test("base URL CB — remaining DOIs use new mirror after successful re-discovery (CB-02)", async () => {
    let resolveCallCount = 0;
    const manager = {
      resolveBaseUrl: async () => {
        resolveCallCount++;
        // First call (initial): bad mirror. Subsequent call (after updateBaseUrl): good mirror.
        return resolveCallCount === 1 ? "bad-mirror.li" : "good-mirror.org";
      },
      updateBaseUrl: async () => {
        // no-op: resolveBaseUrl handles the state transition via call count
      },
    };

    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("bad-mirror.li")) {
        throw new Error("ECONNREFUSED bad-mirror.li:443");
      }
      if (url.includes("good-mirror.org")) {
        if (url.includes("/scidb/")) return response(searchHtml1);
        if (url.includes("/md5/hashcb111aaa")) return response(detailHtml1);
        if (url.includes("/dyn/api/fast_download.json")) {
          return Response.json({ download_url: "https://download.example/paper.pdf" });
        }
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    // CB-02 exercises automatic rediscovery, which only runs when manualBaseUrl is false.
    const autoConfig: AnnasConfig = { ...config, manualBaseUrl: false };
    const result = await handleArticleDownload(
      { dois: [doi1] },
      { config: autoConfig, fetchImpl: fetchMock, baseUrlManager: manager as any },
    );

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { results: Record<string, unknown>[] };
    expect(sc.results).toHaveLength(1);
    // CB-02: result has article data — confirmed the new mirror URL was used
    expect(sc.results[0]).toMatchObject({
      doi: doi1,
      article: expect.objectContaining({ doi: doi1 }),
      sources: expect.any(Array),
    });
    expect(sc.results[0]).not.toHaveProperty("error");
  });

  test("base URL CB — all DOIs fast-fail with clear error when re-discovery fails (CB-03)", async () => {
    const manager = {
      resolveBaseUrl: async () => "bad-mirror.li",
      updateBaseUrl: async () => {
        throw new Error("Wikipedia unavailable");
      },
    };

    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("bad-mirror.li")) {
        throw new Error("ECONNREFUSED bad-mirror.li:443");
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    // CB-03 exercises automatic rediscovery failure, which requires manualBaseUrl: false.
    const autoConfig: AnnasConfig = { ...config, manualBaseUrl: false };
    const result = await handleArticleDownload(
      { dois: [doi1, doi2] },
      { config: autoConfig, fetchImpl: fetchMock, baseUrlManager: manager as any },
    );

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { results: Record<string, unknown>[] };
    expect(sc.results).toHaveLength(2);
    // CB-03: both DOIs have error fields; neither has an article
    expect(sc.results[0]).toHaveProperty("error");
    expect(sc.results[1]).toHaveProperty("error");
    expect(sc.results[0]).not.toHaveProperty("article");
    expect(sc.results[1]).not.toHaveProperty("article");
    // Error message must reference re-discovery failure
    const err0 = String(sc.results[0].error).toLowerCase();
    const err1 = String(sc.results[1].error).toLowerCase();
    expect(err0.includes("re-discovery") || err0.includes("mirror") || err0.includes("wikipedia")).toBe(true);
    expect(err1.includes("re-discovery") || err1.includes("mirror") || err1.includes("wikipedia")).toBe(true);
  });

  test("base URL CB — manual ANNAS_BASE_URL is honored in batch (no silent rediscovery)", async () => {
    let updateBaseUrlCalled = false;
    const manager = {
      resolveBaseUrl: async () => "manual-mirror.li",
      updateBaseUrl: async () => {
        updateBaseUrlCalled = true;
      },
    };

    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("manual-mirror.li")) {
        throw new Error("ECONNREFUSED manual-mirror.li:443");
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    // config already has manualBaseUrl: true at module scope
    const result = await handleArticleDownload(
      { dois: [doi1, doi2] },
      { config, fetchImpl: fetchMock, baseUrlManager: manager as any },
    );

    expect(result.isError).toBeUndefined();
    // Manual override contract: never silently rediscover when manualBaseUrl is set
    expect(updateBaseUrlCalled).toBe(false);

    const sc = result.structuredContent as { results: Record<string, unknown>[] };
    expect(sc.results).toHaveLength(2);
    // Each per-item error should be the canonical guidance message
    for (const r of sc.results) {
      expect(r).toHaveProperty("error");
      expect(String(r.error)).toContain("Configured ANNAS_BASE_URL appears offline");
      expect(r).not.toHaveProperty("article");
    }
  });

  test("single doi path is unaffected by circuit breaker changes (CB-07)", async () => {
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("/scidb/")) return response(searchHtml);
      if (url.includes("/md5/abc123def456")) return response(detailHtml);
      if (url.includes("/dyn/api/fast_download.json")) {
        return Response.json({ download_url: "https://download.example/paper.pdf" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await handleArticleDownload(
      { doi: doi1, verbose: true },
      { config, fetchImpl: fetchMock },
    );

    // CB-07: single-DOI path is structurally identical to pre-Phase-13 behavior
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      article: {
        doi: doi1,
        hash: "abc123def456",
        title: "Interesting Paper",
      },
      sources: expect.arrayContaining([
        expect.objectContaining({ type: "fast_download", url: "https://download.example/paper.pdf" }),
        expect.objectContaining({ type: "scidb" }),
      ]),
    });
    // No batch-specific properties
    expect(result.structuredContent).not.toHaveProperty("results");
  });
});

describe("article_download verification (VER-07/08/09/10/11)", () => {
  const doi1 = "10.1038/nature12345";
  const doi2 = "10.1016/j.aju.2012.11.001";
  const failingDoi = "10.9999/failing-doi";

  // Anna's Archive mock responder: routes scidb, md5, and fast_download URLs
  function annasArchiveMock(input: string | URL): Response {
    const url = String(input);
    if (url.includes("/scidb/")) return response(searchHtml);
    if (url.includes("/md5/abc123def456")) return response(detailHtml);
    if (url.includes("/dyn/api/fast_download.json")) {
      return Response.json({ download_url: "https://download.example/paper.pdf" });
    }
    throw new Error(`Unexpected Anna's Archive URL: ${url}`);
  }

  test("single-DOI — verification present with crossrefTitle, annasTitle, confidence (VER-07)", async () => {
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("api.crossref.org")) {
        return Response.json({ message: { title: ["Interesting Paper"] } });
      }
      return annasArchiveMock(input);
    };

    const result = await handleArticleDownload(
      { doi: doi1, verbose: true },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc).toHaveProperty("verification");
    expect(sc.verification).toEqual({
      crossrefTitle: "Interesting Paper",
      annasTitle: "Interesting Paper",
      confidence: "high",
    });
  });

  test("single-DOI — CrossRef failure degrades to unverified, does not hard-fail (VER-09)", async () => {
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("api.crossref.org")) {
        throw new Error("network failure");
      }
      return annasArchiveMock(input);
    };

    const result = await handleArticleDownload(
      { doi: doi1, verbose: true },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc).toHaveProperty("verification");
    expect(sc.verification).toEqual({
      crossrefTitle: null,
      annasTitle: "Interesting Paper",
      confidence: "unverified",
    });
  });

  test("batch — each successful item has verification field (VER-08)", async () => {
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("api.crossref.org")) {
        return Response.json({ message: { title: ["Interesting Paper"] } });
      }
      return annasArchiveMock(input);
    };

    const result = await handleArticleDownload(
      { dois: [doi1, doi2], verbose: true },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { results: Record<string, unknown>[] };
    expect(sc.results).toHaveLength(2);
    for (const item of sc.results) {
      expect(item).toHaveProperty("verification");
      const v = item.verification as Record<string, unknown>;
      expect(v).toHaveProperty("crossrefTitle");
      expect(v).toHaveProperty("annasTitle");
      expect(v).toHaveProperty("confidence");
    }
  });

  test("batch — failed items omit verification; successful items have it (VER-10)", async () => {
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes(encodeURIComponent(failingDoi))) {
        throw new Error(`No article found for DOI: ${failingDoi}`);
      }
      if (url.includes("api.crossref.org")) {
        return Response.json({ message: { title: ["Interesting Paper"] } });
      }
      return annasArchiveMock(input);
    };

    const result = await handleArticleDownload(
      { dois: [failingDoi, doi1], verbose: true },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { results: Record<string, unknown>[] };
    expect(sc.results).toHaveLength(2);

    // Failed item must NOT have verification
    expect(sc.results[0]).toHaveProperty("error");
    expect(sc.results[0]).not.toHaveProperty("verification");

    // Successful item must have verification
    expect(sc.results[1]).toHaveProperty("verification");
  });

  test("single-DOI — CrossRef null title (empty array) produces unverified (VER-09)", async () => {
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("api.crossref.org")) {
        return Response.json({ message: { title: [] } });
      }
      return annasArchiveMock(input);
    };

    const result = await handleArticleDownload(
      { doi: doi1, verbose: true },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc).toHaveProperty("verification");
    const v = sc.verification as Record<string, unknown>;
    expect(v.confidence).toBe("unverified");
    expect(v.crossrefTitle).toBeNull();
  });

  test("batch compact mode omits verification when verbose=false", async () => {
    const fetchMock: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("/scidb/")) return response(searchHtml);
      if (url.includes("/md5/")) return response(detailHtml);
      if (url.includes("/dyn/api/fast_download.json")) {
        return Response.json({ download_url: "https://download.example/paper.pdf" });
      }
      if (url.includes("api.crossref.org")) {
        return Response.json({ message: { title: ["Interesting Paper"] } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await handleArticleDownload(
      { dois: [doi1, doi2], verbose: false },
      { config, fetchImpl: fetchMock },
    );

    expect(result.isError).toBeUndefined();
    expect(firstText(result)).toContain("compact mode");
    const sc = result.structuredContent as { results: Record<string, unknown>[] };
    expect(sc.results).toHaveLength(2);
    expect(sc.results[0]).not.toHaveProperty("verification");
    expect(sc.results[1]).not.toHaveProperty("verification");
    expect(sc.results[0]).toHaveProperty("article");
    expect(sc.results[0]).toHaveProperty("sources");
  });
});
