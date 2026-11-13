export * from "./deploy.js";
export * from "./release-lifecycle.js";
export * from "./formatters.js";
export * from "./aso-audit.js";

import { deployAppTool } from "./deploy.js";
import {
  createReleaseTool,
  promoteReleaseTool,
  updateRolloutTool,
  haltRolloutTool,
} from "./release-lifecycle.js";
import {
  asoAuditAppTool,
  asoAuditPortfolioTool,
  playMetadataDryRunTool,
} from "./aso-audit.js";
import type { Tool } from "../utils/tool.js";

export const compositeTools: Tool[] = [
  deployAppTool,
  createReleaseTool,
  promoteReleaseTool,
  updateRolloutTool,
  haltRolloutTool,
  asoAuditAppTool,
  asoAuditPortfolioTool,
  playMetadataDryRunTool,
];
