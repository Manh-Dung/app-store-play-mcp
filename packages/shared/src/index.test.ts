/** Minimal smoke checks for @store-mcp/shared — run via `npm test` after build. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isWriteTool,
  isDestructiveTool,
  filterTools,
  destructiveGate,
  redact,
  parseServerArgs,
} from "./index.js";

test("isWriteTool classifies reads vs writes", () => {
  assert.equal(isWriteTool("reviews_list"), false);
  assert.equal(isWriteTool("reviews_reply"), true);
  assert.equal(isWriteTool("tracks_update"), true);
  assert.equal(isWriteTool("apps_list"), false);
  assert.equal(isWriteTool("auth_status"), false);
});

test("isDestructiveTool", () => {
  assert.equal(isDestructiveTool("listings_delete"), true);
  assert.equal(isDestructiveTool("listings_update"), false);
});

test("filterTools enforces read-only and workers", () => {
  const tools = [
    { name: "apps_list", description: "", inputSchema: {}, handle: async () => "ok" },
    { name: "reviews_reply", description: "", inputSchema: {}, handle: async () => "ok" },
  ];
  const r = filterTools(tools, { readOnly: true, profileForTool: (n) => (n.startsWith("apps") ? ["apps"] : ["reviews"]) });
  assert.deepEqual(r.tools.map((t) => t.name), ["apps_list"]);
  assert.equal(r.blocked.length, 1);
});

test("destructiveGate requires opt-in or confirm", () => {
  assert.ok(destructiveGate("listings_delete", {}, {}) !== null);
  assert.equal(destructiveGate("listings_delete", { confirm: true }, {}), null);
  assert.equal(destructiveGate("listings_delete", {}, { STORE_MCP_ALLOW_DESTRUCTIVE: "1" }), null);
  assert.equal(destructiveGate("apps_list", {}, {}), null);
});

test("redact hides JWT and PEM", () => {
  assert.ok(!redact("token eyJabc.eyJdef.ghi").includes("eyJabc"));
  assert.ok(redact("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----").includes("[REDACTED PRIVATE KEY]"));
});

test("parseServerArgs", () => {
  const p = parseServerArgs(["--workers", "release,reviews", "--read-only"], {});
  assert.deepEqual(p.workers, ["release", "reviews"]);
  assert.equal(p.readOnly, true);
});
