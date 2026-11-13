/**
 * Overlay server for @store-mcp/play-operate.
 *
 * This file lives in src/overlay/ on purpose: upstream src/server.ts and
 * src/index.ts are left untouched so `git subtree pull` merges cleanly.
 * Only package.json (name/bin) points the entry point here.
 *
 * It re-implements the tiny upstream server wiring (ListTools/CallTool)
 * around upstream `allTools`, adding the shared filter:
 *  --workers profiles, --read-only, destructive gate, output redaction.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { allTools } from "../tools/index.js";
import { compositeTools } from "../composite/index.js";
import {
  filterTools,
  destructiveGate,
  translateError,
  limitToolsByBudget,
  createToolsSearchTool,
} from "@store-mcp/shared";
import { profileForTool } from "../profiles.js";

export interface ServerOptions {
  workers?: string[];
  readOnly?: boolean;
  maxTools?: number;
}

const ALWAYS_KEEP = [
  "accounts_list",
  "accounts_current",
  "accounts_add",
  "accounts_remove",
  "accounts_switch",
  "accounts_update",
  "auth_status",
  "store_search_tools",
];

const PRIORITY_TOOLS = compositeTools.map((t) => t.name);

export function createServer(options: ServerOptions = {}): Server {
  const combinedTools = [...compositeTools, ...allTools];

  const { tools: filteredTools, blocked } = filterTools(combinedTools, {
    workers: options.workers,
    readOnly: options.readOnly,
    profileForTool,
    alwaysKeep: ALWAYS_KEEP,
  });

  const searchTool = createToolsSearchTool(combinedTools);
  const toolsWithSearch = [searchTool, ...filteredTools];

  const budgetResult = limitToolsByBudget(toolsWithSearch, {
    maxTools: options.maxTools,
    profileForTool,
    alwaysKeep: ALWAYS_KEEP,
    priorityTools: PRIORITY_TOOLS,
  });
  const visibleTools = budgetResult.tools;

  const blockedByName = new Map(blocked.map((b) => [b.name, b.reason]));
  const byName = new Map(visibleTools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "@store-mcp/play-operate", version: "0.2.0-fork.1" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: visibleTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const blockedReason = blockedByName.get(name);
    if (blockedReason) {
      return {
        content: [{ type: "text", text: `Tool "${name}" is blocked: ${blockedReason}.` }],
        isError: true,
      };
    }
    const gate = destructiveGate(name, request.params.arguments ?? {});
    if (gate) {
      return { content: [{ type: "text", text: gate }], isError: true };
    }
    const tool = byName.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await tool.handle(request.params.arguments ?? {})) as any;
    } catch (err) {
      return { content: [{ type: "text", text: translateError(err) }], isError: true };
    }
  });

  return server;
}
