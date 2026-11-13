import { z } from "zod";
import { defineTool, type Tool } from "../utils/tool.js";
import { ascRequest } from "../utils/http.js";
import type { AscRequester } from "./beta-feedback.js";
import {
  auditAsoMetadata,
  diffMetadataFields,
  type AppMetadata,
  type AsoAuditReport,
  type MetadataDiffResult,
} from "@store-mcp/shared";

export const asoAuditInputSchema = z
  .object({
    appId: z
      .string()
      .optional()
      .describe("Optional App Store Connect app ID. Omit to audit all apps across the portfolio."),
  })
  .strict();

export interface PortfolioAuditResult {
  reports: AsoAuditReport[];
  averageScore: number;
  totalGaps: number;
  formattedMarkdown: string;
}

export async function executeAsoAuditPortfolio(
  input: z.infer<typeof asoAuditInputSchema>,
  requester: AscRequester = ascRequest,
): Promise<PortfolioAuditResult> {
  const { appId } = input;
  let targetApps: Array<{ id: string; name: string; primaryLocale?: string }> = [];

  if (appId) {
    targetApps = [{ id: appId, name: appId, primaryLocale: "en-US" }];
  } else {
    const appsRes = await requester({
      method: "GET",
      path: "/v1/apps",
      query: { limit: 50 },
    });
    const apps = (appsRes.body?.data ?? []) as Array<{
      id: string;
      attributes?: { name?: string; primaryLocale?: string };
    }>;
    targetApps = apps.map((a) => ({
      id: a.id,
      name: a.attributes?.name ?? a.id,
      primaryLocale: a.attributes?.primaryLocale ?? "en-US",
    }));
  }

  const reports: AsoAuditReport[] = [];

  for (const app of targetApps) {
    const localesMap: AppMetadata["locales"] = {};

    // 1. Fetch App Info and its Localizations (for Title & Subtitle)
    const appInfoRes = await requester({
      method: "GET",
      path: "/v1/apps/{id}/appInfos",
      pathParams: { id: app.id },
      query: { limit: 5 },
    });
    const appInfos = (appInfoRes.body?.data ?? []) as Array<{ id: string }>;

    for (const info of appInfos) {
      const locRes = await requester({
        method: "GET",
        path: "/v1/appInfos/{id}/appInfoLocalizations",
        pathParams: { id: info.id },
        query: { limit: 50 },
      });
      const locs = (locRes.body?.data ?? []) as Array<{
        attributes?: { locale?: string; name?: string; subtitle?: string };
      }>;
      for (const l of locs) {
        const locCode = l.attributes?.locale ?? app.primaryLocale ?? "en-US";
        localesMap[locCode] = {
          ...localesMap[locCode],
          title: l.attributes?.name ?? app.name,
          subtitle: l.attributes?.subtitle ?? "",
        };
      }
    }

    // 2. Fetch App Store Versions & Version Localizations (for Keywords & Description)
    const versionsRes = await requester({
      method: "GET",
      path: "/v1/apps/{id}/appStoreVersions",
      pathParams: { id: app.id },
      query: { limit: 5 },
    });
    const versions = (versionsRes.body?.data ?? []) as Array<{ id: string }>;

    for (const ver of versions.slice(0, 1)) {
      const vLocRes = await requester({
        method: "GET",
        path: "/v1/appStoreVersions/{id}/appStoreVersionLocalizations",
        pathParams: { id: ver.id },
        query: { limit: 50 },
      });
      const vLocs = (vLocRes.body?.data ?? []) as Array<{
        id: string;
        attributes?: { locale?: string; keywords?: string; description?: string };
      }>;

      for (const vl of vLocs) {
        const locCode = vl.attributes?.locale ?? app.primaryLocale ?? "en-US";

        // Check screenshots
        const shotRes = await requester({
          method: "GET",
          path: "/v1/appStoreVersionLocalizations/{id}/appScreenshotSets",
          pathParams: { id: vl.id },
          query: { limit: 10 },
        });
        const shotSets = (shotRes.body?.data ?? []) as unknown[];

        localesMap[locCode] = {
          ...localesMap[locCode],
          keywords: vl.attributes?.keywords ?? "",
          description: vl.attributes?.description ?? "",
          hasScreenshots: shotSets.length > 0,
          screenshotCount: shotSets.length,
        };
      }
    }

    const appMetadata: AppMetadata = {
      appId: app.id,
      appName: app.name,
      defaultLocale: app.primaryLocale ?? "en-US",
      locales: localesMap,
    };

    const audit = auditAsoMetadata("apple", appMetadata);
    reports.push(audit);
  }

  const totalScore = reports.reduce((acc, r) => acc + r.score, 0);
  const averageScore = reports.length > 0 ? Math.round(totalScore / reports.length) : 0;
  const totalGaps = reports.reduce((acc, r) => acc + r.gaps.length, 0);

  const lines: string[] = [
    `# Apple App Store ASO Portfolio Audit Report`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Apps Audited | ${reports.length} |`,
    `| Average ASO Score | ${averageScore}/100 |`,
    `| Total Issues Identified | ${totalGaps} |`,
    ``,
    `### App Health Overview`,
    `| App Name | App ID | Score | Total Locales | Issues Count |`,
    `|---|---|---|---|---|`,
  ];

  for (const r of reports) {
    const displayName = r.appName ? `**${r.appName}**` : `\`${r.appId}\``;
    lines.push(`| ${displayName} | \`${r.appId}\` | ${r.score}/100 | ${r.totalLocales} | ${r.gaps.length} |`);
  }

  lines.push(``);
  lines.push(`### Actionable Omissions & Gaps`);

  for (const r of reports) {
    if (r.gaps.length === 0) continue;
    const titleHeader = r.appName ? `#### App: **${r.appName}** (\`${r.appId}\`)` : `#### App: \`${r.appId}\``;
    lines.push(titleHeader);
    for (const g of r.gaps) {
      lines.push(`- **[${g.severity.toUpperCase()}] [${g.locale}] ${g.field}**: ${g.issue} *Recommendation: ${g.recommendation}*`);
    }
  }

  return {
    reports,
    averageScore,
    totalGaps,
    formattedMarkdown: lines.join("\n"),
  };
}

export const dryRunInputSchema = z
  .object({
    current: z
      .record(z.string())
      .describe("Current metadata fields, e.g. { title: '...', subtitle: '...', keywords: '...' }"),
    proposed: z
      .record(z.string())
      .describe("Proposed metadata fields to check against platform limits and compare"),
  })
  .strict();

export function executeMetadataDryRunPreview(
  input: z.infer<typeof dryRunInputSchema>,
): MetadataDiffResult {
  return diffMetadataFields("apple", input.current, input.proposed);
}

// Tool definitions
export const asoAuditPortfolioTool: Tool = defineTool({
  name: "aso_audit_portfolio",
  description:
    "Audit ASO (App Store Optimization) metadata across all apps in your Apple portfolio or a single app. Flags empty subtitles, missing keywords, character underutilization, and missing localized screenshots.",
  input: asoAuditInputSchema,
  handler: async (args) => {
    const result = await executeAsoAuditPortfolio(args);
    return result.formattedMarkdown;
  },
});

export const metadataDryRunPreviewTool: Tool = defineTool({
  name: "metadata_dry_run_preview",
  description:
    "Preview proposed metadata changes for Apple App Store. Validates character limits (title 30, subtitle 30, keywords 100, description 4000) and displays a side-by-side diff before modifying listings.",
  input: dryRunInputSchema,
  handler: async (args) => {
    const result = executeMetadataDryRunPreview(args);
    return result.formattedMarkdown;
  },
});

