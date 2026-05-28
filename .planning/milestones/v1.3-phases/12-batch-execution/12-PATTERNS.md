# Phase 12: Batch Execution - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 2 (1 modified source + 1 modified test)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/tools/article-tools.ts` | handler/service | request-response, batch, parallel | same file (existing single-DOI path at lines 165–207) | exact — same file, same pattern family |
| `tests/article-tools.test.ts` | test | request-response, batch | same file (existing handler tests at lines 86–327) | exact — same file, same test idioms |

## Pattern Assignments

### `src/tools/article-tools.ts` — `handleBatchArticleDownload` (new private function)

**Analog:** existing `handleArticleDownload` single-DOI path (lines 156–207 of same file)

**Imports pattern** (lines 1–20) — already present, no new imports needed:
```typescript
import type { CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { BaseUrlManager } from "../anna/base-url-manager";
import { ArticleNotFoundError, ArticleService } from "../anna/article-service";
import { withResolvedBaseUrl } from "../anna/tool-utils";
import {
  resolveDownloadRoot,
  checkDownloadCache,
  recordDownloadCache,
} from "../anna/file-utils";
import type { ArticleDownloadResolution } from "../anna/types";
```

**Manager instantiation pattern** (line 165) — create once, share across all parallel calls:
```typescript
const manager = dependencies.baseUrlManager ?? new BaseUrlManager(dependencies.config, dependencies.fetchImpl);
```

**Per-DOI resolution pattern** (lines 166–171) — the inner call shape to wrap inside `Promise.allSettled`:
```typescript
const { results: resolution } = await withResolvedBaseUrl(
  dependencies,
  manager,
  (cfg, fi) => new ArticleService(cfg, fi),
  (service) => service.resolveArticleDownload(args.doi!),
);
```

**Pre-flight download path validation pattern** (lines 174–180) — call once before the fan-out, return early on error:
```typescript
let effectivePath: string;
try {
  effectivePath = resolveDownloadRoot(dependencies.config.downloadPath, args.downloadPath);
} catch (error) {
  return textResult(error instanceof Error ? error.message : "Invalid download path", true);
}
```

**Cache check + write pattern** (lines 181–187) — apply per-DOI inside the download stage:
```typescript
const cached = checkDownloadCache(effectivePath, { doi: args.doi! });
if (cached) {
  filePath = cached;
} else {
  filePath = await saveArticleFile(resolution, effectivePath, dependencies.fetchImpl);
  recordDownloadCache(effectivePath, { doi: args.doi! }, filePath);
}
```

**Structured response pattern** (lines 190–199) — batch version returns `results` array instead of flat object:
```typescript
// Single-DOI shape (analog):
return {
  content: [{ type: "text", text: jsonText(structuredContent) }],
  structuredContent,
};

// Batch shape to produce (note: isError NEVER set for partial failures):
return {
  content: [{ type: "text", text: jsonText({ results }) }],
  structuredContent: { results },
};
```

**Error handling pattern** (lines 200–206) — `instanceof Error ? error.message : String(error)` used consistently; batch maps the same idiom into per-item `error` fields:
```typescript
// Current single-DOI catch:
if (error instanceof ArticleNotFoundError) {
  return textResult(error.message, true);
}
return textResult(error instanceof Error ? error.message : "Article download resolution failed", true);

// Per-item batch equivalent (inside allSettled result processing):
const msg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
initialResults.push({ doi, error: msg }); // no article, no sources
```

**`textResult` / `jsonText` helpers** (lines 112–121) — used identically in the batch path:
```typescript
function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}
function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
```

**Router delegation pattern** (lines 161–163) — replace the stub with a delegate call:
```typescript
// Current stub to replace:
if ("dois" in args && args.dois) {
  return { content: [{ type: "text", text: "batch not yet implemented" }] };
}

// Target pattern (mirrors how search delegates):
if ("dois" in args && args.dois) {
  return handleBatchArticleDownload(args as { dois: string[]; download?: boolean; downloadPath?: string }, dependencies);
}
```

**`handleSingleArticleDownload` extraction pattern** — extract the body of the current `handleArticleDownload` (lines 165–207, excluding the `dois` branch) verbatim into a private function with the same `(args, dependencies)` signature, then have the router call it:
```typescript
async function handleSingleArticleDownload(
  args: { doi: string; download?: boolean; downloadPath?: string },
  dependencies: ArticleToolDependencies,
): Promise<CallToolResult> {
  // ... current body verbatim (lines 165-207 of article-tools.ts) ...
}
```

---

### `tests/article-tools.test.ts` — batch behavior tests replacing the stub test

**Analog:** existing handler tests in same file (lines 86–327)

**Test file imports / setup** (lines 1–19) — no new imports needed; same config object reused:
```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleArticleDownload } from "../src/tools/article-tools";
import type { FetchLike } from "../src/anna/types";

const config: AnnasConfig = {
  secretKey: "feedfacecafebeef",
  baseUrl: "annas-archive.li",
  manualBaseUrl: true,
  downloadPath: null,
};
```

**URL-routing fetchMock pattern** (lines 87–99) — replicate for each DOI in batch tests by routing on both DOI-specific URL segments:
```typescript
const fetchMock: FetchLike = async (input) => {
  const url = String(input);
  if (url.includes("/scidb/10.1038%2Fnature12345")) return response(searchHtml);
  if (url.includes("/md5/abc123def456")) return response(detailHtml);
  if (url.includes("/dyn/api/fast_download.json")) return Response.json({ download_url: "https://download.example/paper.pdf" });
  throw new Error(`Unexpected URL: ${url}`);
};
```

