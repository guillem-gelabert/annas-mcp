import { isAbsolute } from "node:path";

export interface AnnasConfig {
  secretKey: string;
  baseUrl: string;
  manualBaseUrl: boolean;
  downloadPath: string | null;
}

export type EnvSource = Record<string, string | undefined>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function normalizeBaseUrl(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }

  const withoutProtocol = raw.replace(/^https?:\/\//i, "");
  return withoutProtocol.replace(/\/+$/, "");
}

export function redactKeyInUrl(url: string): string {
  if (!url) {
    return url;
  }
  return url.replace(/([?&])key=[^&#]*/gi, "$1key=[redacted]");
}

export function redactSecret(value: string): string {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return "[redacted]";
  }

  return `${value.slice(0, 4)}...[redacted]...${value.slice(-4)}`;
}

function validateDownloadPath(value: string | undefined): string | null {
  const path = value?.trim();
  if (!path) {
    return null;
  }

  if (!isAbsolute(path)) {
    throw new ConfigError(`ANNAS_DOWNLOAD_PATH must be an absolute path, got: ${path}`);
  }

  return path;
}

export function loadConfig(env: EnvSource = process.env): AnnasConfig {
  const secretKey = env.ANNAS_SECRET_KEY?.trim();
  const manualBaseUrl = Boolean(env.ANNAS_BASE_URL?.trim());

  if (!secretKey) {
    throw new ConfigError("ANNAS_SECRET_KEY environment variable must be set");
  }

  return {
    secretKey,
    baseUrl: normalizeBaseUrl(env.ANNAS_BASE_URL),
    manualBaseUrl,
    downloadPath: validateDownloadPath(env.ANNAS_DOWNLOAD_PATH),
  };
}
