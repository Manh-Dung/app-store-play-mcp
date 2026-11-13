import { z } from "zod";
import { defineTool, type Tool } from "../utils/tool.js";
import { ascRequest, type AscRequestInit, type AscResponse } from "../utils/http.js";
import {
  formatBetaFeedbackSummary,
  formatCrashReports,
  type BetaFeedbackSummaryResult,
  type CrashReportsResult,
  type FeedbackItem,
} from "./formatters.js";

export type { FeedbackItem };

export type AscRequester = (init: AscRequestInit) => Promise<AscResponse<any>>;

const BLOCKER_REGEX = /(crash|freeze|hang|stuck|deadlock|panic|fatal|lost data|cannot open)/i;
const BUG_REGEX = /(bug|error|broken|wrong|issue|fail|overflow|glitch|slow|lag|black screen)/i;

export const feedbackSummaryInputSchema = z
  .object({
    appId: z.string().describe("App Store Connect application ID"),
    buildId: z.string().optional().describe("Optional TestFlight build ID to filter feedback"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25).describe("Max items to fetch per category"),
  })
  .strict();

export type FeedbackSummaryInput = z.input<typeof feedbackSummaryInputSchema>;

export async function executeBetaFeedbackSummary(
  input: FeedbackSummaryInput,
  requester: AscRequester = ascRequest,
): Promise<BetaFeedbackSummaryResult> {
  const { appId, buildId } = input;
  const limit = input.limit ?? 25;

  const queryParams: Record<string, unknown> = {
    limit,
    sort: "-createdDate",
  };
  if (buildId) {
    queryParams["filter[build]"] = buildId;
  }

  // Fetch crashes and screenshot feedback in parallel
  const [crashRes, shotRes] = await Promise.all([
    requester({
      method: "GET",
      path: "/v1/apps/{id}/betaFeedbackCrashSubmissions",
      pathParams: { id: appId },
      query: queryParams,
    }),
    requester({
      method: "GET",
      path: "/v1/apps/{id}/betaFeedbackScreenshotSubmissions",
      pathParams: { id: appId },
      query: queryParams,
    }),
  ]);

  const rawCrashes = (crashRes.body?.data ?? []) as Array<{
    id: string;
    attributes?: Record<string, unknown>;
  }>;
  const rawShots = (shotRes.body?.data ?? []) as Array<{
    id: string;
    attributes?: Record<string, unknown>;
  }>;

  const blockers: FeedbackItem[] = [];
  const bugs: FeedbackItem[] = [];
  const usability: FeedbackItem[] = [];

  // All crash submissions are automatically blockers
  for (const c of rawCrashes) {
    const attr = c.attributes ?? {};
    const comment = String(attr.comment ?? "");
    const item: FeedbackItem = {
      id: c.id,
      type: "crash",
      comment,
      createdDate: String(attr.createdDate ?? ""),
      deviceModel: attr.deviceModel ? String(attr.deviceModel) : undefined,
      osVersion: attr.osVersion ? String(attr.osVersion) : undefined,
      locale: attr.locale ? String(attr.locale) : undefined,
      email: attr.email ? String(attr.email) : undefined,
    };
    blockers.push(item);
  }

  // Screenshot feedback categorized by content
  for (const s of rawShots) {
    const attr = s.attributes ?? {};
    const comment = String(attr.comment ?? "");
    const item: FeedbackItem = {
      id: s.id,
      type: "screenshot",
      comment,
      createdDate: String(attr.createdDate ?? ""),
      deviceModel: attr.deviceModel ? String(attr.deviceModel) : undefined,
      osVersion: attr.osVersion ? String(attr.osVersion) : undefined,
      locale: attr.locale ? String(attr.locale) : undefined,
      email: attr.email ? String(attr.email) : undefined,
      hasScreenshots: Boolean(attr.screenshots),
    };

    if (BLOCKER_REGEX.test(comment)) {
      blockers.push(item);
    } else if (BUG_REGEX.test(comment)) {
      bugs.push(item);
    } else {
      usability.push(item);
    }
  }

  return {
    appId,
    buildId,
    totalCrashSubmissions: rawCrashes.length,
    totalScreenshotSubmissions: rawShots.length,
    categories: {
      blockers,
      bugs,
      usability,
    },
  };
}

export const crashReportsInputSchema = z
  .object({
    appId: z.string().describe("App Store Connect application ID"),
    buildId: z.string().optional().describe("Optional TestFlight build ID to filter crashes"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50).describe("Max crash records to inspect"),
  })
  .strict();

export type CrashReportsInput = z.input<typeof crashReportsInputSchema>;

export async function executeCrashReports(
  input: CrashReportsInput,
  requester: AscRequester = ascRequest,
): Promise<CrashReportsResult> {
  const { appId, buildId } = input;
  const limit = input.limit ?? 50;

  const queryParams: Record<string, unknown> = {
    limit,
    sort: "-createdDate",
  };
  if (buildId) {
    queryParams["filter[build]"] = buildId;
  }

  const crashRes = await requester({
    method: "GET",
    path: "/v1/apps/{id}/betaFeedbackCrashSubmissions",
    pathParams: { id: appId },
    query: queryParams,
  });

  const rawCrashes = (crashRes.body?.data ?? []) as Array<{
    id: string;
    attributes?: Record<string, unknown>;
  }>;

  const deviceDistribution: Record<string, number> = {};
  const osDistribution: Record<string, number> = {};
  let totalUptimeMs = 0;
  let uptimeCount = 0;
  const recentCrashes: FeedbackItem[] = [];

  for (const c of rawCrashes) {
    const attr = c.attributes ?? {};
    const device = String(attr.deviceModel ?? "Unknown");
    const os = String(attr.osVersion ?? "Unknown");
    const uptime = typeof attr.appUptimeInMilliseconds === "number" ? attr.appUptimeInMilliseconds : 0;

    deviceDistribution[device] = (deviceDistribution[device] ?? 0) + 1;
    osDistribution[os] = (osDistribution[os] ?? 0) + 1;

    if (uptime > 0) {
      totalUptimeMs += uptime;
      uptimeCount++;
    }

    recentCrashes.push({
      id: c.id,
      type: "crash",
      comment: String(attr.comment ?? ""),
      createdDate: String(attr.createdDate ?? ""),
      deviceModel: device,
      osVersion: os,
    });
  }

  const averageUptimeSeconds = uptimeCount > 0 ? Math.round(totalUptimeMs / uptimeCount / 1000) : 0;

  return {
    appId,
    buildId,
    totalCrashes: rawCrashes.length,
    deviceDistribution,
    osDistribution,
    averageUptimeSeconds,
    recentCrashes,
  };
}

// Tool definitions
export const testflightFeedbackSummaryTool: Tool = defineTool({
  name: "testflight_feedback_summary",
  description:
    "Fetch and synthesize TestFlight tester feedback and crash submissions into prioritized action categories (Blockers, Bugs, Usability).",
  input: feedbackSummaryInputSchema,
  handler: async (args) => {
    const result = await executeBetaFeedbackSummary(args);
    return formatBetaFeedbackSummary(result);
  },
});

export const testflightCrashReportsTool: Tool = defineTool({
  name: "testflight_crash_reports",
  description:
    "Analyze TestFlight crash submissions, reporting device and OS version distributions, average uptime before crash, and recent crash comments.",
  input: crashReportsInputSchema,
  handler: async (args) => {
    const result = await executeCrashReports(args);
    return formatCrashReports(result);
  },
});
