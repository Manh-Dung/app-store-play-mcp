/**
 * @store-mcp/shared — safety helpers shared by play-operate and
 * appstore-operate. Pure TypeScript, no dependencies, no credentials,
 * no network. Ideas grafted from OrellBuehler/play-console-mcp
 * (validate_only / destructive opt-in) and zelentsov-dev/asc-mcp
 * (--workers, --read-only, exact confirmation for deletes).
 */

export interface ToolLike {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handle: (args: unknown) => Promise<unknown>;
}

/** A tool is a write when its name carries a mutating verb. */
const WRITE_PATTERNS = [
  "_create", "_update", "_patch", "_delete", "_commit", "_upload",
  "_insert", "_reply", "_refund", "_revoke", "_cancel", "_defer",
  "_archive", "_activate", "_deactivate", "_consume", "_acknowledge",
  "_promote", "_submit", "_publish", "_release", "_invite", "_remove",
  "_expire", "_halt", "_deploy", "_migrate", "_convert", "_clear",
  "_reorder", "_assign", "_set_", "_start_", "_stop_", "_add_",
  "create_", "update_", "delete_", "upload_", "submit_", "revoke_",
  "invite_", "remove_", "expire_",
];

export function isWriteTool(name: string): boolean {
  const n = name.toLowerCase();
  // Reads are explicit: list/get/search/query/status/fetch + helpers.
  if (
    /(^|_)(list|get|search|query|status|fetch|check|verify|validate|download|wait|current|preview|count|exists)($|_)/.test(n) &&
    !WRITE_PATTERNS.some((p) => n.includes(p))
  ) {
    return false;
  }
  return WRITE_PATTERNS.some((p) => n.includes(p));
}

/** Destructive = delete / remove / revoke / clear / purge, plus delete-all. */
export function isDestructiveTool(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("delete") || n.includes("remove") || n.includes("revoke") ||
    n.includes("clear") || n.includes("purge") || n.includes("destroy") ||
    n.includes("delete_all") || n.includes("delete-all")
  );
}

export interface FilterOptions {
  /** Profile/worker names, e.g. ["release", "reviews"]. Empty/["full"] = all. */
  workers?: string[];
  readOnly?: boolean;
  /** Profiles a tool belongs to, from the package's profiles.ts. */
  profileForTool: (name: string) => string[];
  /** Extra names to always keep (accounts/auth helpers). */
  alwaysKeep?: string[];
}

export interface FilterResult {
  tools: ToolLike[];
  blocked: { name: string; reason: string }[];
}

/**
 * Filter a tool list by worker profile and read-only mode, and wrap every
 * surviving tool's handler so its text output is redacted. This is the
 * real enforcement point: ListTools never advertises a filtered tool,
 * and CallTool refuses it again by name if a client calls it anyway.
 */
export function filterTools(
  all: ToolLike[],
  opts: FilterOptions,
): FilterResult {
  const workers = (opts.workers ?? []).map((w) => w.trim().toLowerCase()).filter(Boolean);
  const wantAll = workers.length === 0 || workers.includes("full");
  const alwaysKeep = new Set((opts.alwaysKeep ?? []).map((s) => s.toLowerCase()));
  const tools: ToolLike[] = [];
  const blocked: { name: string; reason: string }[] = [];

  for (const tool of all as ToolLike[]) {
    const name = tool.name;
    const profiles = opts.profileForTool(name).map((p) => p.toLowerCase());
    if (!wantAll && !profiles.some((p) => workers.includes(p)) && !alwaysKeep.has(name.toLowerCase())) {
      blocked.push({ name, reason: `not in --workers ${workers.join(",")}` });
      continue;
    }
    if (opts.readOnly && isWriteTool(name)) {
      blocked.push({ name, reason: "blocked by --read-only" });
      continue;
    }
    const orig = tool.handle;
    tools.push({
      ...tool,
      handle: async (args: unknown) => redactResult(await orig(args)),
    });
  }
  return { tools, blocked };
}

/**
 * Destructive gate (Orell-style opt-in, asc-mcp-style confirmation).
 * Delete/remove/revoke tools are refused unless the caller either
 * sets STORE_MCP_ALLOW_DESTRUCTIVE=1 or passes { confirm: true } /
 * { confirmation: "<exact id>" } in the tool arguments.
 * Returns null when allowed, otherwise the error message to return.
 */
