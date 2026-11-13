/**
 * Core types for @store-mcp/shared
 */

export interface ToolLike {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handle: (args: unknown) => Promise<unknown>;
}

export interface ConfirmationToken {
  id: string;
  action: string;
  target: string;
  paramsHash: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface CreateConfirmationOptions {
  action: string;
  target: string;
  params?: unknown;
  ttlMs?: number;
}

export interface VerifyConfirmationResult {
  valid: boolean;
  reason?: string;
}

export interface ToolBudgetOptions {
  maxTools?: number;
  workers?: string[];
  search?: string;
  profileForTool: (name: string) => string[];
  alwaysKeep?: string[];
  priorityTools?: string[];
}

export interface ToolBudgetResult<T = ToolLike> {
  tools: T[];
  totalAvailable: number;
  truncated: boolean;
}

