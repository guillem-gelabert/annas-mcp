import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { checkDownloadCache, recordDownloadCache } from "../src/anna/file-utils";

describe("checkDownloadCache", () => {
  test("returns null when .annas-cache.json does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      expect(checkDownloadCache(root, { hash: "abc" })).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns null when key absent from index", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      writeFileSync(join(root, ".annas-cache.json"), JSON.stringify({ "md5:other": "/root/other.epub" }));
      expect(checkDownloadCache(root, { hash: "abc" })).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns null when index entry path does not exist on disk (stale entry)", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      writeFileSync(join(root, ".annas-cache.json"), JSON.stringify({ "md5:abc": "/nonexistent/file.epub" }));
      expect(checkDownloadCache(root, { hash: "abc" })).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns the stored absolute path when entry exists and file is present on disk", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      const filePath = join(root, "book.epub");
      writeFileSync(filePath, "dummy");
      writeFileSync(join(root, ".annas-cache.json"), JSON.stringify({ "md5:abc": filePath }));
      expect(checkDownloadCache(root, { hash: "abc" })).toBe(filePath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns path for a DOI key", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      const filePath = join(root, "paper.pdf");
      writeFileSync(filePath, "dummy");
      writeFileSync(join(root, ".annas-cache.json"), JSON.stringify({ "doi:10.1000/xyz": filePath }));
      expect(checkDownloadCache(root, { doi: "10.1000/xyz" })).toBe(filePath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns null when CacheKey has neither hash nor doi", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      expect(checkDownloadCache(root, {})).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns null when cache entry path escapes downloadRoot even if the file exists on disk", () => {
    // Create two separate temp dirs: root (the configured download root) and
    // outsideDir (simulates an attacker-controlled or manually edited cache).
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    const outsideDir = mkdtempSync(join(tmpdir(), "annas-outside-test-"));
    try {
      const outsideFile = join(outsideDir, "secret.epub");
      writeFileSync(outsideFile, "sensitive data");
      writeFileSync(
        join(root, ".annas-cache.json"),
        JSON.stringify({ "md5:abc": outsideFile }),
      );
      // The file exists on disk but is outside downloadRoot — must return null.
      expect(checkDownloadCache(root, { hash: "abc" })).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

describe("recordDownloadCache", () => {
  test("creates .annas-cache.json with key 'md5:<hash>'", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      const filePath = join(root, "book.epub");
      recordDownloadCache(root, { hash: "abc" }, filePath);
      const index = JSON.parse(require("node:fs").readFileSync(join(root, ".annas-cache.json"), "utf-8"));
      expect(index["md5:abc"]).toBe(filePath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("creates .annas-cache.json with key 'doi:<doi>'", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      const filePath = join(root, "paper.pdf");
      recordDownloadCache(root, { doi: "10.1000/xyz" }, filePath);
      const index = JSON.parse(require("node:fs").readFileSync(join(root, ".annas-cache.json"), "utf-8"));
      expect(index["doi:10.1000/xyz"]).toBe(filePath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("merges into existing .annas-cache.json without overwriting other keys", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      writeFileSync(join(root, ".annas-cache.json"), JSON.stringify({ "md5:existing": "/root/old.epub" }));
      const filePath = join(root, "new.epub");
      recordDownloadCache(root, { hash: "newkey" }, filePath);
      const index = JSON.parse(require("node:fs").readFileSync(join(root, ".annas-cache.json"), "utf-8"));
      expect(index["md5:existing"]).toBe("/root/old.epub");
      expect(index["md5:newkey"]).toBe(filePath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("is a no-op when called with an empty key (both hash and doi undefined)", () => {
    const root = mkdtempSync(join(tmpdir(), "annas-cache-test-"));
    try {
      recordDownloadCache(root, {}, "/root/file.epub");
      const exists = require("node:fs").existsSync(join(root, ".annas-cache.json"));
      expect(exists).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
