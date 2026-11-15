import fs from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  filterTools,
  destructiveGate,
  translateError,
  limitToolsByBudget,
  createToolsSearchTool,
  type ToolLike,
} from "@store-mcp/shared";

import { allTools as playAllTools } from "@store-mcp/play-operate/dist/tools/index.js";
import { compositeTools as playCompositeTools } from "@store-mcp/play-operate/dist/composite/index.js";
import {
  PLAY_PROFILES,
  profileForTool as playProfileForTool,
} from "@store-mcp/play-operate/dist/profiles.js";
import {
  getCurrentAccount as getPlayCurrentAccount,
  addAccount as addPlayAccount,
  loadAccounts as loadPlayAccounts,
} from "@store-mcp/play-operate/dist/auth/account-store.js";

import { allTools as appStoreAllTools } from "@store-mcp/appstore-operate/dist/tools/index.js";
import { compositeTools as appStoreCompositeTools } from "@store-mcp/appstore-operate/dist/composite/index.js";
import {
  APPSTORE_PROFILES,
  profileForTool as appStoreProfileForTool,
} from "@store-mcp/appstore-operate/dist/profiles.js";
import { loadAccounts as loadAppStoreAccounts } from "@store-mcp/appstore-operate/dist/auth/account-store.js";

import { AnalyticsBridge } from "./analytics-bridge.js";

export type StoreName = "play" | "appstore" | "analytics";
export const ALL_STORES: StoreName[] = ["play", "appstore", "analytics"];

export const ALL_PROFILES = [
  ...new Set([...PLAY_PROFILES, ...APPSTORE_PROFILES, "analytics"]),
] as const;

export interface GatewayOptions {
  stores?: StoreName[];
  workers?: string[];
  readOnly?: boolean;
  maxTools?: number;
  rootDir?: string;
}

const ALWAYS_KEEP = [
  "accounts_list",
  "auth_status",
  "play_accounts_list",
  "play_accounts_current",
  "play_accounts_add",
  "play_accounts_remove",
  "play_accounts_switch",
  "play_accounts_update",
  "play_auth_status",
  "appstore_accounts_list",
  "appstore_accounts_current",
  "appstore_accounts_add",
  "appstore_accounts_remove",
  "appstore_accounts_switch",
  "appstore_accounts_update",
  "appstore_auth_status",
  "appstore_auth_revoke_cache",
  "store_search_tools",
];

function ensurePlayEnvAccount(): void {
  const envKey =
    process.env.PLAY_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!getPlayCurrentAccount() && envKey && fs.existsSync(envKey)) {
    try {
      addPlayAccount({
        name: "env-default",
        keyFile: envKey,
        description: "Auto-registered from environment variable",
      });
    } catch {
      // Ignore if directory not writable
    }
  }
}

export function parseGatewayArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): GatewayOptions & { help: boolean } {
  const workers: string[] = [];
  const stores: StoreName[] = [];
  let readOnly =
    env.STORE_MCP_READ_ONLY === "1" || env.STORE_MCP_READ_ONLY === "true";
  let maxTools = env.STORE_MCP_MAX_TOOLS
    ? parseInt(env.STORE_MCP_MAX_TOOLS, 10)
    : undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      help = true;
    } else if (a === "--read-only") {
      readOnly = true;
    } else if (a === "--stores" && argv[i + 1]) {
      const parts = argv[++i].split(",").map((s) => s.trim().toLowerCase());
      for (const p of parts) {
        if (p === "all") stores.push(...ALL_STORES);
        else if (ALL_STORES.includes(p as StoreName)) stores.push(p as StoreName);
      }
    } else if (a.startsWith("--stores=")) {
      const parts = a
        .slice("--stores=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase());
      for (const p of parts) {
        if (p === "all") stores.push(...ALL_STORES);
        else if (ALL_STORES.includes(p as StoreName)) stores.push(p as StoreName);
      }
    } else if (a === "--workers" && argv[i + 1]) {
      workers.push(...argv[++i].split(","));
    } else if (a.startsWith("--workers=")) {
      workers.push(...a.slice("--workers=".length).split(","));
    } else if (a === "--max-tools" && argv[i + 1]) {
      maxTools = parseInt(argv[++i], 10);
    } else if (a.startsWith("--max-tools=")) {
      maxTools = parseInt(a.slice("--max-tools=".length), 10);
    }
  }

  if (env.STORE_MCP_STORES) {
    const parts = env.STORE_MCP_STORES.split(",").map((s) => s.trim().toLowerCase());
    for (const p of parts) {
      if (p === "all") stores.push(...ALL_STORES);
      else if (ALL_STORES.includes(p as StoreName)) stores.push(p as StoreName);
    }
  }

  if (env.STORE_MCP_WORKERS) {
    workers.push(...env.STORE_MCP_WORKERS.split(","));
  }

  const selectedStores = stores.length > 0 ? [...new Set(stores)] : [...ALL_STORES];

  return {
    stores: selectedStores,
    workers: workers.map((w) => w.trim()).filter(Boolean),
    readOnly,
    maxTools: maxTools && !isNaN(maxTools) && maxTools > 0 ? maxTools : undefined,
    help,
  };
}

