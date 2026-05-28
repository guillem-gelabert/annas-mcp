import { describe, expect, test } from "bun:test";

import {
  ConfigError,
  loadConfig,
  normalizeBaseUrl,
  redactSecret,
} from "../src/config";

describe("normalizeBaseUrl", () => {
  test("returns empty string when no value provided", () => {
    expect(normalizeBaseUrl(undefined)).toBe("");
    expect(normalizeBaseUrl("")).toBe("");
  });

  test("removes protocol and trailing slashes", () => {
    expect(normalizeBaseUrl("https://annas-archive.li/")).toBe("annas-archive.li");
    expect(normalizeBaseUrl("http://annas-archive.pm///")).toBe("annas-archive.pm");
  });
});

describe("loadConfig", () => {
  test("loads secret key with empty base URL when not configured", () => {
    const config = loadConfig({ ANNAS_SECRET_KEY: "feedfacecafebeef" });

    expect(config).toEqual({
      secretKey: "feedfacecafebeef",
      baseUrl: "",
      manualBaseUrl: false,
      downloadPath: null,
    });
  });

  test("loads custom base URL", () => {
    const config = loadConfig({
      ANNAS_SECRET_KEY: "feedfacecafebeef",
      ANNAS_BASE_URL: "https://annas-archive.pm/",
    });

    expect(config.baseUrl).toBe("annas-archive.pm");
    expect(config.manualBaseUrl).toBe(true);
  });

  test("does not require ANNAS_DOWNLOAD_PATH", () => {
    expect(() => loadConfig({ ANNAS_SECRET_KEY: "feedfacecafebeef" })).not.toThrow();
  });

  test("validates absolute path for ANNAS_DOWNLOAD_PATH", () => {
    expect(() => loadConfig({
      ANNAS_SECRET_KEY: "feedfacecafebeef",
      ANNAS_DOWNLOAD_PATH: "relative/path",
    })).toThrow(ConfigError);

    const config = loadConfig({
      ANNAS_SECRET_KEY: "feedfacecafebeef",
      ANNAS_DOWNLOAD_PATH: "/absolute/path",
    });
    expect(config.downloadPath).toBe("/absolute/path");
  });

  test("throws when secret key is missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });
});

describe("redactSecret", () => {
  test("redacts short values fully", () => {
    expect(redactSecret("abc123")).toBe("[redacted]");
  });

  test("keeps only low-risk prefix and suffix for longer values", () => {
    expect(redactSecret("feedfacecafebeef")).toBe("feed...[redacted]...beef");
  });
});
