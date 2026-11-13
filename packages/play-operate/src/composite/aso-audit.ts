import { z } from "zod";
import type { androidpublisher_v3 } from "googleapis";
import { defineTool, type Tool } from "../utils/tool.js";
import { publisher } from "../auth/client-factory.js";
import { packageNameArg } from "../utils/schemas.js";
import {
  auditAsoMetadata,
  diffMetadataFields,
  type AppMetadata,
  type AsoAuditReport,
  type MetadataDiffResult,
} from "@store-mcp/shared";

export const playAsoAuditInputSchema = z
  .object({
    packageName: packageNameArg,
  })
  .strict();

export async function executePlayAsoAudit(
  packageName: string,
  client?: androidpublisher_v3.Androidpublisher,
): Promise<AsoAuditReport> {
  const pub = client ?? (await publisher());

  const insertRes = await pub.edits.insert({ packageName, requestBody: {} });
  const editId = insertRes.data.id!;

  try {
    const listRes = await pub.edits.listings.list({ packageName, editId });
    const listings = listRes.data.listings ?? [];
    const localesMap: AppMetadata["locales"] = {};

    for (const l of listings) {
      const lang = l.language ?? "en-US";

      // Check phone screenshots for this language
      let screenshotCount = 0;
      try {
        const imgRes = await pub.edits.images.list({
          packageName,
          editId,
          language: lang,
          imageType: "phoneScreenshots",
        });
        screenshotCount = imgRes.data.images?.length ?? 0;
      } catch {
        screenshotCount = 0;
      }

      localesMap[lang] = {
        title: l.title ?? undefined,
        shortDescription: l.shortDescription ?? undefined,
        description: l.fullDescription ?? undefined,
        hasScreenshots: screenshotCount > 0,
        screenshotCount,
      };
    }

    const firstTitle = listings.find((l) => l.title)?.title;
    const metadata: AppMetadata = {
      appId: packageName,
      appName: firstTitle ?? packageName,
      defaultLocale: "en-US",
      locales: localesMap,
    };

    const report = auditAsoMetadata("google", metadata);

    // Delete edit session on completion
    await pub.edits.delete({ packageName, editId });
    return report;
  } catch (err) {
    try {
      await pub.edits.delete({ packageName, editId });
    } catch {
      // Ignore cleanup error
    }
    throw err;
  }
}

export function formatPlayAsoAuditReport(report: AsoAuditReport): string {
  const titleDisplay = report.appName ? `**${report.appName}** (\`${report.appId}\`)` : `\`${report.appId}\``;
  const lines: string[] = [
    `# Google Play ASO Audit Report: ${titleDisplay}`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| App Name | **${report.appName || report.appId}** |`,
    `| App Package | \`${report.appId}\` |`,
    `| ASO Health Score | ${report.score}/100 |`,
    `| Total Locales | ${report.totalLocales} |`,
    `| Total Issues Found | ${report.gaps.length} |`,
    ``,
  ];

  if (report.gaps.length === 0) {
    lines.push(`All localized metadata fields adhere to best practices with no detected gaps.`);
  } else {
    lines.push(`### Actionable Omissions & Issues`);
    for (const g of report.gaps) {
      lines.push(
        `- **[${g.severity.toUpperCase()}] [${g.locale}] ${g.field}**: ${g.issue} *Recommendation: ${g.recommendation}*`,
      );
    }
  }

  return lines.join("\n");
}

export const playAsoAuditPortfolioSchema = z
  .object({
    packages: z
      .array(z.string())
      .optional()
      .describe(
        "List of package names to audit (e.g. ['com.example.app']). If omitted, falls back to PLAY_PACKAGE_NAMES env var.",
      ),
  })
  .strict();

export interface PlayPortfolioAuditResult {
  reports: AsoAuditReport[];
  averageScore: number;
  totalGaps: number;
  formattedMarkdown: string;
}

