import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import * as z from "zod/v4";

import type { AnnasConfig } from "../config";
import { BaseUrlManager } from "../anna/base-url-manager";
import { BROWSER_USER_AGENT } from "../anna/client";
import { BookNotFoundError, BookService } from "../anna/book-service";
import { withResolvedBaseUrl } from "../anna/tool-utils";
import { validateDownloadUrl, sanitizeFilename, safeJoinPath, resolveDownloadRoot, checkDownloadCache, recordDownloadCache } from "../anna/file-utils";
import type { Book, BookDownloadResolution, FetchLike } from "../anna/types";

const bookSchema = z.object({
  language: z.string().optional(),
  format: z.string().optional(),
  size: z.string().optional(),
  title: z.string().optional(),
  publisher: z.string().optional(),
  authors: z.string().optional(),
  pageUrl: z.string().optional(),
  hash: z.string().optional(),
});

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

export const bookSearchInputSchema = z.object({
  query: z.string().trim().min(1).describe("Title, author, ISBN, or keywords to search for books"),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional().describe(`Maximum number of results to return (default ${DEFAULT_SEARCH_LIMIT})`),
});

export const bookSearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(bookSchema),
});

export const bookDownloadInputSchema = z.object({
  hash: z.string().trim().min(1).describe("MD5 hash of the book from book_search results"),
  title: z.string().optional().describe("Book title, used for filename when downloading"),
  format: z.string().optional().describe("File format (e.g. EPUB, PDF), used as file extension when downloading"),
  download: z.boolean().optional().describe("If true, download the file to disk"),
  downloadPath: z
    .string()
    .optional()
    .describe(
      "Absolute path within ANNAS_DOWNLOAD_PATH; defaults to root",
    ),
});

export const bookDownloadOutputSchema = z.object({
  book: bookSchema,
  fastDownloadUrl: z.string(),
  filePath: z.string().optional(),
});

export interface BookToolDependencies {
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

function bookExtension(format: string | undefined): string {
  if (!format) return ".bin";
  return "." + format.toLowerCase().replace(/^\./, "");
}

export async function handleBookSearch(
  args: z.infer<typeof bookSearchInputSchema>,
  dependencies: BookToolDependencies,
): Promise<CallToolResult> {
  try {
    const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
    const { results } = await withResolvedBaseUrl(
      dependencies,
      manager,
      (cfg, fi) => new BookService(cfg, fi),
      (service) => service.searchBooks(args.query),
    );
    const limit = args.limit ?? DEFAULT_SEARCH_LIMIT;
    const limitedResults = results.slice(0, limit);
    const structuredContent = {
      query: args.query,
      results: limitedResults,
    };

    if (limitedResults.length === 0) {
      return {
        content: [{ type: "text", text: `No books found for query: ${args.query}` }],
        structuredContent,
      };
    }

    const truncated = results.length > limitedResults.length;
    return {
      content: [{
        type: "text",
        text: truncated
          ? `Found ${results.length} book result(s) for query: ${args.query}; returning first ${limitedResults.length}`
          : `Found ${limitedResults.length} book result(s) for query: ${args.query}`,
      }],
      structuredContent,
    };
  } catch (error) {
    return textResult(error instanceof Error ? error.message : "Book search failed", true);
  }
}

export async function handleBookDownload(
  args: z.infer<typeof bookDownloadInputSchema>,
  dependencies: BookToolDependencies,
): Promise<CallToolResult> {
  try {
    const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
    const { results: resolution } = await withResolvedBaseUrl(
      dependencies,
      manager,
      (cfg, fi) => new BookService(cfg, fi),
      (service) => service.resolveBookDownload(args.hash),
    );

    let filePath: string | undefined;
    if (args.download) {
      let effectivePath: string;
      try {
        effectivePath = resolveDownloadRoot(dependencies.config.downloadPath, args.downloadPath);
      } catch (error) {
        return textResult(error instanceof Error ? error.message : "Invalid download path", true);
      }
      const cached = checkDownloadCache(effectivePath, { hash: args.hash });
      if (cached) {
        filePath = cached;
      } else {
        filePath = await saveBookFile(
          resolution.fastDownloadUrls,
          args.title,
          args.format,
          effectivePath,
          dependencies.fetchImpl,
        );
        recordDownloadCache(effectivePath, { hash: args.hash }, filePath);
      }
    }

    const structuredContent = {
      book: { ...resolution.book, title: args.title, format: args.format },
      fastDownloadUrl: resolution.fastDownloadUrls[0] ?? "",
      filePath,
    };

    return {
      content: [{
        type: "text",
        text: args.download
          ? `Resolved and downloaded book hash ${args.hash}`
          : `Resolved book hash ${args.hash}`,
      }],
      structuredContent,
    };
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return textResult(error.message, true);
    }
    return textResult(error instanceof Error ? error.message : "Book download failed", true);
  }
}

