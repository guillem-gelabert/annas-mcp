import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { BaseUrlManager } from "../src/anna/base-url-manager";
import type { FetchLike } from "../src/anna/types";
import type { AnnasConfig } from "../src/config";

const autoConfig: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: false,
  downloadPath: null,
};

describe("BaseUrlManager", () => {
  test("returns manual base URL when override is set", async () => {
    const manualConfig: AnnasConfig = {
      ...autoConfig,
      baseUrl: "annas-archive.pm",
      manualBaseUrl: true,
    };
    const fetchMock: FetchLike = async () => {
      throw new Error("should not fetch when manual override is enabled");
    };
    const manager = new BaseUrlManager(manualConfig, fetchMock);
    await expect(manager.resolveBaseUrl()).resolves.toBe("annas-archive.pm");
  });

  test("trusts host present in latest revision and in a revision older than 7 days", async () => {
    const cachePath = path.join(mkdtempSync(path.join(tmpdir(), "annas-mcp-")), "cache.json");
    const now = new Date("2026-05-19T12:00:00.000Z");
    let callCount = 0;
    const fetchMock: FetchLike = async () => {
      callCount += 1;
      return Response.json({
        query: {
          pages: {
            "42": {
              revisions: [
                {
                  timestamp: "2026-05-19T11:00:00Z",
                  slots: { main: { content: "latest https://annas-archive.li https://annas-archive.gs" } },
                },
                {
                  // ~9 days old — older than the 7-day threshold
                  timestamp: "2026-05-10T09:00:00Z",
                  slots: { main: { content: "older https://annas-archive.li" } },
                },
              ],
            },
          },
        },
      });
    };

    const manager = new BaseUrlManager(autoConfig, fetchMock, cachePath, () => now);
    const record = await manager.updateBaseUrl();

    expect(callCount).toBe(1);
    expect(record.selectedBaseUrl).toBe("annas-archive.li");
    expect(record.candidates).toEqual([
      {
        host: "annas-archive.gs",
        latestRevisionSeen: true,
        seenBeforeThreshold: false,
        trusted: false,
        skippedReason: "not_seen_older_than_7d_or_unproven",
      },
      {
        host: "annas-archive.li",
        latestRevisionSeen: true,
        seenBeforeThreshold: true,
        trusted: true,
      },
    ]);
  });

  test("rejects host that has not been online for 7 full days", async () => {
    const cachePath = path.join(mkdtempSync(path.join(tmpdir(), "annas-mcp-")), "cache.json");
    const now = new Date("2026-05-19T12:00:00.000Z");
    const fetchMock: FetchLike = async () => {
      return Response.json({
        query: {
          pages: {
            "42": {
              revisions: [
                {
                  timestamp: "2026-05-19T11:00:00Z",
                  slots: { main: { content: "latest https://annas-archive.new" } },
                },
                {
                  // Only ~2 days old — fails the 7-day minimum
                  timestamp: "2026-05-17T11:00:00Z",
                  slots: { main: { content: "https://annas-archive.new" } },
                },
              ],
            },
          },
        },
      });
    };

    const manager = new BaseUrlManager(autoConfig, fetchMock, cachePath, () => now);
    const record = await manager.updateBaseUrl();

    expect(record.selectedBaseUrl).toBeNull();
    expect(record.candidates).toEqual([
      {
        host: "annas-archive.new",
        latestRevisionSeen: true,
        seenBeforeThreshold: false,
        trusted: false,
        skippedReason: "not_seen_older_than_7d_or_unproven",
      },
    ]);
  });

  test("uses cached selectedBaseUrl without refetching when present", async () => {
    const cachePath = path.join(mkdtempSync(path.join(tmpdir(), "annas-mcp-")), "cache.json");
    writeFileSync(
      cachePath,
      JSON.stringify({
        selectedBaseUrl: "annas-archive.li",
        checkedAt: "2026-05-19T00:00:00Z",
        source: "Anna's Archive",
        selector: "n/a",
        revisionEvidence: { thresholdIso: "2026-05-12T00:00:00Z", revisionsScanned: 1, usedContinuation: false },
        candidates: [],
      }),
    );
    let fetchCalls = 0;
    const fetchMock: FetchLike = async () => {
      fetchCalls += 1;
      throw new Error("should not fetch when cache is valid");
    };

    const manager = new BaseUrlManager(autoConfig, fetchMock, cachePath, () => new Date("2026-05-19T12:00:00Z"));
    const resolved = await manager.resolveBaseUrl();

    expect(fetchCalls).toBe(0);
    expect(resolved).toBe("annas-archive.li");
  });
});
