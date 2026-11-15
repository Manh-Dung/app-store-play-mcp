import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolLike } from "@store-mcp/shared";

export interface AnalyticsBridgeOptions {
  rootDir: string;
  pythonPath?: string;
  serverPath?: string;
}

export class AnalyticsBridge {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  constructor(private options: AnalyticsBridgeOptions) {}

  findPython(): string | null {
    if (this.options.pythonPath && fs.existsSync(this.options.pythonPath)) {
      return this.options.pythonPath;
    }
    if (process.env.PLAY_ANALYTICS_PYTHON && fs.existsSync(process.env.PLAY_ANALYTICS_PYTHON)) {
      return process.env.PLAY_ANALYTICS_PYTHON;
    }
    const venvPython = path.resolve(this.options.rootDir, "packages/play-analytics/.venv/bin/python");
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
    const rootVenvPython = path.resolve(this.options.rootDir, ".venv/bin/python");
    if (fs.existsSync(rootVenvPython)) {
      return rootVenvPython;
    }
    return "python3";
  }

  findServerScript(): string {
    return this.options.serverPath || path.resolve(this.options.rootDir, "packages/play-analytics/server.py");
  }

  async connect(): Promise<ToolLike[]> {
    const python = this.findPython();
    const serverScript = this.findServerScript();

    if (!python || !fs.existsSync(serverScript)) {
      return [];
    }

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) {
        env[k] = v;
      }
    }

    try {
      this.transport = new StdioClientTransport({
        command: python,
        args: [serverScript],
        env,
        stderr: "inherit",
      });

      this.client = new Client(
        { name: "store-mcp-gateway-analytics", version: "0.1.0" },
        { capabilities: {} },
      );

      await this.client.connect(this.transport);
      const res = await this.client.listTools();

      return (res.tools || []).map((t) => ({
        name: t.name,
        description: t.description ? `[Play Analytics] ${t.description}` : "[Play Analytics]",
        inputSchema: t.inputSchema,
        handle: async (args: unknown) => {
          if (!this.client) {
            throw new Error("Play analytics client disconnected");
          }
          const callRes = await this.client.callTool({
            name: t.name,
            arguments: (args as Record<string, unknown>) || {},
          });
          return callRes;
        },
      }));
    } catch (err) {
      console.error("[store-mcp gateway] Play analytics skipped:", (err as Error).message);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // Ignore close errors on shutdown
      }
    }
  }
}
