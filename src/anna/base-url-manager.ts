import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AnnasConfig } from "../config";
import { normalizeBaseUrl } from "../config";
import { BROWSER_USER_AGENT } from "./client";
import type {
  BaseUrlCacheRecord,
  BaseUrlCandidate,
  FetchLike,
} from "./types";

const WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php";
const WIKIPEDIA_PAGE_TITLE = "Anna's Archive";
const WIKITEXT_EXTRACTION_METHOD = "wikitext-url-regex: /https?:\\/\\/([a-z0-9.-]+)/gi filtered by HOST_PATTERN";
const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".cache", "annas-mcp-ts");
const DEFAULT_CACHE_FILE = path.join(DEFAULT_CACHE_DIR, "base-url-cache.json");
const REVISION_LIMIT = 200;
// Trust gate: a host must have been present in the Wikipedia article for at
// least MIN_AGE_MS before we will use it. The fetch lookback window must be
// strictly larger than MIN_AGE_MS so older revisions are visible.
const MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKBACK_MS = 21 * 24 * 60 * 60 * 1000;
const API_BATCH_LIMIT = 50;
const WIKIPEDIA_FETCH_TIMEOUT_MS = 15_000;
const HOST_PATTERN = /^annas-archive\.[a-z]{2,}$/i;

function isPlausibleMirror(host: string): boolean {
  return HOST_PATTERN.test(host);
}

interface RevisionItem {
  timestamp: string;
  content: string;
}

interface DiscoverResult {
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

export class BaseUrlDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseUrlDiscoveryError";
  }
}

