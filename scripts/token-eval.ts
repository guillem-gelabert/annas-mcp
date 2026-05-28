// scripts/token-eval.ts
// Runnable with: bun scripts/token-eval.ts
// Stdout: Markdown comparison table only
// Stderr: progress messages

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// SECTION 2 — Env validation
// ---------------------------------------------------------------------------

const annasSecretKey = process.env.ANNAS_SECRET_KEY?.trim();
const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();

if (!annasSecretKey) {
  process.stderr.write("[eval] ERROR: ANNAS_SECRET_KEY is not set or empty.\n");
  process.exit(1);
}

if (!anthropicApiKey) {
  process.stderr.write("[eval] ERROR: ANTHROPIC_API_KEY is not set or empty.\n");
  process.exit(1);
}

const downloadPath = process.env.ANNAS_DOWNLOAD_PATH?.trim() || `${tmpdir()}/annas-eval`;
mkdirSync(downloadPath, { recursive: true });

// ---------------------------------------------------------------------------
// SECTION 3 — Build Go binary
// ---------------------------------------------------------------------------

const repoRoot = resolve(import.meta.dir, "..");
const goBinaryPath = resolve(repoRoot, "annas-mcp-go-eval-bin");

process.stderr.write("[eval] Building Go binary...\n");
execSync(`go build -o ${goBinaryPath} ./cmd/annas-mcp/`, {
  stdio: "inherit",
  cwd: resolve(repoRoot, "annas-mcp-go"),
});
process.stderr.write("[eval] Go binary ready.\n");

// ---------------------------------------------------------------------------
// SECTION 4 — connectServer helper
// ---------------------------------------------------------------------------

