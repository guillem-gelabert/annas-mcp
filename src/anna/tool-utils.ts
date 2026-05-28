import { BaseUrlManager, isLikelyOfflineBaseUrlError } from "./base-url-manager";
import type { AnnasConfig } from "../config";
import type { FetchLike } from "./types";

export interface WithBaseUrlDeps {
  config: AnnasConfig;
  fetchImpl?: FetchLike;
}

export async function withResolvedBaseUrl<S, T>(
  dependencies: WithBaseUrlDeps,
  manager: BaseUrlManager,
  makeService: (config: AnnasConfig, fetchImpl?: FetchLike) => S,
  run: (service: S) => Promise<T>,
): Promise<{ results: T; baseUrl: string }> {
  const baseUrl = await manager.resolveBaseUrl();
  const service = makeService({ ...dependencies.config, baseUrl }, dependencies.fetchImpl);

  try {
    return { results: await run(service), baseUrl };
  } catch (error) {
    if (!isLikelyOfflineBaseUrlError(error)) {
      throw error;
    }

    if (dependencies.config.manualBaseUrl) {
      throw new Error(
        "Configured ANNAS_BASE_URL appears offline. Update ANNAS_BASE_URL or delete it to let automatic discovery choose a mirror.",
      );
    }

    await manager.updateBaseUrl();
    const refreshed = await manager.resolveBaseUrl();
    const retriedService = makeService({ ...dependencies.config, baseUrl: refreshed }, dependencies.fetchImpl);
    try {
      return { results: await run(retriedService), baseUrl: refreshed };
    } catch (retryError) {
      if (isLikelyOfflineBaseUrlError(retryError)) {
        throw new Error(
          "Both the current mirror and the fallback discovery appear offline. Try again later or set ANNAS_BASE_URL to a known working mirror.",
        );
      }
      throw retryError;
    }
  }
}
