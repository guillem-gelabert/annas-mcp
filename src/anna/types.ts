import { z } from "zod/v4";

export interface Article {
  doi?: string;
  title?: string;
  authors?: string;
  journal?: string;
  size?: string;
  hash?: string;
  pageUrl?: string;
  downloadUrl?: string;
  scidbPdfUrl?: string;
}

export interface Book {
  language?: string;
  format?: string;
  size?: string;
  title?: string;
  publisher?: string;
  authors?: string;
  pageUrl?: string;
  hash?: string;
}

export interface DownloadSource {
  type: "fast_download" | "scidb_pdf" | "scidb";
  url: string;
}

export interface ArticleDownloadResolution {
  article: Article;
  sources: DownloadSource[];
}

export interface BookDownloadResolution {
  book: Book;
  fastDownloadUrls: string[];
}

export const fastDownloadResponseSchema = z.object({
  download_url: z.string().optional(),
  error: z.string().optional(),
});

export type FastDownloadResponse = z.infer<typeof fastDownloadResponseSchema>;

export interface FetchLike {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}

export interface BaseUrlCandidate {
  host: string;
  latestRevisionSeen: boolean;
  seenBeforeThreshold: boolean;
  trusted: boolean;
  skippedReason?: string;
}

export interface BaseUrlCacheRecord {
  selectedBaseUrl: string | null;
  checkedAt: string;
  source: string;
  selector: string;
  revisionEvidence: {
    thresholdIso: string;
    revisionsScanned: number;
    usedContinuation: boolean;
  };
  candidates: BaseUrlCandidate[];
}
