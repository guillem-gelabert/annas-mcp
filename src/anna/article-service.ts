import type { AnnasConfig } from "../config";
import { AnnasClient } from "./client";
import {
  parseArticleDetail,
  parseArticleSearchResults,
  parseFirstArticleHash,
  parseScidbPdfUrl,
} from "./parse";
import type { Article, ArticleDownloadResolution, FetchLike } from "./types";

export class ArticleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArticleNotFoundError";
  }
}

export function isDoiQuery(query: string): boolean {
  return query.trim().startsWith("10.");
}

export class ArticleService {
  private readonly client: AnnasClient;

  constructor(config: AnnasConfig, fetchImpl?: FetchLike) {
    this.client = new AnnasClient(config, fetchImpl);
  }

  async searchArticles(query: string): Promise<Article[]> {
    if (isDoiQuery(query)) {
      try {
        return [await this.lookupArticleByDoi(query.trim())];
      } catch (error) {
        if (error instanceof ArticleNotFoundError) {
          return [];
        }
        throw error;
      }
    }

    const html = await this.client.fetchText(this.client.getSearchUrl(query));
    return parseArticleSearchResults(html, this.client.baseOrigin);
  }

  async lookupArticleByDoi(doi: string): Promise<Article> {
    const cleanDoi = doi.trim();
    const scidbHtml = await this.client.fetchText(this.client.getScidbLookupUrl(cleanDoi));
    const hash = parseFirstArticleHash(scidbHtml);

    if (!hash) {
      throw new ArticleNotFoundError(`No article found for DOI: ${cleanDoi}`);
    }

    const article: Article = {
      doi: cleanDoi,
      hash,
      pageUrl: this.client.getDetailUrl(hash),
      downloadUrl: this.client.getScidbDownloadUrl(cleanDoi),
      scidbPdfUrl: parseScidbPdfUrl(scidbHtml, hash) ?? undefined,
    };

    try {
      const detailHtml = await this.client.fetchText(this.client.getDetailUrl(hash));
      Object.assign(article, parseArticleDetail(detailHtml));
    } catch {
      // Details are helpful but not required for download resolution.
    }

    return article;
  }

  async resolveArticleDownload(doi: string): Promise<ArticleDownloadResolution> {
    const article = await this.lookupArticleByDoi(doi);
    const sources: ArticleDownloadResolution["sources"] = [];

    if (article.hash) {
      const seenUrls = new Set<string>();
      for (let domainIndex = 0; domainIndex <= 3; domainIndex++) {
        try {
          const fastDownload = await this.client.fetchFastDownload(article.hash, domainIndex);
          const url = fastDownload.download_url;
          if (url?.startsWith("https://") && !seenUrls.has(url)) {
            seenUrls.add(url);
            sources.push({ type: "fast_download", url });
          }
        } catch {
          break;
        }
      }
    }

    if (article.scidbPdfUrl) {
      sources.push({ type: "scidb_pdf", url: article.scidbPdfUrl });
    }

    if (article.downloadUrl) {
      sources.push({ type: "scidb", url: article.downloadUrl });
    }

    return {
      article,
      sources,
    };
  }
}
