import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AnnasConfig } from "../config";
import { BaseUrlManager } from "../anna/base-url-manager";
import type { FetchLike } from "../anna/types";

export interface BaseUrlToolDependencies {
  config: AnnasConfig;
  fetchImpl?: FetchLike;
  baseUrlManager?: BaseUrlManager;
}

export const updateBaseUrlInputSchema = z.object({});

export const updateBaseUrlOutputSchema = z.object({
  selectedBaseUrl: z.string().nullable(),
  checkedAt: z.string(),
  source: z.string(),
  selector: z.string(),
  revisionEvidence: z.object({
    thresholdIso: z.string(),
    revisionsScanned: z.number(),
    usedContinuation: z.boolean(),
  }),
  candidates: z.array(
    z.object({
      host: z.string(),
      latestRevisionSeen: z.boolean(),
      seenBeforeThreshold: z.boolean(),
      trusted: z.boolean(),
      skippedReason: z.string().optional(),
    }),
  ),
  mode: z.enum(["manual_override", "automatic"]),
  note: z.string().optional(),
  cacheWarning: z.string().optional(),
});

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export async function handleUpdateBaseUrl(
  _args: z.infer<typeof updateBaseUrlInputSchema>,
  dependencies: BaseUrlToolDependencies,
): Promise<CallToolResult> {
  try {
    const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
    let cacheWarning: string | undefined;
    try {
      await manager.readCache();
    } catch (cacheError) {
      cacheWarning = `Cache read failed: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`;
    }
    const record = await manager.updateBaseUrl();
    const structuredContent = {
      ...record,
      mode: dependencies.config.manualBaseUrl ? "manual_override" as const : "automatic" as const,
      note: dependencies.config.manualBaseUrl
        ? "ANNAS_BASE_URL is set manually and remains the active runtime base URL until changed or removed."
        : undefined,
      cacheWarning,
    };

    return {
      content: [{ type: "text", text: jsonText(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "Failed to update base URL cache");
  }
}

export function registerBaseUrlTools(server: McpServer, dependencies: BaseUrlToolDependencies): void {
  server.registerTool(
    "update_base_url",
    {
      title: "Update Base URL",
      description:
        "Refresh Anna's Archive mirror discovery from Wikipedia revisions, enforce 24-hour trust checks, and update local server cache.",
      inputSchema: updateBaseUrlInputSchema,
      outputSchema: updateBaseUrlOutputSchema,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
      },
    },
    (args) => handleUpdateBaseUrl(args, dependencies),
  );
}