export class BaseUrlManager {
  constructor(
    private readonly config: AnnasConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly cacheFilePath: string = DEFAULT_CACHE_FILE,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolveBaseUrl(): Promise<string> {
    if (this.config.manualBaseUrl) {
      return this.config.baseUrl;
    }

    const cached = await this.readCache();
    if (cached?.selectedBaseUrl) {
      return cached.selectedBaseUrl;
    }

    const updated = await this.updateBaseUrl();
    if (!updated.selectedBaseUrl) {
      throw new BaseUrlDiscoveryError("Could not discover a trusted Anna's Archive base URL.");
    }
    return updated.selectedBaseUrl;
  }

  async updateBaseUrl(): Promise<BaseUrlCacheRecord> {
    const discovered = await this.discoverFromRevisions();
    const record: BaseUrlCacheRecord = {
      selectedBaseUrl: discovered.selectedBaseUrl,
      checkedAt: discovered.checkedAt,
      source: discovered.source,
      selector: discovered.selector,
      revisionEvidence: discovered.revisionEvidence,
      candidates: discovered.candidates,
    };
    await this.writeCache(record);
    return record;
  }

  async readCache(): Promise<BaseUrlCacheRecord | null> {
    try {
      const raw = await readFile(this.cacheFilePath, "utf-8");
      return JSON.parse(raw) as BaseUrlCacheRecord;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
      return null;
    }
  }

  private async discoverFromRevisions(): Promise<DiscoverResult> {
    const revisions = await this.fetchRevisionBatches();
    if (revisions.length === 0) {
      throw new BaseUrlDiscoveryError("Wikipedia returned no revisions for Anna's Archive.");
    }

    const now = this.now();
    const thresholdMs = now.getTime() - MIN_AGE_MS;
    const thresholdIso = new Date(thresholdMs).toISOString();
    const latest = revisions[0];
    const latestHosts = this.extractHostsFromWikitext(latest.content);
    const olderHosts = new Set<string>();

    for (const revision of revisions) {
      const revisionMs = Date.parse(revision.timestamp);
      if (Number.isNaN(revisionMs) || revisionMs >= thresholdMs) {
        continue;
      }
      for (const host of this.extractHostsFromWikitext(revision.content)) {
        olderHosts.add(host);
      }
    }

    const allHosts = new Set<string>([...latestHosts, ...olderHosts]);
    const candidates: BaseUrlCandidate[] = [...allHosts]
      .sort()
      .map((host) => {
        const latestRevisionSeen = latestHosts.has(host);
        const seenBeforeThreshold = olderHosts.has(host);
        const trusted = latestRevisionSeen && seenBeforeThreshold;
        let skippedReason: string | undefined;
        if (!latestRevisionSeen) {
          skippedReason = "not_in_latest_revision";
        } else if (!seenBeforeThreshold) {
          skippedReason = "not_seen_older_than_7d_or_unproven";
        }
        return {
          host,
          latestRevisionSeen,
          seenBeforeThreshold,
          trusted,
          skippedReason,
        };
      });

    const trustedHosts = candidates.filter((candidate) => candidate.trusted).map((candidate) => candidate.host);
    const selectedBaseUrl = trustedHosts[0] ?? null;

    return {
      selectedBaseUrl,
      checkedAt: now.toISOString(),
      source: WIKIPEDIA_PAGE_TITLE,
      selector: WIKITEXT_EXTRACTION_METHOD,
      revisionEvidence: {
        thresholdIso,
        revisionsScanned: revisions.length,
        usedContinuation: revisions.length >= API_BATCH_LIMIT,
      },
      candidates,
    };
  }

  private async fetchRevisionBatches(): Promise<RevisionItem[]> {
    const revisions: RevisionItem[] = [];
    let continuation: string | null = null;
    const nowMs = this.now().getTime();
    const minTimestamp = nowMs - LOOKBACK_MS;

    while (revisions.length < REVISION_LIMIT) {
      const remaining = REVISION_LIMIT - revisions.length;
      const batchLimit = Math.min(API_BATCH_LIMIT, remaining);
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        origin: "*",
        prop: "revisions",
        titles: WIKIPEDIA_PAGE_TITLE,
        rvslots: "main",
        rvprop: "timestamp|content",
        rvlimit: String(batchLimit),
      });

      if (continuation) {
        params.set("rvcontinue", continuation);
      }

      const response = await this.fetchImpl(`${WIKIPEDIA_API_URL}?${params.toString()}`, {
        headers: { "User-Agent": BROWSER_USER_AGENT },
        signal: AbortSignal.timeout(WIKIPEDIA_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new BaseUrlDiscoveryError(
          `Wikipedia revisions request failed: ${response.status} ${response.statusText}`,
        );
      }

      const payload = (await response.json()) as {
        continue?: { rvcontinue?: string };
        query?: {
          pages?: Record<
            string,
            {
              revisions?: Array<{ timestamp?: string; slots?: { main?: { "*": string; content?: string } } }>;
            }
          >;
        };
      };

      const pages = payload.query?.pages ?? {};
      const page = Object.values(pages)[0];
      const batch = page?.revisions ?? [];

      for (const item of batch) {
        const timestamp = item.timestamp ?? "";
        const content = item.slots?.main?.content ?? item.slots?.main?.["*"] ?? "";
        if (!timestamp || !content) {
          continue;
        }
        revisions.push({ timestamp, content });
      }

      const oldestMs = revisions.length
        ? Date.parse(revisions[revisions.length - 1]!.timestamp)
        : Number.NaN;
      if (!Number.isNaN(oldestMs) && oldestMs <= minTimestamp) {
        break;
      }

      continuation = payload.continue?.rvcontinue ?? null;
      if (!continuation || batch.length === 0) {
        break;
      }
    }

    return revisions;
  }

  private extractHostsFromWikitext(content: string): Set<string> {
    const hosts = new Set<string>();
    const matches = content.matchAll(/https?:\/\/([a-z0-9.-]+)/gi);
    for (const match of matches) {
      const host = normalizeBaseUrl(match[1]).toLowerCase();
      if (isPlausibleMirror(host)) {
        hosts.add(host);
      }
    }
    return hosts;
  }

  private async writeCache(record: BaseUrlCacheRecord): Promise<void> {
    await mkdir(path.dirname(this.cacheFilePath), { recursive: true, mode: 0o700 });
    await writeFile(this.cacheFilePath, JSON.stringify(record, null, 2), { mode: 0o600 });
  }
}

export function isLikelyOfflineBaseUrlError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("ehostunreach") ||
    message.includes("networkerror") ||
    message.includes("request failed: 502") ||
    message.includes("request failed: 503") ||
    message.includes("request failed: 504")
  );
}
