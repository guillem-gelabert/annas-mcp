import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AnnasConfig } from "../config";
import { BaseUrlManager, isLikelyOfflineBaseUrlError } from "../anna/base-url-manager";
import { ArticleNotFoundError, ArticleService } from "../anna/article-service";
import { withResolvedBaseUrl } from "../anna/tool-utils";
import type { Article, FetchLike } from "../anna/types";
import { fetchCrossRefTitle } from "../anna/crossref-client";
import { computeConfidence } from "../anna/confidence";

const articleSchema = z.object({
  doi: z.string().optional(),
  title: z.string().optional(),
  authors: z.string().optional(),
  journal: z.string().optional(),
  size: z.string().optional(),
  hash: z.string().optional(),
  pageUrl: z.string().optional(),
  downloadUrl: z.string().optional(),
});

const downloadSourceSchema = z.object({
  type: z.enum(["fast_download", "scidb_pdf", "scidb"]),
  url: z.string(),
});

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

export const articleSearchInputSchema = z.object({
  query: z.string().trim().min(1).describe("DOI or search keywords for articles"),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional().describe(`Maximum number of results to return (default ${DEFAULT_SEARCH_LIMIT})`),
});

export const articleSearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(articleSchema),
});

export const articleDownloadInputSchema = z
  .object({
    doi: z
      .string()
      .trim()
      .min(1)
      .regex(/^10\.\d{4,}[^\s]*$/, "Invalid DOI format")
      .describe("DOI of the article to resolve")
      .optional(),
    dois: z
      .array(z.string().trim().regex(/^10\.\d{4,}[^\s]*$/, "Invalid DOI format"))
      .min(1)
      .optional()
      .describe("Array of DOIs to resolve in batch"),
    verbose: z
      .boolean()
      .optional()
      .describe("Include title verification metadata (crossrefTitle, annasTitle, confidence)"),
  })
  .superRefine((val, ctx) => {
    const hasDoi = val.doi !== undefined;
    const hasDois = val.dois !== undefined;
    if (hasDoi && hasDois) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either doi (single) or dois (array), not both",
      });
    } else if (!hasDoi && !hasDois) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either doi (single) or dois (array)",
      });
    }
  });

const verificationSchema = z.object({
  crossrefTitle: z.string().nullable(),
  annasTitle: z.string().nullable(),
  confidence: z.enum(["high", "low", "unverified"]),
});

export const articleDownloadOutputSchema = z.object({
  article: articleSchema,
  sources: z.array(downloadSourceSchema),
  verification: verificationSchema.optional(),
});

const articleBatchResultSchema = z.object({
  doi: z.string(),
  article: articleSchema.optional(),
  sources: z.array(downloadSourceSchema).optional(),
  error: z.string().optional(),
  verification: verificationSchema.optional(),
});

export const articleBatchDownloadOutputSchema = z.object({
  results: z.array(articleBatchResultSchema),
});

export type ArticleBatchResult = z.infer<typeof articleBatchResultSchema>;

export interface ArticleToolDependencies {
  config: AnnasConfig;
  fetchImpl?: FetchLike;
  baseUrlManager?: BaseUrlManager;
}

function textResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

export async function handleArticleSearch(
  args: z.infer<typeof articleSearchInputSchema>,
  dependencies: ArticleToolDependencies,
): Promise<CallToolResult> {
  try {
    const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
    const { results } = await withResolvedBaseUrl(
      dependencies,
      manager,
      (cfg, fi) => new ArticleService(cfg, fi),
      (service) => service.searchArticles(args.query),
    );
    const limit = args.limit ?? DEFAULT_SEARCH_LIMIT;
    const limitedResults = results.slice(0, limit);
    const structuredContent = {
      query: args.query,
      results: limitedResults,
    };

    if (limitedResults.length === 0) {
      return {
        content: [{ type: "text", text: `No articles found for query: ${args.query}` }],
        structuredContent,
      };
    }

    const truncated = results.length > limitedResults.length;
    return {
      content: [{
        type: "text",
        text: truncated
          ? `Found ${results.length} article result(s) for query: ${args.query}; returning first ${limitedResults.length}`
          : `Found ${limitedResults.length} article result(s) for query: ${args.query}`,
      }],
      structuredContent,
    };
  } catch (error) {
    return textResult(error instanceof Error ? error.message : "Article search failed", true);
  }
}

