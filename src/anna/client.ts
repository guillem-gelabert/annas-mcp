import type { AnnasConfig } from "../config";
import { redactKeyInUrl } from "../config";
import { fastDownloadResponseSchema } from "./types";
import type { FastDownloadResponse, FetchLike } from "./types";

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export class AnnasClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnasClientError";
  }
}

export function originFor(baseUrl: string): string {
  return `https://${baseUrl}`;
}

export function articleSearchUrl(config: Pick<AnnasConfig, "baseUrl">, query: string): string {
  const params = new URLSearchParams({
    q: query,
    content: "journal",
  });

  return `${originFor(config.baseUrl)}/search?${params.toString()}`;
}

export function bookSearchUrl(config: Pick<AnnasConfig, "baseUrl">, query: string): string {
  const params = new URLSearchParams({
    q: query,
    content: "book_any",
  });

  return `${originFor(config.baseUrl)}/search?${params.toString()}`;
}

export function scidbLookupUrl(config: Pick<AnnasConfig, "baseUrl">, doi: string): string {
  return `${originFor(config.baseUrl)}/scidb/${encodeURIComponent(doi)}`;
}

export function articleDetailUrl(config: Pick<AnnasConfig, "baseUrl">, hash: string): string {
  return `${originFor(config.baseUrl)}/md5/${encodeURIComponent(hash)}`;
}

export function scidbDownloadUrl(config: Pick<AnnasConfig, "baseUrl">, doi: string): string {
  const params = new URLSearchParams({ doi });
  return `${originFor(config.baseUrl)}/scidb?${params.toString()}`;
}

export function fastDownloadUrl(config: AnnasConfig, hash: string, domainIndex = 0): string {
  const params = new URLSearchParams({ md5: hash, key: config.secretKey });
  if (domainIndex > 0) {
    params.set("domain_index", String(domainIndex));
  }
  return `${originFor(config.baseUrl)}/dyn/api/fast_download.json?${params.toString()}`;
}

export class AnnasClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: AnnasConfig,
    fetchImpl: FetchLike = fetch,
  ) {
    this.fetchImpl = fetchImpl;
  }

  get baseOrigin(): string {
    return originFor(this.config.baseUrl);
  }

  getSearchUrl(query: string): string {
    return articleSearchUrl(this.config, query);
  }

  getBookSearchUrl(query: string): string {
    return bookSearchUrl(this.config, query);
  }

  getScidbLookupUrl(doi: string): string {
    return scidbLookupUrl(this.config, doi);
  }

  getDetailUrl(hash: string): string {
    return articleDetailUrl(this.config, hash);
  }

  getScidbDownloadUrl(doi: string): string {
    return scidbDownloadUrl(this.config, doi);
  }

  async fetchText(url: string): Promise<string> {
    const response = await this.fetchImpl(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new AnnasClientError(`Anna's Archive request failed: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  async fetchFastDownload(hash: string, domainIndex = 0): Promise<FastDownloadResponse> {
    const url = fastDownloadUrl(this.config, hash, domainIndex);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      // Re-throw with a redacted message so the secret cannot leak via error
      // logs or upstream re-throws. Only the URL is sensitive here.
      const original = error instanceof Error ? error.message : String(error);
      const safe = redactKeyInUrl(original).replace(this.config.secretKey, "[redacted]");
      throw new AnnasClientError(`Anna's Archive fast-download request failed: ${safe}`);
    }

    if (!response.ok) {
      // Intentionally do not include the URL — it contains the secret key.
      throw new AnnasClientError(
        `Anna's Archive fast-download request failed: ${response.status} ${response.statusText}`,
      );
    }

    const raw = await response.json();
    const data = fastDownloadResponseSchema.parse(raw);
    if (data.error) {
      // Do not log the URL here — it contains the secret key.
      console.error(`[annas-mcp] fast-download API error: ${data.error}`);
      throw new AnnasClientError("API returned an error. Check server logs for details.");
    }

    return data;
  }

}