export function gatewayHelpText(): string {
  return [
    `@store-mcp/monorepo — Unified MCP Gateway for Google Play & Apple App Store`,
    ``,
    `Usage: node bin/store-mcp.js [--stores play,appstore,analytics] [--workers <profiles>] [--read-only] [--max-tools N] [--help]`,
    ``,
    `  --stores <list>    Stores to enable: play, appstore, analytics, or all (default: all)`,
    `  --workers <list>   Filter tools by profiles: ${ALL_PROFILES.join(", ")}, or "full"`,
    `  --read-only        Block all mutating/write tools across all stores`,
    `  --max-tools <num>  Cap number of registered tools to keep LLM context lean`,
    `  --help             Show this help message and exit`,
    ``,
    `Env: STORE_MCP_STORES, STORE_MCP_WORKERS, STORE_MCP_READ_ONLY=1, STORE_MCP_MAX_TOOLS=N, STORE_MCP_ALLOW_DESTRUCTIVE=1`,
    ``,
  ].join("\n");
}

export async function createGatewayServer(
  options: GatewayOptions = {},
): Promise<{ server: Server; close: () => Promise<void> }> {
  const rootDir = options.rootDir || process.cwd();
  const activeStores = options.stores && options.stores.length > 0 ? options.stores : ALL_STORES;

  const rawTools: ToolLike[] = [];
  const toolSourceMap = new Map<
    string,
    { source: StoreName; originalName: string }
  >();

  // 1. Google Play Operate
  if (activeStores.includes("play")) {
    ensurePlayEnvAccount();
    const playTools = [...playCompositeTools, ...playAllTools];
    for (const t of playTools as ToolLike[]) {
      let registeredName = t.name;
      let description = t.description;

      if (t.name.startsWith("accounts_")) {
        registeredName = `play_${t.name}`;
        description = t.description ? `[Google Play] ${t.description}` : "[Google Play] Account tool";
      } else if (t.name === "auth_status") {
        registeredName = "play_auth_status";
        description = "[Google Play] Check Play Console service account credentials status";
      } else if (t.name === "aso_audit_portfolio") {
        registeredName = "play_aso_audit_portfolio";
        description = t.description ? `[Google Play] ${t.description}` : "[Google Play] ASO Audit";
      } else if (t.name === "metadata_dry_run_preview") {
        registeredName = "play_metadata_dry_run_preview";
        description = t.description ? `[Google Play] ${t.description}` : "[Google Play] Metadata Preview";
      }

      toolSourceMap.set(registeredName, { source: "play", originalName: t.name });
      rawTools.push({
        name: registeredName,
        description,
        inputSchema: t.inputSchema,
        handle: t.handle,
      });
    }
  }

  // 2. Apple App Store Operate
  if (activeStores.includes("appstore")) {
    const appStoreTools = [...appStoreCompositeTools, ...appStoreAllTools];
    for (const t of appStoreTools as ToolLike[]) {
      let registeredName = t.name;
      let description = t.description;

      if (t.name.startsWith("accounts_")) {
        registeredName = `appstore_${t.name}`;
        description = t.description ? `[App Store] ${t.description}` : "[App Store] Account tool";
      } else if (t.name === "auth_status") {
        registeredName = "appstore_auth_status";
        description = "[App Store] Check App Store Connect API key status";
      } else if (t.name === "auth_revoke_cache") {
        registeredName = "appstore_auth_revoke_cache";
        description = "[App Store] Invalidate cached App Store Connect JWT token";
      } else if (t.name === "aso_audit_portfolio") {
        registeredName = "appstore_aso_audit_portfolio";
        description = t.description ? `[App Store] ${t.description}` : "[App Store] ASO Audit";
      } else if (t.name === "metadata_dry_run_preview") {
        registeredName = "appstore_metadata_dry_run_preview";
        description = t.description ? `[App Store] ${t.description}` : "[App Store] Metadata Preview";
      }

      toolSourceMap.set(registeredName, {
        source: "appstore",
        originalName: t.name,
      });
      rawTools.push({
        name: registeredName,
        description,
        inputSchema: t.inputSchema,
        handle: t.handle,
      });
    }
  }

  // 3. Play Analytics Bridge
  let analyticsBridge: AnalyticsBridge | null = null;
  if (activeStores.includes("analytics")) {
    analyticsBridge = new AnalyticsBridge({ rootDir });
    const analyticsTools = await analyticsBridge.connect();
    for (const t of analyticsTools) {
      toolSourceMap.set(t.name, {
        source: "analytics",
        originalName: t.name,
      });
      rawTools.push(t);
    }
  }

  // 4. Unified Meta-Tools (accounts_list & auth_status)
  const unifiedAccountsTool: ToolLike = {
    name: "accounts_list",
    description:
      "List configured accounts across both Google Play Console and Apple App Store Connect",
    inputSchema: {
      type: "object",
      properties: {
        store: {
          type: "string",
          enum: ["all", "play", "appstore"],
          description: "Which store accounts to list (default: all)",
        },
      },
    },
    handle: async (args: unknown) => {
      const a = (args && typeof args === "object" ? args : {}) as Record<
        string,
        unknown
      >;
      const storeTarget = (a.store as string) || "all";
      const result: Record<string, unknown> = {};

      if (storeTarget === "all" || storeTarget === "play") {
        try {
          result.play = loadPlayAccounts();
        } catch (err) {
          result.play = { error: (err as Error).message };
        }
      }

      if (storeTarget === "all" || storeTarget === "appstore") {
        try {
          result.appstore = loadAppStoreAccounts();
        } catch (err) {
          result.appstore = { error: (err as Error).message };
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };

  const unifiedAuthTool: ToolLike = {
    name: "auth_status",
    description:
      "Check authentication and credential status for both Google Play Console and Apple App Store Connect",
    inputSchema: {
      type: "object",
      properties: {
        store: {
          type: "string",
          enum: ["all", "play", "appstore"],
          description: "Which store credentials to check (default: all)",
        },
      },
    },
    handle: async (args: unknown) => {
      const a = (args && typeof args === "object" ? args : {}) as Record<
        string,
        unknown
      >;
      const target = (a.store as string) || "all";
      const results: Record<string, unknown> = {};

      if (target === "all" || target === "play") {
        const playTool = rawTools.find((t) => t.name === "play_auth_status");
        if (playTool) {
          try {
            results.play = await playTool.handle({});
          } catch (err) {
            results.play = { error: (err as Error).message };
          }
        } else {
          results.play = { status: "not_loaded" };
        }
      }

      if (target === "all" || target === "appstore") {
        const appStoreTool = rawTools.find(
          (t) => t.name === "appstore_auth_status",
        );
        if (appStoreTool) {
          try {
            results.appstore = await appStoreTool.handle({});
          } catch (err) {
            results.appstore = { error: (err as Error).message };
          }
        } else {
          results.appstore = { status: "not_loaded" };
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  };

  rawTools.push(unifiedAccountsTool);
  rawTools.push(unifiedAuthTool);

  // Profile resolution for unified tools
  function profileForTool(name: string): string[] {
    if (name === "accounts_list" || name === "auth_status") return ["apps"];
    if (name.startsWith("play_accounts_") || name.startsWith("appstore_accounts_")) return ["apps"];
    if (name === "play_auth_status" || name === "appstore_auth_status" || name === "appstore_auth_revoke_cache") return ["apps"];
    if (name === "play_aso_audit_portfolio" || name === "play_metadata_dry_run_preview") return ["listings"];
    if (name === "appstore_aso_audit_portfolio" || name === "appstore_metadata_dry_run_preview") return ["marketing"];

    const meta = toolSourceMap.get(name);
    if (!meta) return ["apps"];

    if (meta.source === "play") return playProfileForTool(meta.originalName);
    if (meta.source === "appstore") return appStoreProfileForTool(meta.originalName);
    if (meta.source === "analytics") return ["analytics"];

    return ["apps"];
  }

  // Priority tools for budgeting
  const priorityTools = [
    "accounts_list",
    "auth_status",
    "deploy_app",
    "create_release",
    "promote_release",
    "update_rollout",
    "halt_rollout",
    "aso_audit_app",
    "play_aso_audit_portfolio",
    "appstore_aso_audit_portfolio",
    "play_metadata_dry_run_preview",
    "appstore_metadata_dry_run_preview",
    "testflight_feedback_summary",
    "testflight_crash_reports",
    "list_apps",
    "get_acquisitions_by_traffic_source",
    "get_installs",
    "get_crashes",
  ];

  // Apply worker profile & read-only filtering
  const { tools: filteredTools, blocked } = filterTools(rawTools, {
    workers: options.workers,
    readOnly: options.readOnly,
    profileForTool,
    alwaysKeep: ALWAYS_KEEP,
  });

  // Apply context budget limit
  const budgetResult = limitToolsByBudget(filteredTools, {
    maxTools: options.maxTools,
    profileForTool,
    alwaysKeep: ALWAYS_KEEP,
    priorityTools,
  });

  // Add smart tool search
  const searchTool = createToolsSearchTool(rawTools, {
    truncated: budgetResult.truncated,
    loadedCount: budgetResult.tools.length,
    totalAvailable: budgetResult.totalAvailable,
  });

  const visibleTools = [searchTool, ...budgetResult.tools];
  const blockedByName = new Map(blocked.map((b) => [b.name, b.reason]));
  const byName = new Map(visibleTools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "@store-mcp/gateway", version: "0.1.0" },
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
        content: [
          { type: "text", text: `Tool "${name}" is blocked: ${blockedReason}.` },
        ],
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
      return {
        content: [{ type: "text", text: translateError(err) }],
        isError: true,
      };
    }
  });

  return {
    server,
    close: async () => {
      if (analyticsBridge) {
        await analyticsBridge.close();
      }
    },
  };
}