export async function executePlayAsoAuditPortfolio(
  packages?: string[],
  client?: androidpublisher_v3.Androidpublisher,
): Promise<PlayPortfolioAuditResult> {
  const envPackages = process.env.PLAY_PACKAGE_NAMES?.split(",").map((p) => p.trim()).filter(Boolean);
  const targetPackages =
    packages && packages.length > 0
      ? packages
      : envPackages && envPackages.length > 0
        ? envPackages
        : [];

  if (targetPackages.length === 0) {
    throw new Error(
      "No package names provided for Google Play portfolio audit. Specify 'packages: [\"com.example.app\"]' in tool arguments or set PLAY_PACKAGE_NAMES env var (comma-separated).",
    );
  }

  const reports: AsoAuditReport[] = [];
  for (const pkg of targetPackages) {
    try {
      const rep = await executePlayAsoAudit(pkg, client);
      reports.push(rep);
    } catch {
      // Skip inaccessible packages
    }
  }

  const totalScore = reports.reduce((acc, r) => acc + r.score, 0);
  const averageScore = reports.length > 0 ? Math.round(totalScore / reports.length) : 0;
  const totalGaps = reports.reduce((acc, r) => acc + r.gaps.length, 0);

  const lines: string[] = [
    `# Google Play Store ASO Portfolio Audit Report`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Apps Audited | ${reports.length} |`,
    `| Average ASO Score | ${averageScore}/100 |`,
    `| Total Issues Identified | ${totalGaps} |`,
    ``,
    `### App Health Overview`,
    `| App Name | Package Name | Score | Total Locales | Issues Count |`,
    `|---|---|---|---|---|`,
  ];

  for (const r of reports) {
    lines.push(`| **${r.appName || r.appId}** | \`${r.appId}\` | ${r.score}/100 | ${r.totalLocales} | ${r.gaps.length} |`);
  }

  lines.push(``);
  lines.push(`### Actionable Omissions & Gaps`);

  for (const r of reports) {
    if (r.gaps.length === 0) continue;
    lines.push(`#### App: **${r.appName || r.appId}** (\`${r.appId}\`)`);
    for (const g of r.gaps.slice(0, 10)) {
      lines.push(`- **[${g.severity.toUpperCase()}] [${g.locale}] ${g.field}**: ${g.issue} *Recommendation: ${g.recommendation}*`);
    }
    if (r.gaps.length > 10) {
      lines.push(`- *...và ${r.gaps.length - 10} vấn đề khác.*`);
    }
  }

  return {
    reports,
    averageScore,
    totalGaps,
    formattedMarkdown: lines.join("\n"),
  };
}

export const playDryRunInputSchema = z
  .object({
    current: z
      .record(z.string())
      .describe("Current metadata fields (title, shortDescription, fullDescription)"),
    proposed: z
      .record(z.string())
      .describe("Proposed metadata fields to check against limits and preview"),
  })
  .strict();

export function executePlayMetadataDryRun(
  input: z.infer<typeof playDryRunInputSchema>,
): MetadataDiffResult {
  return diffMetadataFields("google", input.current, input.proposed);
}

// Tool definitions
export const asoAuditAppTool: Tool = defineTool({
  name: "aso_audit_app",
  description:
    "Audit Google Play Store listing metadata for an app. Checks title length (30 chars), short description (80 chars), full description (4000 chars), and localized screenshot coverage.",
  input: playAsoAuditInputSchema,
  handler: async ({ packageName }) => {
    const report = await executePlayAsoAudit(packageName);
    return formatPlayAsoAuditReport(report);
  },
});

export const asoAuditPortfolioTool: Tool = defineTool({
  name: "aso_audit_portfolio",
  description:
    "Audit Google Play Store listing metadata across the entire app portfolio. Checks titles, descriptions, character limits, and localized screenshot coverage.",
  input: playAsoAuditPortfolioSchema,
  handler: async (args) => {
    const result = await executePlayAsoAuditPortfolio(args.packages);
    return result.formattedMarkdown;
  },
});

export const playMetadataDryRunTool: Tool = defineTool({
  name: "metadata_dry_run_preview",
  description:
    "Preview proposed metadata changes for Google Play Store. Validates character limits (title 30, shortDescription 80, fullDescription 4000) and displays a side-by-side diff before modifying listings.",
  input: playDryRunInputSchema,
  handler: async (args) => {
    const diff = executePlayMetadataDryRun(args);
    return diff.formattedMarkdown;
  },
});

