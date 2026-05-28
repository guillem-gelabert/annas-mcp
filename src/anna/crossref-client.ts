import { z } from "zod/v4";
import type { FetchLike } from "./types";

const crossRefWorkSchema = z.object({
  message: z.object({
    title: z.array(z.string()).optional(),
  }).optional(),
});

const CROSSREF_USER_AGENT = "annas-mcp-ts/1.4 (mailto:noreply@example.com)";
const CROSSREF_TIMEOUT_MS = 5000;

export async function fetchCrossRefTitle(doi: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const response = await fetchImpl(url, {
      headers: { "User-Agent": CROSSREF_USER_AGENT },
      signal: AbortSignal.timeout(CROSSREF_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const raw = await response.json();
    const parsed = crossRefWorkSchema.safeParse(raw);
    if (!parsed.success) return null;
    return parsed.data?.message?.title?.[0] ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return null; // expected: request timed out
    }
    if (err instanceof TypeError) {
      return null; // expected: network failure
    }
    // Unexpected: re-throw so callers and monitoring can see it
    throw err;
  }
}