export async function handleArticleDownload(
  args: z.infer<typeof articleDownloadInputSchema>,
  dependencies: ArticleToolDependencies,
): Promise<CallToolResult> {
  try {
    if ("dois" in args && args.dois) {
      return await handleBatchArticleDownload(args as { dois: string[] }, dependencies);
    }

    return await handleSingleArticleDownload(args as { doi: string }, dependencies);
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return textResult(error.message, true);
    }

    return textResult(error instanceof Error ? error.message : "Article download resolution failed", true);
  }
}

async function handleSingleArticleDownload(
  args: { doi: string; verbose?: boolean },
  dependencies: ArticleToolDependencies,
): Promise<CallToolResult> {
  const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
  const includeVerification = args.verbose === true;
  const { results: resolution } = await withResolvedBaseUrl(
    dependencies,
    manager,
    (cfg, fi) => new ArticleService(cfg, fi),
    (service) => service.resolveArticleDownload(args.doi),
  );

  let structuredContent: {
    article: typeof resolution.article;
    sources: typeof resolution.sources;
    verification?: {
      crossrefTitle: string | null;
      annasTitle: string | null;
      confidence: "high" | "low" | "unverified";
    };
  } = {
    article: resolution.article,
    sources: resolution.sources,
  };

  if (includeVerification) {
    const crossrefTitle = await fetchCrossRefTitle(args.doi, dependencies.fetchImpl).catch(() => null);
    const annasTitle = resolution.article.title ?? null;
    structuredContent = {
      ...structuredContent,
      verification: {
        crossrefTitle,
        annasTitle,
        confidence: computeConfidence(annasTitle ?? "", crossrefTitle),
      },
    };
  }

  return {
    content: [{ type: "text", text: `Resolved article DOI ${args.doi} with ${resolution.sources.length} source(s)` }],
    structuredContent,
  };
}

