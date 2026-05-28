/**
 * DNS SSRF guard test for validateDownloadUrl.
 *
 * Uses a directly-injected DNS lookup stub instead of mock.module so this
 * test does not affect the DNS behaviour seen by other test files.
 */
import { describe, expect, test } from "bun:test";
import { validateDownloadUrl } from "../src/anna/file-utils";

describe("validateDownloadUrl DNS SSRF guard", () => {
  test("rejects hostname that resolves to a private IP via DNS lookup", async () => {
    const stubLookup = async (_host: string) => ({ address: "10.0.0.1", family: 4 });

    await expect(
      validateDownloadUrl("https://evil.example.com/file.pdf", stubLookup),
    ).rejects.toThrow("private/loopback");
  });
});
