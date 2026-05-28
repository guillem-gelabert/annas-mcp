import { describe, expect, test } from "bun:test";

import { BaseUrlManager } from "../src/anna/base-url-manager";
import { handleUpdateBaseUrl } from "../src/tools/base-url-tools";
import type { AnnasConfig } from "../src/config";

const config: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: true,
  downloadPath: null,
};

describe("update_base_url tool", () => {
  test("returns structured discovery and manual override note", async () => {
    const manager = {
      async readCache() { return null; },
      async updateBaseUrl() {
        return {
          selectedBaseUrl: "annas-archive.li",
          checkedAt: "2026-05-19T12:00:00Z",
          source: "Anna's Archive",
          selector: "wikitext-url-regex",
          revisionEvidence: {
            thresholdIso: "2026-05-18T12:00:00Z",
            revisionsScanned: 25,
            usedContinuation: false,
          },
          candidates: [],
        };
      },
    } as unknown as BaseUrlManager;

    const result = await handleUpdateBaseUrl({}, { config, baseUrlManager: manager });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      selectedBaseUrl: "annas-archive.li",
      mode: "manual_override",
    });
  });

  test("surfaces cache read errors as cacheWarning in output", async () => {
    const parseError = new SyntaxError("Unexpected token");
    (parseError as NodeJS.ErrnoException).code = "EPARSE";
    const manager = {
      async readCache() { throw parseError; },
      async updateBaseUrl() {
        return {
          selectedBaseUrl: "annas-archive.li",
          checkedAt: "2026-05-19T12:00:00Z",
          source: "Anna's Archive",
          selector: "wikitext-url-regex",
          revisionEvidence: { thresholdIso: "2026-05-18T12:00:00Z", revisionsScanned: 25, usedContinuation: false },
          candidates: [],
        };
      },
    } as unknown as BaseUrlManager;

    const result = await handleUpdateBaseUrl({}, { config, baseUrlManager: manager });
    expect(result.isError).toBeUndefined();
    expect((result.structuredContent as any).cacheWarning).toContain("Cache read failed");
  });
});
