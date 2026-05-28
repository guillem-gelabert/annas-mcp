// scripts/token-eval.ts
// Runnable with: bun scripts/token-eval.ts
// Requires: claude CLI (OAuth-authenticated), ANNAS_SECRET_KEY
// Stdout: Markdown comparison table only
// Stderr: progress messages

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// SECTION 2 — Env validation
// ---------------------------------------------------------------------------

const annasSecretKey = process.env.ANNAS_SECRET_KEY?.trim();
if (!annasSecretKey) {
  process.stderr.write("[eval] ERROR: ANNAS_SECRET_KEY is not set or empty.\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SECTION 3 — Build Go binary (optional — skipped if `go` not in PATH)
// ---------------------------------------------------------------------------

const repoRoot = resolve(import.meta.dir, "..");
const goBinaryPath = resolve(repoRoot, "annas-mcp-go-eval-bin");
const goSourceDir = resolve(repoRoot, "annas-mcp-go");

let goAvailable = false;

// Use pre-built binary if present, otherwise build from source
const prebuilt = spawnSync("test", ["-x", goBinaryPath], { encoding: "utf8" });
if (prebuilt.status === 0) {
  process.stderr.write(`[eval] Using pre-built Go binary: ${goBinaryPath}\n`);
  goAvailable = true;
} else {
  const goWhich = spawnSync("which", ["go"], { encoding: "utf8" });
  if (goWhich.status === 0 && goWhich.stdout.trim()) {
    process.stderr.write("[eval] Building Go binary from source...\n");
    execSync(`go build -o "${goBinaryPath}" ./cmd/annas-mcp/`, {
      stdio: "inherit",
      cwd: goSourceDir,
    });
    process.stderr.write("[eval] Go binary ready.\n");
    goAvailable = true;
  } else {
    process.stderr.write("[eval] WARNING: no Go binary found and `go` not in PATH — skipping Go scenarios.\n");
  }
}

// ---------------------------------------------------------------------------
// SECTION 4 — Write MCP config files for claude CLI
// ---------------------------------------------------------------------------

const evalDir = join(tmpdir(), "annas-mcp-eval");
mkdirSync(evalDir, { recursive: true });

const downloadPath = join(evalDir, "downloads");
mkdirSync(downloadPath, { recursive: true });

const goConfigPath = join(evalDir, "go-mcp.json");
const tsConfigPath = join(evalDir, "ts-mcp.json");

const goMcpConfig = {
  mcpServers: {
    "eval-annas-go": {
      command: goBinaryPath,
      args: ["mcp"],
      env: {
        ANNAS_SECRET_KEY: annasSecretKey,
        ANNAS_DOWNLOAD_PATH: downloadPath,
        PATH: process.env.PATH ?? "",
      },
    },
  },
};

const tsMcpConfig = {
  mcpServers: {
    "eval-annas-ts": {
      command: process.execPath,
      args: [resolve(repoRoot, "src/server.ts")],
      env: {
        ANNAS_SECRET_KEY: annasSecretKey,
        PATH: process.env.PATH ?? "",
      },
    },
  },
};

writeFileSync(goConfigPath, JSON.stringify(goMcpConfig));
writeFileSync(tsConfigPath, JSON.stringify(tsMcpConfig));

// ---------------------------------------------------------------------------
// SECTION 5 — Token measurement via claude CLI
// ---------------------------------------------------------------------------

interface TokenResult { input: number; output: number; cacheCreate: number; cacheRead: number; total: number }

const SYSTEM_PROMPT = "You are a research assistant with access to Anna's Archive tools. Always use the available MCP tools to answer user questions about finding papers and books. Call the tools directly without asking for permission.";
const MODEL = "claude-haiku-4-5-20251001";

function runClaude(prompt: string, mcpConfigPath: string): TokenResult {
  const result = spawnSync(
    "claude",
    [
      "-p", prompt,
      "--strict-mcp-config", mcpConfigPath,
      "--dangerously-skip-permissions",
      "--system-prompt", SYSTEM_PROMPT,
      "--output-format", "json",
      "--model", MODEL,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 120_000 }
  );

  if (result.status !== 0 || !result.stdout) {
    throw new Error(`claude CLI failed (exit ${result.status}): ${result.stderr?.slice(0, 500)}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to parse claude output: ${result.stdout.slice(0, 500)}`);
  }

  if (parsed.is_error) {
    throw new Error(`claude returned error: ${JSON.stringify(parsed).slice(0, 300)}`);
  }

  const u = parsed.usage as Record<string, number> | undefined;
  if (!u) throw new Error("No usage field in claude output");

  const cacheCreate = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  return { input, output, cacheCreate, cacheRead, total: input + cacheCreate + cacheRead + output };
}

// ---------------------------------------------------------------------------
// SECTION 6 — Scenario definitions
// ---------------------------------------------------------------------------

const NO_DATA: TokenResult = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 };

type ScenarioResult = { label: string; go: TokenResult; ts: TokenResult; goSkipped: boolean };

const scenarios = [
  {
    label: "article_search — keyword",
    goPrompt: 'Search Anna\'s Archive for articles about "machine learning attention mechanism"',
    tsPrompt: 'Search Anna\'s Archive for articles about "machine learning attention mechanism"',
  },
  {
    label: "article_download — DOI (high confidence)",
    goPrompt: "Download the article with DOI 10.1038/s41586-021-03819-2",
    tsPrompt: "Download the article with DOI 10.1038/s41586-021-03819-2",
  },
  {
    label: "article_download — DOI (low confidence)",
    goPrompt: "Download the article with DOI 10.1016/j.cell.2023.01.001 titled 'Completely Different Title XYZ'",
    tsPrompt: "Download the article with DOI 10.1016/j.cell.2023.01.001 titled 'Completely Different Title XYZ'",
  },
  {
    label: "article_download — batch 5 DOIs (TS single call)",
    goPrompt: null,
    tsPrompt:
      "Download these 5 articles: 10.1038/nature12345, 10.1016/j.cell.2023.01.001, 10.1126/science.abc1234, 10.1073/pnas.2023001, 10.1371/journal.pone.0123456",
  },
  {
    label: "book_search — keyword",
    goPrompt: 'Search for books about "deep learning"',
    tsPrompt: 'Search for books about "deep learning"',
  },
  {
    label: "book_download — by MD5",
    goPrompt: "Download the book with MD5 hash deadbeef1234cafebabe5678deadbeef",
    tsPrompt: "Download the book with MD5 hash deadbeef1234cafebabe5678deadbeef",
  },
];

const batchDois = [
  "10.1038/nature12345",
  "10.1016/j.cell.2023.01.001",
  "10.1126/science.abc1234",
  "10.1073/pnas.2023001",
  "10.1371/journal.pone.0123456",
];

// ---------------------------------------------------------------------------
// SECTION 7 — Run scenarios
// ---------------------------------------------------------------------------

const results: ScenarioResult[] = [];

process.stderr.write("[eval] Running scenarios...\n");

try {
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    process.stderr.write(`[eval] Scenario ${i + 1}/6: ${scenario.label}\n`);

    if (i === 3) {
      // Batch scenario: TS gets one call with all 5 DOIs, Go gets 5 sequential calls
      process.stderr.write(`[eval]   TS: single batch call\n`);
      const tsResult = runClaude(scenario.tsPrompt!, tsConfigPath);

      if (!goAvailable) {
        results.push({ label: scenario.label, go: NO_DATA, ts: tsResult, goSkipped: true });
      } else {
        process.stderr.write(`[eval]   Go: 5 individual calls (summing tokens)\n`);
        const goSummed: TokenResult = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 };
        for (let n = 0; n < batchDois.length; n++) {
          process.stderr.write(`[eval]   Go call ${n + 1}/5: ${batchDois[n]}\n`);
          const r = runClaude(`Download the article with DOI ${batchDois[n]}`, goConfigPath);
          goSummed.input += r.input;
          goSummed.output += r.output;
          goSummed.cacheCreate += r.cacheCreate;
          goSummed.cacheRead += r.cacheRead;
          goSummed.total += r.total;
        }
        results.push({ label: scenario.label, go: goSummed, ts: tsResult, goSkipped: false });
      }
    } else if (!goAvailable) {
      process.stderr.write(`[eval]   Running TS only (Go skipped)...\n`);
      const tsResult = runClaude(scenario.tsPrompt!, tsConfigPath);
      results.push({ label: scenario.label, go: NO_DATA, ts: tsResult, goSkipped: true });
    } else {
      process.stderr.write(`[eval]   Running Go...\n`);
      const goResult = runClaude(scenario.goPrompt!, goConfigPath);
      process.stderr.write(`[eval]   Running TS...\n`);
      const tsResult = runClaude(scenario.tsPrompt!, tsConfigPath);
      results.push({ label: scenario.label, go: goResult, ts: tsResult, goSkipped: false });
    }
  }
} finally {
  // Clean up config files (contain secret key)
  try { rmSync(goConfigPath); } catch { /* ignore */ }
  try { rmSync(tsConfigPath); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// SECTION 8 — Print Markdown table
// ---------------------------------------------------------------------------

const date = new Date().toISOString().slice(0, 10);

const totalGo: TokenResult = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 };
const totalTs: TokenResult = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 };

