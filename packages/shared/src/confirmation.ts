import { createHash, randomBytes } from "node:crypto";
import type {
  ConfirmationToken,
  CreateConfirmationOptions,
  VerifyConfirmationResult,
} from "./types.js";

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

const tokens = new Map<string, ConfirmationToken>();

/**
 * Deterministically compute a SHA-256 hash of parameters.
 * Keys are recursively sorted to ensure matching regardless of object key order.
 */
export function hashParams(params: unknown): string {
  if (params === undefined || params === null) {
    return "";
  }
  const normalize = (val: unknown): unknown => {
    if (val === null || typeof val !== "object") {
      return val;
    }
    if (Array.isArray(val)) {
      return val.map(normalize);
    }
    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).sort();
    for (const key of keys) {
      sortedObj[key] = normalize((val as Record<string, unknown>)[key]);
    }
    return sortedObj;
  };

  const jsonStr = JSON.stringify(normalize(params));
  return createHash("sha256").update(jsonStr).digest("hex");
}

/**
 * Generate a single-use confirmation token for a high-risk or destructive operation.
 */
export function createConfirmationToken(
  options: CreateConfirmationOptions,
): { confirmationId: string; expiresAt: string; prompt: string } {
  const { action, target, params, ttlMs = DEFAULT_TTL_MS } = options;
  const id = `CONF-${randomBytes(4).toString("hex").toUpperCase()}`;
  const now = Date.now();
  const expiresAtMs = now + ttlMs;
  const paramsHash = hashParams(params);

  const token: ConfirmationToken = {
    id,
    action,
    target,
    paramsHash,
    createdAt: now,
    expiresAt: expiresAtMs,
    used: false,
  };

  tokens.set(id, token);

  const expiresIso = new Date(expiresAtMs).toISOString();
  const prompt = [
    `Destructive action "${action}" on target "${target}" requires confirmation.`,
    `To proceed, invoke the tool again within 10 minutes with confirmationId: "${id}".`,
    `Confirmation expires at: ${expiresIso}.`,
  ].join(" ");

  return { confirmationId: id, expiresAt: expiresIso, prompt };
}

/**
 * Verify and consume a single-use confirmation token.
 */
export function verifyAndConsumeConfirmationToken(
  id: string,
  action: string,
  target: string,
  params?: unknown,
): VerifyConfirmationResult {
  const token = tokens.get(id);

  if (!token) {
    return { valid: false, reason: `Confirmation token "${id}" not found.` };
  }

  if (token.used) {
    return { valid: false, reason: `Confirmation token "${id}" has already been used.` };
  }

  if (Date.now() > token.expiresAt) {
    tokens.delete(id);
    return { valid: false, reason: `Confirmation token "${id}" has expired.` };
  }

  if (token.action !== action) {
    return {
      valid: false,
      reason: `Action mismatch for token "${id}": expected "${token.action}", received "${action}".`,
    };
  }

  if (token.target !== target) {
    return {
      valid: false,
      reason: `Target mismatch for token "${id}": expected "${token.target}", received "${target}".`,
    };
  }

  const expectedHash = token.paramsHash;
  const actualHash = hashParams(params);
  if (expectedHash !== actualHash) {
    return {
      valid: false,
      reason: `Parameters mismatch for token "${id}". Token cannot be reused with altered payload.`,
    };
  }

  token.used = true;
  return { valid: true };
}

/**
 * For testing purposes: reset the token storage.
 */
export function resetConfirmationStore(): void {
  tokens.clear();
}