export function destructiveGate(
  name: string,
  args: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isDestructiveTool(name)) return null;
  if (env.STORE_MCP_ALLOW_DESTRUCTIVE === "1" || env.STORE_MCP_ALLOW_DESTRUCTIVE === "true") return null;
  if (args && typeof args === "object") {
    const a = args as Record<string, unknown>;
    if (a.confirm === true) return null;
    if (typeof a.confirmation === "string" && a.confirmation.length > 0) return null;
    if (typeof a.confirm_id === "string" && a.confirm_id.length > 0) return null;
    // asc-mcp style: confirm_<resource>_id fields
    for (const [k, v] of Object.entries(a)) {
      if (k.startsWith("confirm_") && typeof v === "string" && v.length > 0) return null;
    }
  }
  return (
    `Refused destructive tool "${name}": set STORE_MCP_ALLOW_DESTRUCTIVE=1 ` +
    `or pass { "confirm": true } (or a confirm_*_id) in the tool arguments. ` +
    `This gate exists so a mis-prompted agent cannot delete store data.`
  );
}

/** Redact JWTs, Bearer tokens, PEM blocks and private-key fields from text. */
export function redact(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED JWT]")
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi, "Bearer [REDACTED]")
    .replace(/("private_key"\s*:\s*")[^"]+"/g, '$1[REDACTED]"')
    .replace(/("privateKey"\s*:\s*")[^"]+"/g, '$1[REDACTED]"');
}

export function redactResult(result: unknown): unknown {
  if (typeof result === "string") return redact(result);
  if (result && typeof result === "object") {
    const r = result as { content?: Array<{ type?: string; text?: string }> };
    if (Array.isArray(r.content)) {
      return {
        ...r,
        content: r.content.map((c) => (typeof c?.text === "string" ? { ...c, text: redact(c.text) } : c)),
      };
    }
    return result;
  }
  return result;
}

/** Translate common API failures into actionable messages. */
export function translateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|unauth|jwt rejected|invalid token/i.test(msg)) {
    return `${msg} — check the key/service account, clock skew, and that the key was not revoked.`;
  }
  if (/403|permission|forbidden|not authorized/i.test(msg)) {
    return `${msg} — the key lacks this permission in Play Console / App Store Connect; grant it and wait for propagation (Play can take up to 24h).`;
  }
  if (/429|quota|rate limit/i.test(msg)) {
    return `${msg} — quota/rate limit hit; back off and retry later.`;
  }
  if (/5\d\d|internal error|service unavailable/i.test(msg)) {
    return `${msg} — provider-side error; retry later and check the provider status page.`;
  }
  return msg;
}

/** Parse --workers / --read-only / --help from argv + env. */
export function parseServerArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): {
  workers: string[];
  readOnly: boolean;
  help: boolean;
} {
  const workers: string[] = [];
  let readOnly = env.STORE_MCP_READ_ONLY === "1" || env.STORE_MCP_READ_ONLY === "true";
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--read-only") readOnly = true;
    else if (a === "--workers" && argv[i + 1]) workers.push(...argv[++i].split(","));
    else if (a.startsWith("--workers=")) workers.push(...a.slice("--workers=".length).split(","));
  }
  if (env.STORE_MCP_WORKERS) workers.push(...env.STORE_MCP_WORKERS.split(","));
  return { workers: workers.map((w) => w.trim()).filter(Boolean), readOnly, help };
}

export function helpText(serverName: string, profiles: string[]): string {
  return [
    `${serverName} — MCP server (fork, see README-FORK.md)`,
    ``,
    `Usage: node dist/index.js [--workers a,b] [--read-only] [--help]`,
    ``,
    `  --workers <list>   Only expose tools in these profiles: ${profiles.join(", ")}, or "full"`,
    `  --read-only        Block every write tool (server-enforced, like asc-mcp --read-only)`,
    `  --help             Show this help and exit (no credentials needed)`,
    ``,
    `Env: STORE_MCP_WORKERS, STORE_MCP_READ_ONLY=1, STORE_MCP_ALLOW_DESTRUCTIVE=1`,
    `Destructive tools (delete/remove/revoke) also need STORE_MCP_ALLOW_DESTRUCTIVE=1`,
    `or { "confirm": true } in the tool call, unless in read-only mode (then blocked).`,
    ``,
  ].join("\n");
}
