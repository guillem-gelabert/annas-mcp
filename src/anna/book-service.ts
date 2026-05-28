import type { AnnasConfig } from "../config";
import { AnnasClient } from "./client";
import { parseBookSearchResults } from "./parse";
import type { Book, BookDownloadResolution, FetchLike } from "./types";

export class BookNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookNotFoundError";
  }
}

export class BookService {
  private readonly client: AnnasClient;

  constructor(config: AnnasConfig, fetchImpl?: FetchLike) {
    this.client = new AnnasClient(config, fetchImpl);
  }

  async searchBooks(query: string): Promise<Book[]> {
    const html = await this.client.fetchText(this.client.getBookSearchUrl(query));
    return parseBookSearchResults(html, this.client.baseOrigin);
  }

  async resolveBookDownload(hash: string): Promise<BookDownloadResolution> {
    const fastDownloadUrls: string[] = [];
    const seenUrls = new Set<string>();
    let firstError: string | undefined;
    for (let domainIndex = 0; domainIndex <= 3; domainIndex++) {
      try {
        const data = await this.client.fetchFastDownload(hash, domainIndex);
        const url = data.download_url;
        if (url?.startsWith("https://") && !seenUrls.has(url)) {
          seenUrls.add(url);
          fastDownloadUrls.push(url);
        }
      } catch (error) {
        firstError = error instanceof Error ? error.message : String(error);
        break;
      }
    }
    if (fastDownloadUrls.length === 0) {
      const detail = firstError ? `: ${firstError}` : ` for hash: ${hash}`;
      throw new Error(`fast_download API returned no download URL${detail}`);
    }
    return { book: { hash }, fastDownloadUrls };
  }
}
