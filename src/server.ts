import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";

import { loadConfig, type AnnasConfig } from "./config";
import { registerArticleTools } from "./tools/article-tools";
import { registerBaseUrlTools } from "./tools/base-url-tools";
import { registerBookTools } from "./tools/book-tools";

export function createServer(config: AnnasConfig): McpServer {
  const server = new McpServer({
    name: "annas-mcp-ts",
    version: "0.1.0",
  });

  registerArticleTools(server, { config });
  registerBaseUrlTools(server, { config });
  registerBookTools(server, { config });

  return server;
}

export async function main(): Promise<void> {
  const server = createServer(loadConfig());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("annas-mcp-ts running on stdio");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
