import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, resolve, sep } from "node:path";
import { promises as dnsPromises } from "node:dns";

export function resolveDownloadRoot(configuredRoot: string | null, requested: string | undefined): string {
  if (!configuredRoot) {
    throw new Error(
      "Download requested but ANNAS_DOWNLOAD_PATH is not configured. Set ANNAS_DOWNLOAD_PATH on the server before requesting downloads.",
    );
  }

  const root = resolve(configuredRoot);

  if (requested === undefined || requested === null || requested === "") {
    return root;
  }

  if (!isAbsolute(requested)) {
    throw new Error(`downloadPath must be an absolute path, got: ${requested}`);
  }

  const resolved = resolve(requested);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error("downloadPath must be inside ANNAS_DOWNLOAD_PATH");
  }

  return resolved;
}

function isPrivateHost(host: string): boolean {
  const privateRanges = [
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "169.254.169.254",
  ];

  return (
    privateRanges.includes(host) ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    (host.startsWith("172.") && /^172\.(1[6-9]|2\d|3[01])\./.test(host))
  );
}

type DnsLookupFn = (hostname: string) => Promise<{ address: string; family: number }>;

export async function validateDownloadUrl(
  raw: string,
  dnsLookup: DnsLookupFn = (h) => dnsPromises.lookup(h),
): Promise<URL> {
  const url = new URL(raw);

  if (url.protocol !== "https:") {
    throw new Error(`Rejected non-HTTPS download URL: ${url.protocol}`);
  }

  const host = url.hostname.toLowerCase();

  // Fast path: reject IP literals that are private/loopback without DNS lookup
  if (isPrivateHost(host)) {
    throw new Error(`Rejected private/loopback download URL host: ${host}`);
  }

  // Resolve hostname to catch DNS rebinding / SSRF via domain-to-private-IP
  try {
    const { address } = await dnsLookup(host);
    if (isPrivateHost(address)) {
      throw new Error(`Rejected private/loopback download URL host: ${address}`);
    }
  } catch (err) {
    // Re-throw our own security errors; ignore DNS resolution failures (network unreachable etc.)
    if (err instanceof Error && err.message.startsWith("Rejected private/loopback")) {
      throw err;
    }
  }

  return url;
}

export function sanitizeFilename(raw: string): string {
  const base = basename(raw);
  const sanitized = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  const visible = sanitized.replace(/^\.+/, "_");
  return visible.length > 0 ? visible : "download";
}

export function safeJoinPath(downloadDir: string, filename: string): string {
  const resolved = resolve(downloadDir, sanitizeFilename(filename));
  const downloadDirResolved = resolve(downloadDir);

  if (!resolved.startsWith(downloadDirResolved + sep)) {
    throw new Error(`Path traversal detected: ${resolved}`);
  }

  return resolved;
}

export function getFileExtension(headers: Record<string, string>): string {
  const contentDisposition = headers["content-disposition"] || "";
  const filenameMatch = contentDisposition.match(/filename[^;=\n]*=(?:(['"]).*?\1|[^;\n]*)/);
  if (filenameMatch && filenameMatch[0]) {
    const filename = filenameMatch[0].split("=")[1].replace(/^['"]|['"]$/g, "");
    const ext = filename.match(/\.[a-z0-9]+$/i);
    if (ext) {
      return ext[0];
    }
  }

  const contentType = (headers["content-type"] || "application/octet-stream").split(";")[0];
  if (contentType === "application/pdf") {
    return ".pdf";
  }

  return ".pdf";
}

export interface CacheKey {
  hash?: string;
  doi?: string;
}

function cacheKeyString(key: CacheKey): string | null {
  if (key.hash !== undefined && key.hash !== "") {
    return `md5:${key.hash}`;
  }
  if (key.doi !== undefined && key.doi !== "") {
    return `doi:${key.doi.toLowerCase()}`;
  }
  return null;
}

export function checkDownloadCache(downloadRoot: string, key: CacheKey): string | null {
  const keyStr = cacheKeyString(key);
  if (keyStr === null) return null;

  const indexPath = resolve(downloadRoot, ".annas-cache.json");
  if (!existsSync(indexPath)) return null;

  let index: Record<string, unknown>;
  try {
    index = JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch {
    return null;
  }

  const entry = index[keyStr];
  if (typeof entry !== "string") return null;

  if (!existsSync(entry)) return null;

  const resolvedRoot = resolve(downloadRoot);
  const resolvedEntry = resolve(entry);
  if (resolvedEntry !== resolvedRoot && !resolvedEntry.startsWith(resolvedRoot + sep)) {
    return null;
  }

  return entry;
}

export function recordDownloadCache(downloadRoot: string, key: CacheKey, filePath: string): void {
  const keyStr = cacheKeyString(key);
  if (keyStr === null) return;

  const indexPath = resolve(downloadRoot, ".annas-cache.json");

  let index: Record<string, unknown> = {};
  try {
    if (existsSync(indexPath)) {
      index = JSON.parse(readFileSync(indexPath, "utf-8"));
    }
  } catch {
    index = {};
  }

  index[keyStr] = filePath;

  try {
    writeFileSync(indexPath, JSON.stringify(index, null, 2), { mode: 0o600 });
    // Ensure restrictive permissions even when rewriting an existing file.
    chmodSync(indexPath, 0o600);
  } catch {
    // best-effort; silently swallow write errors
  }
}
