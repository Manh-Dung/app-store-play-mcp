/**
 * @store-mcp/shared — safety helpers shared by play-operate and
 * appstore-operate. Pure TypeScript, no dependencies, no credentials,
 * no network.
 */

export * from "./types.js";
export * from "./confirmation.js";
export * from "./tool-budget.js";
export * from "./aso-rules.js";

import type { ToolLike } from "./types.js";
import {
  createConfirmationToken,
  verifyAndConsumeConfirmationToken,
} from "./confirmation.js";

/** Verbs that denote a mutating or state-changing action. */
const WRITE_VERBS = [
  "create", "update", "patch", "delete", "commit", "upload",
  "insert", "reply", "refund", "revoke", "cancel", "defer",
  "archive", "activate", "deactivate", "consume", "acknowledge",
  "promote", "submit", "publish", "release", "invite", "remove",
  "expire", "halt", "deploy", "migrate", "convert", "clear",
  "reorder", "assign", "set", "start", "stop", "add",
];

export function isWriteTool(name: string): boolean {
  const n = name.toLowerCase();
  // Reads are explicit: list/get/search/query/status/fetch + helpers.
  const isExplicitRead = /(^|_)(list|get|search|query|status|fetch|check|verify|validate|download|wait|current|preview|count|exists)($|_)/.test(n);

  const hasWriteVerb = WRITE_VERBS.some(
    (v) => n === v || n.startsWith(`${v}_`) || n.endsWith(`_${v}`) || n.includes(`_${v}_`),
  );

  if (isExplicitRead && !hasWriteVerb) {
    return false;
  }
  return hasWriteVerb;
}

/** Destructive = delete / remove / revoke / clear / purge / halt, plus live production mutations. */
export function isDestructiveTool(name: string, args?: unknown): boolean {
  const n = name.toLowerCase();
  if (
    n.includes("delete") || n.includes("remove") || n.includes("revoke") ||
    n.includes("clear") || n.includes("purge") || n.includes("destroy") ||
    n.includes("halt") || n.includes("delete_all") || n.includes("delete-all")
  ) {
    return true;
  }
  // Modifications to live production track without validateOnly require confirmation
  if (args && typeof args === "object") {
    const a = args as Record<string, unknown>;
    const track = a.track || a.toTrack;
    if (
      track === "production" &&
      !a.validateOnly &&
      (n.includes("deploy") || n.includes("release") || n.includes("promote"))
    ) {
      return true;
    }
  }
  return false;
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
 * Two-phase destructive gate.
 * Destructive/high-risk actions require STORE_MCP_ALLOW_DESTRUCTIVE=1 or
 * a verified, single-use confirmation token (generated in phase 1).
 *
 * Phase 1: Caller invokes tool without confirmationId.
 *          Gate generates token (TTL 10 min, payload-bound) and refuses execution.
 * Phase 2: Caller re-invokes tool with { confirmationId: "CONF-..." }.
 *          Gate verifies and consumes token; allows execution if valid.
 */
export function destructiveGate(
  name: string,
  args: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isDestructiveTool(name, args)) return null;
  if (env.STORE_MCP_ALLOW_DESTRUCTIVE === "1" || env.STORE_MCP_ALLOW_DESTRUCTIVE === "true") {
    return null;
  }

  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;

  // Extract target identifier
  const target = String(a.packageName || a.appId || a.id || a.track || a.toTrack || "global");

  // Extract clean payload without token/confirm flags for deterministic hashing
  const cleanParams: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    if (
      k !== "confirmationId" &&
      k !== "confirmation" &&
      k !== "confirm_id" &&
      k !== "confirm" &&
      !k.startsWith("confirm_")
    ) {
      cleanParams[k] = v;
    }
  }

  // Look for confirmation token
  const providedToken =
    (typeof a.confirmationId === "string" && a.confirmationId.length > 0 ? a.confirmationId : null) ||
    (typeof a.confirmation === "string" && a.confirmation.length > 0 ? a.confirmation : null) ||
    (typeof a.confirm_id === "string" && a.confirm_id.length > 0 ? a.confirm_id : null) ||
    (Object.entries(a).find(([k, v]) => k.startsWith("confirm_") && typeof v === "string" && (v as string).startsWith("CONF-"))?.[1] as string | null);

  if (!providedToken) {
    // Phase 1: Generate confirmation token and refuse execution
    const tokenInfo = createConfirmationToken({
      action: name,
      target,
      params: cleanParams,
    });
    return (
      `Refused destructive tool "${name}": Two-phase confirmation required.\n` +
      `${tokenInfo.prompt}\n` +
      `Include { "confirmationId": "${tokenInfo.confirmationId}" } in tool arguments to proceed.`
    );
  }

  // Phase 2: Verify and consume token
  const verifyResult = verifyAndConsumeConfirmationToken(providedToken, name, target, cleanParams);
  if (!verifyResult.valid) {
    return `Refused destructive tool "${name}": Confirmation failed. ${verifyResult.reason}`;
  }

  return null; // Token verified and consumed; allow execution
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

/** Parse --workers / --read-only / --max-tools / --help from argv + env. */
export function parseServerArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): {
  workers: string[];
  readOnly: boolean;
  maxTools?: number;
  help: boolean;
} {
  const workers: string[] = [];
  let readOnly = env.STORE_MCP_READ_ONLY === "1" || env.STORE_MCP_READ_ONLY === "true";
  let maxTools = env.STORE_MCP_MAX_TOOLS ? parseInt(env.STORE_MCP_MAX_TOOLS, 10) : undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--read-only") readOnly = true;
    else if (a === "--workers" && argv[i + 1]) workers.push(...argv[++i].split(","));
    else if (a.startsWith("--workers=")) workers.push(...a.slice("--workers=".length).split(","));
    else if (a === "--max-tools" && argv[i + 1]) maxTools = parseInt(argv[++i], 10);
    else if (a.startsWith("--max-tools=")) maxTools = parseInt(a.slice("--max-tools=".length), 10);
  }
  if (env.STORE_MCP_WORKERS) workers.push(...env.STORE_MCP_WORKERS.split(","));
  return {
    workers: workers.map((w) => w.trim()).filter(Boolean),
    readOnly,
    maxTools: maxTools && !isNaN(maxTools) && maxTools > 0 ? maxTools : undefined,
    help,
  };
}

export function helpText(serverName: string, profiles: string[]): string {
  return [
    `${serverName} — MCP server (fork, see README-FORK.md)`,
    ``,
    `Usage: node dist/index.js [--workers a,b] [--read-only] [--max-tools N] [--help]`,
    ``,
    `  --workers <list>   Only expose tools in these profiles: ${profiles.join(", ")}, or "full"`,
    `  --read-only        Block every write tool (server-enforced, like asc-mcp --read-only)`,
    `  --max-tools <num>  Limit number of registered tools to prevent context bloat (default: no limit unless set)`,
    `  --help             Show this help and exit (no credentials needed)`,
    ``,
    `Env: STORE_MCP_WORKERS, STORE_MCP_READ_ONLY=1, STORE_MCP_MAX_TOOLS=N, STORE_MCP_ALLOW_DESTRUCTIVE=1`,
    `Destructive tools (delete/remove/revoke) also need STORE_MCP_ALLOW_DESTRUCTIVE=1`,
    `or { "confirm": true } / confirmationId in the tool call, unless in read-only mode (then blocked).`,
    ``,
  ].join("\n");
}
