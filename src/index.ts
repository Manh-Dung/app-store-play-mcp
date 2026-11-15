#!/usr/bin/env node
/**
 * Unified gateway entry point for @store-mcp/monorepo.
 * Aggregates play-operate, appstore-operate, and play-analytics into a single MCP server.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createGatewayServer,
  parseGatewayArgs,
  gatewayHelpText,
} from "./gateway.js";

async function main(): Promise<void> {
  const options = parseGatewayArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(gatewayHelpText());
    process.exit(0);
  }

  const { server, close } = await createGatewayServer(options);
  const transport = new StdioServerTransport();

  const cleanup = async () => {
    try {
      await close();
    } catch {
      // Ignore cleanup error
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await server.connect(transport);
}

main().catch((err) => {
  console.error("[store-mcp gateway] fatal:", err);
  process.exit(1);
});
