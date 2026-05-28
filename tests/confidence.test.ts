import { describe, expect, test } from "bun:test";

import { computeConfidence } from "../src/anna/confidence";

describe("computeConfidence", () => {
  test("returns 'unverified' when crossrefTitle is null", () => {
    expect(computeConfidence("Any Title", null)).toBe("unverified");
  });

  test("returns 'high' for identical titles", () => {
    expect(computeConfidence("A Study of X", "A Study of X")).toBe("high");
  });

  test("returns 'high' for case-insensitive match with >= 0.5 Jaccard", () => {
    expect(computeConfidence("study of neural networks", "A Study of Neural Networks")).toBe("high");
  });

  test("returns 'low' for mostly different words (< 0.5 Jaccard)", () => {
    expect(computeConfidence("quantum physics", "cooking recipes for beginners")).toBe("low");
  });

  test("returns 'high' when punctuation stripped matches", () => {
    expect(computeConfidence("Hello, World!", "hello world")).toBe("high");
  });

  test("returns 'high' for case normalization", () => {
    expect(computeConfidence("UPPER CASE TITLE", "upper case title")).toBe("high");
  });

  test("returns 'high' when both titles normalize to empty sets", () => {
    expect(computeConfidence("", "")).toBe("high");
  });

  test("returns 'high' when both titles contain only punctuation (both normalize to empty)", () => {
    expect(computeConfidence("!!!", "---")).toBe("high");
  });

  test("returns 'low' when one title is empty and the other is not", () => {
    expect(computeConfidence("", "some words here")).toBe("low");
  });
});
