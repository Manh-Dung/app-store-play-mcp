export * from "./beta-feedback.js";
export * from "./formatters.js";
export * from "./aso-audit.js";

import {
  testflightFeedbackSummaryTool,
  testflightCrashReportsTool,
} from "./beta-feedback.js";
import {
  asoAuditPortfolioTool,
  metadataDryRunPreviewTool,
} from "./aso-audit.js";
import type { Tool } from "../utils/tool.js";

export const compositeTools: Tool[] = [
  testflightFeedbackSummaryTool,
  testflightCrashReportsTool,
  asoAuditPortfolioTool,
  metadataDryRunPreviewTool,
];
