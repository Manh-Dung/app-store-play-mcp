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

test("createToolsSearchTool provides on-demand discovery", async () => {
  const tools: ToolLike[] = [
    makeTool("apps_get", "Retrieve app details"),
    makeTool("tracks_update", "Update release tracks"),
  ];

  const searchTool = createToolsSearchTool(tools);
  assert.equal(searchTool.name, "store_search_tools");

  const res = (await searchTool.handle({ query: "release" })) as {
    count: number;
    tools: Array<{ name: string; description: string }>;
  };

  assert.equal(res.count, 1);
  assert.equal(res.tools[0].name, "tracks_update");
});
