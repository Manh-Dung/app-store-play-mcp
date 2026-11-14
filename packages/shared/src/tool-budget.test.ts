import test from "node:test";
import assert from "node:assert/strict";
import { limitToolsByBudget, searchTools, createToolsSearchTool } from "./tool-budget.js";
import type { ToolLike } from "./types.js";

const makeTool = (name: string, description: string = ""): ToolLike => ({
  name,
  description,
  inputSchema: {},
  handle: async () => ({ ok: true }),
});

test("limitToolsByBudget enforces maxTools cap without dropping alwaysKeep", () => {
  const tools: ToolLike[] = [
    makeTool("auth_status", "Check auth"),
    makeTool("deploy_app", "Deploy app"),
    makeTool("apps_get", "Get app"),
    makeTool("apps_list", "List apps"),
    makeTool("listings_get", "Get listing"),
    makeTool("listings_patch", "Patch listing"),
  ];

  const result = limitToolsByBudget(tools, {
    maxTools: 3,
    profileForTool: (n: string) => (n.startsWith("apps") ? ["apps"] : ["other"]),
    alwaysKeep: ["auth_status"],
    priorityTools: ["deploy_app"],
  });

  assert.equal(result.tools.length, 3);
  assert.equal(result.truncated, true);
  assert.equal(result.totalAvailable, 6);

  const names = result.tools.map((t: ToolLike) => t.name);
  assert.ok(names.includes("auth_status"), "must retain alwaysKeep");
  assert.ok(names.includes("deploy_app"), "must retain priorityTools");
});

test("searchTools filters by name and description keyword", () => {
  const tools: ToolLike[] = [
    makeTool("apps_get", "Retrieve application details"),
    makeTool("reviews_list", "List user feedback and reviews"),
    makeTool("tracks_update", "Update release tracks"),
  ];

  const found = searchTools(tools, "feedback");
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "reviews_list");

  const byName = searchTools(tools, "tracks");
  assert.equal(byName.length, 1);
  assert.equal(byName[0].name, "tracks_update");
});

test("createToolsSearchTool provides on-demand discovery and surfaces budget truncation", async () => {
  const tools: ToolLike[] = [
    makeTool("apps_get", "Retrieve app details"),
    makeTool("tracks_update", "Update release tracks"),
  ];

  // Without truncation
  const searchTool1 = createToolsSearchTool(tools);
  assert.equal(searchTool1.name, "store_search_tools");
  assert.ok(!searchTool1.description.includes("TOOL BUDGET TRUNCATION ACTIVE"));

  const res1 = (await searchTool1.handle({ query: "release" })) as {
    count: number;
    tools: Array<{ name: string; description: string }>;
    budgetStatus?: { truncated: boolean; notice: string };
  };
  assert.equal(res1.count, 1);
  assert.equal(res1.budgetStatus?.truncated, false);

  // With truncation (S8: agent visibility)
  const searchTool2 = createToolsSearchTool(tools, {
    truncated: true,
    loadedCount: 50,
    totalAvailable: 294,
  });
  assert.ok(searchTool2.description.includes("TOOL BUDGET TRUNCATION ACTIVE: 50/294"));
  assert.ok(searchTool2.description.includes("244 auxiliary tools omitted"));

  const res2 = (await searchTool2.handle({ query: "release" })) as {
    count: number;
    budgetStatus?: { truncated: boolean; loadedCount: number; notice: string };
  };
  assert.equal(res2.budgetStatus?.truncated, true);
  assert.equal(res2.budgetStatus?.loadedCount, 50);
  assert.ok(res2.budgetStatus?.notice.includes("50 of 294 total tools are loaded"));
});
