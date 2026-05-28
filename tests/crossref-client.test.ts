import { describe, expect, test } from "bun:test";

import { fetchCrossRefTitle } from "../src/anna/crossref-client";
import type { FetchLike } from "../src/anna/types";

describe("fetchCrossRefTitle", () => {
  test("returns title string on HTTP 200 with title array", async () => {
    const body = { status: "ok", message: { title: ["Some Title"] } };
    const fetchMock: FetchLike = async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await fetchCrossRefTitle("10.1038/nature12345", fetchMock);
    expect(result).toBe("Some Title");
  });

  test("returns null on HTTP 404", async () => {
    const fetchMock: FetchLike = async () =>
      new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });

    const result = await fetchCrossRefTitle("10.1038/bad-doi", fetchMock);
    expect(result).toBeNull();
  });

  test("returns null when fetchImpl throws a network error", async () => {
    const fetchMock: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };

    const result = await fetchCrossRefTitle("10.1038/nature12345", fetchMock);
    expect(result).toBeNull();
  });

  test("returns null when fetchImpl throws a TimeoutError DOMException", async () => {
    const fetchMock: FetchLike = async () => {
      throw new DOMException("timeout", "TimeoutError");
    };

    const result = await fetchCrossRefTitle("10.1038/nature12345", fetchMock);
    expect(result).toBeNull();
  });

  test("returns null when message has no title field", async () => {
    const body = { status: "ok", message: {} };
    const fetchMock: FetchLike = async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await fetchCrossRefTitle("10.1038/nature12345", fetchMock);
    expect(result).toBeNull();
  });

  test("returns null when title array is empty", async () => {
    const body = { status: "ok", message: { title: [] } };
    const fetchMock: FetchLike = async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await fetchCrossRefTitle("10.1038/nature12345", fetchMock);
    expect(result).toBeNull();
  });

  test("sends correct User-Agent header", async () => {
    let capturedInit: RequestInit | undefined;
    const body = { status: "ok", message: { title: ["Header Test Title"] } };
    const fetchMock: FetchLike = async (_url, init) => {
      capturedInit = init;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await fetchCrossRefTitle("10.1038/nature12345", fetchMock);
    expect((capturedInit?.headers as Record<string, string>)?.["User-Agent"]).toBe(
      "annas-mcp-ts/1.4 (mailto:noreply@example.com)"
    );
  });
});
