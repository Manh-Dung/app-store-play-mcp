/**
 * Structured Markdown formatters for App Store TestFlight feedback and crash reports.
 * Replaces raw JSON:API payloads with actionable reports.
 */

export interface FeedbackItem {
  id: string;
  type: "crash" | "screenshot";
  comment: string;
  createdDate: string;
  deviceModel?: string;
  osVersion?: string;
  locale?: string;
  email?: string;
  hasScreenshots?: boolean;
}

export interface BetaFeedbackCategories {
  blockers: FeedbackItem[];
  bugs: FeedbackItem[];
  usability: FeedbackItem[];
}

export interface BetaFeedbackSummaryResult {
  appId: string;
  buildId?: string;
  totalCrashSubmissions: number;
  totalScreenshotSubmissions: number;
  categories: BetaFeedbackCategories;
}

export interface CrashReportsResult {
  appId: string;
  buildId?: string;
  totalCrashes: number;
  deviceDistribution: Record<string, number>;
  osDistribution: Record<string, number>;
  averageUptimeSeconds: number;
  recentCrashes: FeedbackItem[];
}

export function formatBetaFeedbackSummary(res: BetaFeedbackSummaryResult): string {
  const lines: string[] = [
    `# TestFlight Beta Feedback Summary`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| App ID | \`${res.appId}\` |`,
    res.buildId ? `| Build ID | \`${res.buildId}\` |` : "",
    `| Total Crash Submissions | ${res.totalCrashSubmissions} |`,
    `| Total Screenshot/Tester Feedback | ${res.totalScreenshotSubmissions} |`,
    `| Blocker/Crash Issues | ${res.categories.blockers.length} |`,
    `| Bug/Functional Issues | ${res.categories.bugs.length} |`,
    `| Usability & Feedback | ${res.categories.usability.length} |`,
    ``,
  ].filter(Boolean);

  const formatList = (items: FeedbackItem[]): string => {
    if (items.length === 0) return "*(No items)*\n";
    return items
      .map((item) => {
        const meta = [item.deviceModel, item.osVersion, item.locale].filter(Boolean).join(" · ");
        const metaText = meta ? ` *(${meta})*` : "";
        return `- **${item.comment || "No comment provided"}**${metaText}`;
      })
      .join("\n") + "\n";
  };

  lines.push(`### Blockers & Crashes (High Priority)`);
  lines.push(formatList(res.categories.blockers));

  lines.push(`### Bugs & Functional Issues (Medium Priority)`);
  lines.push(formatList(res.categories.bugs));

  lines.push(`### Usability & Feature Requests (Low Priority)`);
  lines.push(formatList(res.categories.usability));

  return lines.join("\n");
}

export function formatCrashReports(res: CrashReportsResult): string {
  const lines: string[] = [
    `# TestFlight Crash Diagnostics`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| App ID | \`${res.appId}\` |`,
    res.buildId ? `| Build ID | \`${res.buildId}\` |` : "",
    `| Total Crash Submissions | ${res.totalCrashes} |`,
    `| Average App Uptime | ${res.averageUptimeSeconds}s |`,
    ``,
    `### Device Distribution`,
    `| Device Model | Crash Count | Share |`,
    `|---|---|---|`,
  ].filter(Boolean);

  const total = res.totalCrashes || 1;

  for (const [device, count] of Object.entries(res.deviceDistribution)) {
    const share = `${Math.round((count / total) * 100)}%`;
    lines.push(`| ${device} | ${count} | ${share} |`);
  }

  lines.push(``);
  lines.push(`### OS Version Distribution`);
  lines.push(`| OS Version | Crash Count | Share |`);
  lines.push(`|---|---|---|`);

  for (const [os, count] of Object.entries(res.osDistribution)) {
    const share = `${Math.round((count / total) * 100)}%`;
    lines.push(`| ${os} | ${count} | ${share} |`);
  }

  lines.push(``);
  lines.push(`### Recent Crash Comments`);
  if (res.recentCrashes.length === 0) {
    lines.push(`*(No crash comments)*`);
  } else {
    for (const c of res.recentCrashes) {
      lines.push(`- **${c.comment || "Crash with no description"}** *(${c.deviceModel || "Unknown"}, iOS ${c.osVersion || "Unknown"})*`);
    }
  }

  return lines.join("\n");
}