**Assertion style** (lines 106–124) — use `toMatchObject` for partial-shape checks, `toBeUndefined()` for no-error:
```typescript
expect(result.isError).toBeUndefined();
expect(result.structuredContent).toMatchObject({ ... });
```

**`firstText` helper** (lines 48–52) — already defined; reuse for error message assertions:
```typescript
function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
  const item = result.content[0];
  expect(item?.type).toBe("text");
  return item?.text ?? "";
}
```

**Stub test to replace** (lines 373–383):
```typescript
// DELETE this test — it documents behavior Phase 12 intentionally removes:
test("batch stub returns non-error result for dois input", async () => {
  const result = await handleArticleDownload(
    { dois: ["10.1038/nature12345"] },
    { config, fetchImpl: noNetworkFetch },
  );
  expect(result.isError).toBeFalsy();
  expect(result.content[0].text).toBe("batch not yet implemented");
});
```

**Concurrency assertion pattern** (from RESEARCH.md Code Examples) — counter + `Promise.resolve()` yield:
```typescript
let inFlight = 0;
let maxConcurrent = 0;
const fetchMock: FetchLike = async (input) => {
  inFlight++;
  maxConcurrent = Math.max(maxConcurrent, inFlight);
  await Promise.resolve();
  inFlight--;
  // ... return appropriate response per URL
};
// After await: expect(maxConcurrent).toBeGreaterThan(1)
```

**Error isolation test shape** — 3 DOIs (1 failing lookup, 2 succeeding), assert `isError` absent on result, array has correct per-item shapes:
```typescript
// Failing lookup item shape:
expect(results[0]).toEqual({ doi: "10.xxx/failing", error: expect.any(String) });
expect(results[0]).not.toHaveProperty("article");
expect(results[0]).not.toHaveProperty("sources");

// Successful item shape:
expect(results[1]).toMatchObject({ doi: "...", article: expect.any(Object), sources: expect.any(Array) });
expect(results[1]).not.toHaveProperty("error");
```

---

## Shared Patterns

### `textResult` error helper
**Source:** `src/tools/article-tools.ts` lines 112–117
**Apply to:** `handleBatchArticleDownload` — pre-flight failure (entire batch fails) only
```typescript
function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}
```

### `jsonText` serializer
**Source:** `src/tools/article-tools.ts` lines 119–121
**Apply to:** `handleBatchArticleDownload` final response assembly
```typescript
function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
```

### Error message extraction
**Source:** `src/tools/article-tools.ts` lines 200–206 (and throughout)
**Apply to:** Every `Promise.allSettled` rejection handler
```typescript
const msg = error instanceof Error ? error.message : String(error);
```

### `withResolvedBaseUrl` call shape
**Source:** `src/tools/article-tools.ts` lines 166–171 + `src/anna/tool-utils.ts` lines 10–46
**Apply to:** Each DOI lookup inside `Promise.allSettled` — pass the shared `manager` instance, not a fresh one
```typescript
const { results: resolution } = await withResolvedBaseUrl(
  dependencies,
  manager,            // shared — constructed once before the fan-out
  (cfg, fi) => new ArticleService(cfg, fi),
  (service) => service.resolveArticleDownload(doi),
);
```

### `ArticleToolDependencies` second-arg convention
**Source:** `src/tools/article-tools.ts` line 106–110 (type) + lines 123, 156 (usage)
**Apply to:** `handleSingleArticleDownload`, `handleBatchArticleDownload` — both must match `(args, dependencies: ArticleToolDependencies)` signature
```typescript
export interface ArticleToolDependencies {
  config: AnnasConfig;
  fetchImpl?: FetchLike;
  baseUrlManager?: BaseUrlManager;
}
```

## No Analog Found

No files fall into this category. All additions are within `src/tools/article-tools.ts` and `tests/article-tools.test.ts`, both of which have direct analogs in the same file.

## Key Structural Constraints

These are not patterns to copy but constraints from CONTEXT.md and RESEARCH.md that shape how patterns are applied:

1. **`ArticleBatchResult` shape discipline** — `articleBatchResultSchema` (lines 92–98) marks `article` and `sources` as optional. The handler must enforce the CONTEXT.md rule: lookup-failure items include only `{ doi, error }` with no `article` or `sources` keys; the schema does not enforce this automatically.

2. **`isError` on batch result** — NEVER set `isError: true` on the `CallToolResult` for partial batch failures. Only set it for whole-batch pre-flight failures (invalid download path, etc.). This is the opposite of the single-DOI path which sets `isError: true` on `ArticleNotFoundError`.

3. **Two-stage ordering** — All lookups (`Promise.allSettled` stage 1) must settle before any downloads begin (`Promise.allSettled` stage 2). Do not interleave.

4. **`resolveDownloadRoot` called once** — Call before stage 1, not inside each DOI's download lambda.

## Metadata

**Analog search scope:** `src/tools/`, `src/anna/`, `tests/`
**Files scanned:** 4 (`article-tools.ts`, `article-tools.test.ts`, `tool-utils.ts`, `file-utils.ts`)
**Pattern extraction date:** 2026-05-20
