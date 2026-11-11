#!/usr/bin/env node
/** Overlay entry point — see src/overlay/server.ts for why this exists. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { parseServerArgs, helpText } from "@store-mcp/shared";
import { PLAY_PROFILES } from "../profiles.js";

async function main(): Promise<void> {
  const { workers, readOnly, help } = parseServerArgs(process.argv.slice(2));
  if (help) {
    process.stdout.write(helpText("@store-mcp/play-operate", [...PLAY_PROFILES]));
    process.exit(0);
  }
  const server = createServer({ workers, readOnly });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // Write to stderr so the transport on stdout isn't corrupted.
  console.error("[@store-mcp/play-operate] fatal:", err);
  process.exit(1);
});