async function handleBatchArticleDownload(
  args: { dois: string[]; verbose?: boolean },
  dependencies: ArticleToolDependencies,
): Promise<CallToolResult> {
  // Create one shared BaseUrlManager instance for all lookups
  const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);

  // Base URL CB state (CB-01/02/03): resolve once up front, deduplicate re-discovery
  let baseUrl = await manager.resolveBaseUrl();
  let rediscoveryPromise: Promise<string> | null = null;
  let rediscoveryFailed = false;

  // Parallel DOI lookups with inline base URL CB (bypasses withResolvedBaseUrl per D-01)
  const lookupOne = async (doi: string): Promise<{ doi: string; resolution: import("../anna/types").ArticleDownloadResolution; crossrefTitle: string | null }> => {
    try {
      const service = new ArticleService({ ...dependencies.config, baseUrl }, dependencies.fetchImpl);
      const [resolution, crossrefTitle] = await Promise.all([
        service.resolveArticleDownload(doi),
        fetchCrossRefTitle(doi, dependencies.fetchImpl).catch(() => null),
      ]);
      return { doi, resolution, crossrefTitle };
    } catch (error) {
      if (!isLikelyOfflineBaseUrlError(error)) {
        throw error;
      }

      // Manual override contract: if ANNAS_BASE_URL is set explicitly, never silently
      // rediscover. Throw the same guidance message used by withResolvedBaseUrl so
      // single-DOI and batch-DOI paths behave identically under this configuration.
      if (dependencies.config.manualBaseUrl) {
        throw new Error(
          "Configured ANNAS_BASE_URL appears offline. Update ANNAS_BASE_URL or delete it to let automatic discovery choose a mirror.",
        );
      }

      if (rediscoveryFailed) {
        throw new Error("Mirror re-discovery failed; cannot resolve remaining DOIs.");
      }

      // Deduplication: synchronous check-and-set before any await (Pitfall 1 in RESEARCH.md)
      if (!rediscoveryPromise) {
        rediscoveryPromise = manager.updateBaseUrl()
          .then(() => manager.resolveBaseUrl())
          .catch((err) => {
            rediscoveryFailed = true;
            throw err;
          });
      }

      const newBaseUrl = await rediscoveryPromise;
      // Propagate refreshed mirror to later-entering lookups so they don't try the dead URL first.
      baseUrl = newBaseUrl;
      const retryService = new ArticleService({ ...dependencies.config, baseUrl: newBaseUrl }, dependencies.fetchImpl);
      const [resolution, crossrefTitle] = await Promise.all([
        retryService.resolveArticleDownload(doi),
        fetchCrossRefTitle(doi, dependencies.fetchImpl).catch(() => null),
      ]);
      return { doi, resolution, crossrefTitle };
    }
  };

  const lookupSettled = await Promise.allSettled(args.dois.map((doi) => lookupOne(doi)));

  const resolvedItems: { doi: string; resolution: import("../anna/types").ArticleDownloadResolution; crossrefTitle: string | null; index: number }[] = [];
  // Pre-allocate results array indexed by input DOI position to preserve order.
  const results: (ArticleBatchResult | undefined)[] = new Array(args.dois.length);

  for (let i = 0; i < lookupSettled.length; i++) {
    const settled = lookupSettled[i];
    const doi = args.dois[i];
    if (settled.status === "fulfilled") {
      resolvedItems.push({ doi, resolution: settled.value.resolution, crossrefTitle: settled.value.crossrefTitle, index: i });
    } else {
      const msg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      results[i] = { doi, error: msg };
    }
  }

  const includeVerification = args.verbose === true;

  for (const { doi, resolution, crossrefTitle, index } of resolvedItems) {
    if (includeVerification) {
      const annasTitle = resolution.article.title ?? null;
      const verification = {
        crossrefTitle,
        annasTitle,
        confidence: computeConfidence(annasTitle ?? "", crossrefTitle),
      };
      results[index] = { doi, article: resolution.article, sources: resolution.sources, verification };
      continue;
    }

    results[index] = { doi, article: resolution.article, sources: resolution.sources };
  }

  // Filter out any undefined slots (should not occur in practice) and cast to concrete type.
  const orderedResults: ArticleBatchResult[] = results.filter((r): r is ArticleBatchResult => r !== undefined);

  return {
    content: [{
      type: "text",
      text: `Resolved ${resolvedItems.length}/${args.dois.length} DOI(s)${includeVerification ? "" : " (compact mode)"}`,
    }],
    structuredContent: { results: orderedResults },
  };
}

export function registerArticleTools(server: McpServer, dependencies: ArticleToolDependencies): void {
  server.registerTool(
    "article_search",
    {
      title: "Article Search",
      description:
        "Search Anna's Archive for academic articles by DOI or keywords. DOI-like queries starting with '10.' use DOI lookup.",
      inputSchema: articleSearchInputSchema,
      outputSchema: articleSearchOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    (args) => handleArticleSearch(args, dependencies),
  );

  server.registerTool(
    "article_download",
    {
      title: "Article Download",
      description:
        "Resolve DOI(s) to download URLs. No disk writes. Prefer `dois[]` batch over parallel `doi` calls.",
      inputSchema: articleDownloadInputSchema,
      // outputSchema intentionally omitted: the handler returns articleDownloadOutputSchema for single DOI
      // and articleBatchDownloadOutputSchema for batch DOI — two distinct shapes. Registering either
      // schema alone would misrepresent the other case. A union output schema is not supported by MCP.
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    (args) => handleArticleDownload(args, dependencies),
  );
}

export type { Article };
