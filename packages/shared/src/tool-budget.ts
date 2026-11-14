import type { ToolLike, ToolBudgetOptions, ToolBudgetResult } from "./types.js";

/**
 * Filter tools by search keyword against name and description.
 */
export function searchTools<T extends { name: string; description?: string }>(
  tools: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;

  return tools.filter((tool) => {
    const nameMatch = tool.name.toLowerCase().includes(q);
    const descMatch = (tool.description ?? "").toLowerCase().includes(q);
    return nameMatch || descMatch;
  });
}

/**
 * Enforce tool budget limits to prevent client context window bloat.
 * Priority order:
 * 1. alwaysKeep tools (e.g. auth_status, store_search_tools)
 * 2. priorityTools (e.g. high-level composite tools: deploy_app, promote_release)
 * 3. remaining matching tools up to maxTools
 */
export function limitToolsByBudget<T extends ToolLike>(
  tools: T[],
  options: ToolBudgetOptions,
): ToolBudgetResult<T> {
  const {
    maxTools,
    workers,
    search,
    profileForTool,
    alwaysKeep = [],
    priorityTools = [],
  } = options;

  const alwaysSet = new Set(alwaysKeep.map((k) => k.toLowerCase()));
  const prioritySet = new Set(priorityTools.map((p) => p.toLowerCase()));
  const workerList = (workers ?? []).map((w) => w.trim().toLowerCase()).filter(Boolean);
  const wantAll = workerList.length === 0 || workerList.includes("full");

  // Step 1: Filter by workers profile if requested
  let filtered = tools.filter((tool) => {
    const name = tool.name.toLowerCase();
    if (alwaysSet.has(name) || prioritySet.has(name)) {
      return true;
    }
    if (wantAll) {
      return true;
    }
    const profiles = profileForTool(tool.name).map((p) => p.toLowerCase());
    return profiles.some((p) => workerList.includes(p));
  });

  // Step 2: Filter by search keyword if requested
  if (search) {
    filtered = searchTools(filtered, search);
  }

  const totalAvailable = filtered.length;

  if (!maxTools || maxTools <= 0 || totalAvailable <= maxTools) {
    return {
      tools: filtered,
      totalAvailable,
      truncated: false,
    };
  }

  // Step 3: Prioritize tools when budget is exceeded (alwaysKeep > priorityTools > general)
  const mustKeep: T[] = [];
  const rest: T[] = [];

  for (const tool of filtered) {
    if (alwaysSet.has(tool.name.toLowerCase())) {
      mustKeep.push(tool);
    } else {
      rest.push(tool);
    }
  }

  rest.sort((a, b) => {
    const aPri = prioritySet.has(a.name.toLowerCase()) ? 0 : 1;
    const bPri = prioritySet.has(b.name.toLowerCase()) ? 0 : 1;
    return aPri - bPri;
  });

  const selected: T[] = [
    ...mustKeep,
    ...rest.slice(0, Math.max(0, maxTools - mustKeep.length)),
  ];

  return {
    tools: selected,
    totalAvailable,
    truncated: selected.length < totalAvailable,
  };
}

/**
 * Meta-tool: allows the Agent to search and discover tools dynamically
 * across the entire 1300+ catalog when a tool was omitted due to budget limits.
 */
export function createToolsSearchTool(allTools: ToolLike[]): ToolLike {
  return {
    name: "store_search_tools",
    description:
      "Search the complete tool registry by keyword (in tool name or description). Use this to discover specific low-level or auxiliary tools not currently loaded in the active context window.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keyword to search for (e.g. 'refund', 'subscription', 'bundle', 'testers')",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 20)",
        },
      },
      required: ["query"],
    },
    handle: async (args: unknown) => {
      const { query, limit = 20 } = (args ?? {}) as { query: string; limit?: number };
      const matches = searchTools(allTools, query);
      const capped = matches.slice(0, Math.min(limit, 50));

      return {
        query,
        count: capped.length,
        totalFound: matches.length,
        tools: capped.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    },
  };
}

