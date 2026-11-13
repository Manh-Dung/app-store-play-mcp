#!/usr/bin/env node
/** Overlay entry point — see src/overlay/server.ts for why this exists. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { parseServerArgs, helpText } from "@store-mcp/shared";
import { APPSTORE_PROFILES } from "../profiles.js";

async function main(): Promise<void> {
  const { workers, readOnly, maxTools, help } = parseServerArgs(process.argv.slice(2));
  if (help) {
    process.stdout.write(helpText("@store-mcp/appstore-operate", [...APPSTORE_PROFILES]));
    process.exit(0);
  }
  const server = createServer({ workers, readOnly, maxTools });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[@store-mcp/appstore-operate] fatal: ${(err as Error).stack ?? err}\n`,
  );
  process.exit(1);
});
