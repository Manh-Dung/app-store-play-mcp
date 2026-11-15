import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseGatewayArgs,
  createGatewayServer,
  gatewayHelpText,
} from "./gateway.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

describe("Unified MCP Gateway", () => {
  it("parseGatewayArgs parses CLI flags and environment variables", () => {
    const res = parseGatewayArgs(
      ["--stores", "play,appstore", "--workers", "release,testflight", "--read-only", "--max-tools", "40"],
      {},
    );
    assert.deepEqual(res.stores, ["play", "appstore"]);
    assert.deepEqual(res.workers, ["release", "testflight"]);
    assert.equal(res.readOnly, true);
    assert.equal(res.maxTools, 40);
    assert.equal(res.help, false);

    const helpRes = parseGatewayArgs(["-h"], {});
    assert.equal(helpRes.help, true);

    const envRes = parseGatewayArgs([], {
      STORE_MCP_STORES: "play,analytics",
      STORE_MCP_WORKERS: "monetization",
      STORE_MCP_READ_ONLY: "1",
      STORE_MCP_MAX_TOOLS: "25",
    });
    assert.deepEqual(envRes.stores, ["play", "analytics"]);
    assert.deepEqual(envRes.workers, ["monetization"]);
    assert.equal(envRes.readOnly, true);
    assert.equal(envRes.maxTools, 25);
  });

  it("gatewayHelpText produces comprehensive usage guide", () => {
    const help = gatewayHelpText();
    assert.ok(help.includes("--stores"));
    assert.ok(help.includes("--workers"));
    assert.ok(help.includes("--max-tools"));
    assert.ok(help.includes("STORE_MCP_STORES"));
  });

  it("loads only play tools when stores: ['play']", async () => {
    const { server, close } = await createGatewayServer({
      stores: ["play"],
      maxTools: 30,
    });
    try {
      const handler = (server as any)._requestHandlers.get(
        ListToolsRequestSchema.shape.method.value,
      );
      assert.ok(handler, "ListTools handler must exist");
      const res = await handler({ method: "tools/list", params: {} });
      const names = res.tools.map((t: any) => t.name);

      assert.ok(names.includes("store_search_tools"));
      assert.ok(names.includes("accounts_list"));
      assert.ok(names.includes("auth_status"));
      assert.ok(names.includes("deploy_app"));
      assert.ok(names.includes("play_aso_audit_portfolio"));
      assert.ok(names.includes("play_metadata_dry_run_preview"));
      assert.ok(!names.includes("testflight_feedback_summary"));
      assert.ok(!names.includes("appstore_aso_audit_portfolio"));
    } finally {
      await close();
    }
  });

  it("loads only appstore tools when stores: ['appstore']", async () => {
    const { server, close } = await createGatewayServer({
      stores: ["appstore"],
      maxTools: 30,
    });
    try {
      const handler = (server as any)._requestHandlers.get(
        ListToolsRequestSchema.shape.method.value,
      );
      const res = await handler({ method: "tools/list", params: {} });
      const names = res.tools.map((t: any) => t.name);

      assert.ok(names.includes("store_search_tools"));
      assert.ok(names.includes("accounts_list"));
      assert.ok(names.includes("testflight_feedback_summary"));
      assert.ok(names.includes("appstore_aso_audit_portfolio"));
      assert.ok(names.includes("appstore_metadata_dry_run_preview"));
      assert.ok(!names.includes("deploy_app"));
      assert.ok(!names.includes("play_aso_audit_portfolio"));
    } finally {
      await close();
    }
  });

  it("merges play and appstore tools without name collisions", async () => {
    const { server, close } = await createGatewayServer({
      stores: ["play", "appstore"],
      maxTools: 80,
    });
    try {
      const handler = (server as any)._requestHandlers.get(
        ListToolsRequestSchema.shape.method.value,
      );
      const res = await handler({ method: "tools/list", params: {} });
      const names = res.tools.map((t: any) => t.name);

      // Verify no duplicate names
      const nameSet = new Set(names);
      assert.equal(
        nameSet.size,
        names.length,
        "All registered tools must have unique names",
      );

      // Verify disambiguated tools exist
      assert.ok(names.includes("play_aso_audit_portfolio"));
      assert.ok(names.includes("appstore_aso_audit_portfolio"));
      assert.ok(names.includes("play_metadata_dry_run_preview"));
      assert.ok(names.includes("appstore_metadata_dry_run_preview"));

      // Verify priority tools from both are present
      assert.ok(names.includes("deploy_app"));
      assert.ok(names.includes("testflight_feedback_summary"));
      assert.ok(names.includes("testflight_crash_reports"));
    } finally {
      await close();
    }
  });

  it("enforces worker profiles across stores", async () => {
    const { server, close } = await createGatewayServer({
      stores: ["play", "appstore"],
      workers: ["testflight"],
      maxTools: 50,
    });
    try {
      const handler = (server as any)._requestHandlers.get(
        ListToolsRequestSchema.shape.method.value,
      );
      const res = await handler({ method: "tools/list", params: {} });
      const names = res.tools.map((t: any) => t.name);

      assert.ok(names.includes("testflight_feedback_summary"));
      assert.ok(names.includes("testflight_crash_reports"));
      assert.ok(!names.includes("deploy_app"), "deploy_app should be excluded when workers=testflight");
    } finally {
      await close();
    }
  });

  it("enforces read-only mode across stores", async () => {
    const { server, close } = await createGatewayServer({
      stores: ["play", "appstore"],
      readOnly: true,
      maxTools: 100,
    });
    try {
      const handler = (server as any)._requestHandlers.get(
        ListToolsRequestSchema.shape.method.value,
      );
      const res = await handler({ method: "tools/list", params: {} });
      const names = res.tools.map((t: any) => t.name);

      assert.ok(!names.includes("deploy_app"), "deploy_app write tool must be blocked in read-only mode");
      assert.ok(!names.includes("create_release"), "create_release must be blocked in read-only mode");
      assert.ok(names.includes("testflight_feedback_summary"), "read tool testflight_feedback_summary must remain");
    } finally {
      await close();
    }
  });
});
