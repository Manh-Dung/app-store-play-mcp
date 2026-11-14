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
  // Verify composite tools (Blocker 1)
  assert.equal(isWriteTool("deploy_app"), true);
  assert.equal(isWriteTool("halt_rollout"), true);
  assert.equal(isWriteTool("promote_release"), true);
  assert.equal(isWriteTool("create_release"), true);
  assert.equal(isWriteTool("update_rollout"), true);
  assert.equal(isWriteTool("aso_audit_app"), false);
  assert.equal(isWriteTool("aso_audit_portfolio"), false);
  assert.equal(isWriteTool("metadata_dry_run_preview"), false);
});

test("isDestructiveTool identifies destructive actions and production deployments", () => {
  assert.equal(isDestructiveTool("listings_delete"), true);
  assert.equal(isDestructiveTool("halt_rollout"), true);
  assert.equal(isDestructiveTool("listings_update"), false);
  assert.equal(isDestructiveTool("deploy_app", { track: "internal" }), false);
  assert.equal(isDestructiveTool("deploy_app", { track: "production" }), true);
  assert.equal(isDestructiveTool("deploy_app", { track: "production", validateOnly: true }), false);
});

test("filterTools enforces read-only and workers including composite tools", () => {
  const tools = [
    { name: "apps_list", description: "", inputSchema: {}, handle: async () => "ok" },
    { name: "reviews_reply", description: "", inputSchema: {}, handle: async () => "ok" },
    { name: "deploy_app", description: "", inputSchema: {}, handle: async () => "ok" },
    { name: "halt_rollout", description: "", inputSchema: {}, handle: async () => "ok" },
  ];
  const r = filterTools(tools, {
    readOnly: true,
    profileForTool: (n) => (n.startsWith("apps") ? ["apps"] : ["release"]),
  });
  // deploy_app and halt_rollout MUST be blocked in read-only mode
  assert.deepEqual(r.tools.map((t) => t.name), ["apps_list"]);
  assert.equal(r.blocked.length, 3);
  assert.ok(r.blocked.some((b) => b.name === "deploy_app" && b.reason.includes("read-only")));
  assert.ok(r.blocked.some((b) => b.name === "halt_rollout" && b.reason.includes("read-only")));
});

test("destructiveGate enforces two-phase confirmation token lifecycle", () => {
  // 1. Non-destructive tools pass immediately
  assert.equal(destructiveGate("apps_list", {}, {}), null);

  // 2. Opt-in via STORE_MCP_ALLOW_DESTRUCTIVE=1 passes immediately
  assert.equal(destructiveGate("listings_delete", {}, { STORE_MCP_ALLOW_DESTRUCTIVE: "1" }), null);

  // 3. Phase 1: Calling destructive tool without token refuses and generates a CONF- token
  const phase1 = destructiveGate("listings_delete", { packageName: "com.example.app" }, {});
  assert.ok(phase1 !== null);
  assert.ok(phase1.includes("Two-phase confirmation required"));
  const match = phase1.match(/CONF-[A-F0-9]{8}/);
  assert.ok(match, "must return a confirmationId starting with CONF-");
  const tokenId = match[0];

  // 4. Calling with invalid/garbage token is rejected
  const garbageRes = destructiveGate(
    "listings_delete",
    { packageName: "com.example.app", confirmationId: "garbage" },
    {},
  );
  assert.ok(garbageRes !== null);
  assert.ok(garbageRes.includes("not found"));

  // 5. Phase 2: Calling with the valid token succeeds
  const phase2 = destructiveGate(
    "listings_delete",
    { packageName: "com.example.app", confirmationId: tokenId },
    {},
  );
  assert.equal(phase2, null, "valid token must be accepted");

  // 6. Token reuse is rejected (single-use)
  const reuseRes = destructiveGate(
    "listings_delete",
    { packageName: "com.example.app", confirmationId: tokenId },
    {},
  );
  assert.ok(reuseRes !== null);
  assert.ok(reuseRes.includes("already been used"));

  // 7. halt_rollout is also gated
  const haltPhase1 = destructiveGate("halt_rollout", { packageName: "com.example.app", track: "production" }, {});
  assert.ok(haltPhase1 !== null);
  assert.ok(haltPhase1.includes("Two-phase confirmation required"));
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