async function connectServer(label: string, params: StdioServerParameters): Promise<Client> {
  const client = new Client({ name: "token-eval", version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport(params);
  transport.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[${label}] ${d.toString()}`)
  );
  await client.connect(transport);
  process.stderr.write(`[eval] ${label} server connected.\n`);
  return client;
}

// ---------------------------------------------------------------------------
// SECTION 5 — Spawn both servers
// ---------------------------------------------------------------------------

const [goClient, tsClient] = await Promise.all([
  connectServer("go", {
    command: goBinaryPath,
    stderr: "pipe",
    env: {
      ANNAS_SECRET_KEY: annasSecretKey,
      ANNAS_DOWNLOAD_PATH: downloadPath,
      PATH: process.env.PATH ?? "",
    },
  }),
  connectServer("ts", {
    command: "bun",
    args: ["src/server.ts"],
    cwd: repoRoot,
    stderr: "pipe",
    env: {
      ANNAS_SECRET_KEY: annasSecretKey,
      PATH: process.env.PATH ?? "",
    },
  }),
]);

// ---------------------------------------------------------------------------
// SECTION 6 — Fetch tool definitions
// ---------------------------------------------------------------------------

async function getAnthropicTools(client: Client): Promise<Anthropic.Tool[]> {
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));
}

const [goTools, tsTools] = await Promise.all([
  getAnthropicTools(goClient),
  getAnthropicTools(tsClient),
]);

// ---------------------------------------------------------------------------
// SECTION 7 — Scenario definitions
// ---------------------------------------------------------------------------

type TokenResult = { input: number; output: number; total: number };
type ScenarioResult = { label: string; go: TokenResult; ts: TokenResult };

const scenarios = [
  { label: 'article_search — keyword', prompt: 'Search for articles about "machine learning attention mechanism"' },
  { label: 'article_download — DOI match', prompt: 'Download the article with DOI 10.1038/nature12345' },
  { label: 'article_download — DOI low confidence', prompt: 'Download the article with DOI 10.1016/j.cell.2023.01.001' },
  { label: 'article_download — batch 5 DOIs', prompt: 'Download these 5 articles: 10.1038/nature12345, 10.1016/j.cell.2023.01.001, 10.1126/science.abc1234, 10.1073/pnas.2023001, 10.1371/journal.pone.0123456' },
  { label: 'book_search — keyword', prompt: 'Search for books about "deep learning Goodfellow"' },
  { label: 'book_download — hash fixture', prompt: 'Download the book with hash deadbeef1234cafebabe5678' },
];

const anthropic = new Anthropic({ apiKey: anthropicApiKey });

async function runScenario(
  client: Client,
  tools: Anthropic.Tool[],
  prompt: string,
): Promise<TokenResult> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools,
    messages: [{ role: "user", content: prompt }],
  });
  return {
    input: msg.usage.input_tokens,
    output: msg.usage.output_tokens,
    total: msg.usage.input_tokens + msg.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// SECTION 8 — Run scenarios
// ---------------------------------------------------------------------------

// DOIs for the batch scenario (extracted from scenario 4 prompt)
const batchDois = [
  '10.1038/nature12345',
  '10.1016/j.cell.2023.01.001',
  '10.1126/science.abc1234',
  '10.1073/pnas.2023001',
  '10.1371/journal.pone.0123456',
];

const results: ScenarioResult[] = [];

try {
  process.stderr.write("[eval] Running scenarios...\n");

  // Scenarios 1, 2, 3, 5, 6: parallel Go + TS
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    process.stderr.write(`[eval] Scenario ${i + 1}: ${scenario.label}\n`);

    if (i === 3) {
      // Scenario 4: TS gets one batch call; Go gets 5 sequential single-DOI calls
      const tsResult = await runScenario(tsClient, tsTools, scenario.prompt);

      const goSummed: TokenResult = { input: 0, output: 0, total: 0 };
      for (let n = 0; n < batchDois.length; n++) {
        process.stderr.write(`[eval] Go scenario 4 — call ${n + 1}/5\n`);
        const goSingle = await runScenario(
          goClient,
          goTools,
          `Download the article with DOI ${batchDois[n]}`,
        );
        goSummed.input += goSingle.input;
        goSummed.output += goSingle.output;
        goSummed.total += goSingle.total;
      }

      results.push({ label: scenario.label, go: goSummed, ts: tsResult });
    } else {
      const [goResult, tsResult] = await Promise.all([
        runScenario(goClient, goTools, scenario.prompt),
        runScenario(tsClient, tsTools, scenario.prompt),
      ]);
      results.push({ label: scenario.label, go: goResult, ts: tsResult });
    }
  }
} finally {
  await Promise.allSettled([goClient.close(), tsClient.close()]);
}

// ---------------------------------------------------------------------------
// SECTION 9 — Print Markdown table
// ---------------------------------------------------------------------------

const date = new Date().toISOString().slice(0, 10);

const totalGo: TokenResult = { input: 0, output: 0, total: 0 };
const totalTs: TokenResult = { input: 0, output: 0, total: 0 };
for (const r of results) {
  totalGo.input += r.go.input;
  totalGo.output += r.go.output;
  totalGo.total += r.go.total;
  totalTs.input += r.ts.input;
  totalTs.output += r.ts.output;
  totalTs.total += r.ts.total;
}

const overallRatio = (totalTs.total / totalGo.total).toFixed(2) + "x";

console.log(`## Token Eval: Go vs TS MCP Server`);
console.log(``);
console.log(`Generated: ${date}`);
console.log(``);
console.log(`| # | Scenario | Go in | Go out | Go total | TS in | TS out | TS total | Ratio (TS/Go) |`);
console.log(`|---|---|---:|---:|---:|---:|---:|---:|---:|`);

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const ratio = (r.ts.total / r.go.total).toFixed(2) + "x";
  console.log(`| ${i + 1} | ${r.label} | ${r.go.input} | ${r.go.output} | ${r.go.total} | ${r.ts.input} | ${r.ts.output} | ${r.ts.total} | ${ratio} |`);
}

console.log(`| **Total** | | ${totalGo.input} | ${totalGo.output} | ${totalGo.total} | ${totalTs.input} | ${totalTs.output} | ${totalTs.total} | ${overallRatio} |`);