for (const r of results) {
  totalGo.input += r.go.input;
  totalGo.output += r.go.output;
  totalGo.cacheCreate += r.go.cacheCreate;
  totalGo.cacheRead += r.go.cacheRead;
  totalGo.total += r.go.total;
  totalTs.input += r.ts.input;
  totalTs.output += r.ts.output;
  totalTs.cacheCreate += r.ts.cacheCreate;
  totalTs.cacheRead += r.ts.cacheRead;
  totalTs.total += r.ts.total;
}

const fmt = (n: number) => n.toLocaleString();
const ratio = (ts: number, go: number) =>
  go === 0 ? "N/A" : (ts / go).toFixed(2) + "x";

console.log(`## Token Eval: Go vs TS MCP Server`);
console.log(``);
console.log(`Generated: ${date} | Model: ${MODEL}`);
console.log(`> Token columns: \`in\` = input, \`cc\` = cache-create, \`cr\` = cache-read, \`out\` = output, \`total\` = sum`);
console.log(``);
console.log(`| # | Scenario | Go in | Go cc | Go out | Go total | TS in | TS cc | TS out | TS total | Ratio |`);
console.log(`|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);

const anyGoSkipped = results.some((r) => r.goSkipped);

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const label = i === 3 && !r.goSkipped ? r.label + " *(Go = 5×single)*" : r.label;
  const goIn = r.goSkipped ? "N/A" : fmt(r.go.input);
  const goCc = r.goSkipped ? "N/A" : fmt(r.go.cacheCreate);
  const goOut = r.goSkipped ? "N/A" : fmt(r.go.output);
  const goTot = r.goSkipped ? "N/A" : fmt(r.go.total);
  const rat = r.goSkipped ? "N/A" : ratio(r.ts.total, r.go.total);
  console.log(
    `| ${i + 1} | ${label} | ${goIn} | ${goCc} | ${goOut} | ${goTot} | ${fmt(r.ts.input)} | ${fmt(r.ts.cacheCreate)} | ${fmt(r.ts.output)} | ${fmt(r.ts.total)} | ${rat} |`
  );
}

const goTotalStr = anyGoSkipped ? "N/A" : fmt(totalGo.total);
const overallRatio = anyGoSkipped ? "N/A" : ratio(totalTs.total, totalGo.total);
console.log(
  `| | **Total** | | | | **${goTotalStr}** | ${fmt(totalTs.input)} | ${fmt(totalTs.cacheCreate)} | ${fmt(totalTs.output)} | **${fmt(totalTs.total)}** | **${overallRatio}** |`
);