export function registerBookTools(server: McpServer, dependencies: BookToolDependencies): void {
  server.registerTool(
    "book_search",
    {
      title: "Book Search",
      description: "Search Anna's Archive for books by title, author, ISBN, or keywords.",
      inputSchema: bookSearchInputSchema,
      outputSchema: bookSearchOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    (args) => handleBookSearch(args, dependencies),
  );

  server.registerTool(
    "book_download",
    {
      title: "Book Download",
      description:
        "Resolve fast_download URL for a book by MD5 hash. Writes to disk when `download: true`.",
      inputSchema: bookDownloadInputSchema,
      outputSchema: bookDownloadOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
      },
    },
    (args) => handleBookDownload(args, dependencies),
  );
}

export type { Book };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function saveBookFile(
  fastDownloadUrls: string[],
  title: string | undefined,
  format: string | undefined,
  downloadPath: string,
  fetchImpl?: FetchLike,
): Promise<string> {
  const MAX_BYTES = 100 * 1024 * 1024;
  const TIMEOUT_MS = 30_000;

  if (fastDownloadUrls.length === 0) {
    throw new Error("No download source available for this book");
  }

  await mkdir(downloadPath, { recursive: true });

  const baseFilename = sanitizeFilename(title || "book");
  const extension = bookExtension(format);
  let filePath = safeJoinPath(downloadPath, baseFilename + extension);

  if (existsSync(filePath)) {
    let counter = 2;
    while (existsSync(safeJoinPath(downloadPath, `${baseFilename}_${counter}${extension}`))) {
      counter++;
    }
    filePath = safeJoinPath(downloadPath, `${baseFilename}_${counter}${extension}`);
  }

  const tmpFilePath = `${filePath}.tmp`;
  const fetchFn = fetchImpl || fetch;
  const attemptErrors: string[] = [];

  for (const url of fastDownloadUrls) {
    await validateDownloadUrl(url);
    let bytesWritten = 0;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetchFn(url, {
        signal: controller.signal,
        redirect: "error",
        headers: { "User-Agent": BROWSER_USER_AGENT },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        throw new Error("Received HTML response instead of file content. The source may be an error page or login redirect.");
      }

      if (!response.body) {
        throw new Error("Download response has no body");
      }

      const writeStream = createWriteStream(tmpFilePath, { mode: 0o600 });

      return await new Promise<string>((resolve, reject) => {
        writeStream.on("finish", async () => {
          if (bytesWritten === 0) {
            await rm(tmpFilePath, { force: true }).catch(() => {});
            reject(new Error("Download resulted in 0 bytes written"));
            return;
          }
          try {
            await rename(tmpFilePath, filePath);
            resolve(filePath);
          } catch (err) {
            await rm(tmpFilePath, { force: true }).catch(() => {});
            reject(err);
          }
        });

        writeStream.on("error", async (err) => {
          await rm(tmpFilePath, { force: true }).catch(() => {});
          reject(err);
        });

        (async () => {
          try {
            for await (const chunk of response.body as any) {
              bytesWritten += chunk instanceof Uint8Array ? chunk.length : Buffer.byteLength(String(chunk));
              if (bytesWritten > MAX_BYTES) {
                writeStream.destroy();
                await rm(tmpFilePath, { force: true });
                throw new Error(`Download aborted: file exceeded ${MAX_BYTES / 1024 / 1024} MB limit`);
              }
              if (!writeStream.write(chunk)) {
                await new Promise((res) => writeStream.once("drain", res));
              }
            }
            writeStream.end();
          } catch (err) {
            writeStream.destroy();
            reject(err);
          }
        })();
      });
    } catch (error) {
      clearTimeout(timeoutId);
      await rm(tmpFilePath, { force: true }).catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      attemptErrors.push(`fast_download (${hostOf(url)}): ${message}`);
    }
  }

  throw new Error(`All download sources failed:\n  - ${attemptErrors.join("\n  - ")}`);
}
