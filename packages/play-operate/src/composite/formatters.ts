/**
 * Structured Markdown formatters for Google Play release and deployment operations.
 * Replaces raw Google API JSON responses with clean, agent-readable summaries.
 */

export interface ReleaseNoteItem {
  language: string;
  text: string;
}

export interface DeployResult {
  success: boolean;
  packageName: string;
  track: string;
  versionCode: number;
  status: string;
  userFraction?: number;
  committed: boolean;
  validated?: boolean;
  releaseNotes?: ReleaseNoteItem[];
  editId: string;
  message?: string;
}

export interface ReleaseLifecycleResult {
  success: boolean;
  packageName: string;
  track: string;
  versionCodes: string[];
  status: string;
  userFraction?: number;
  committed: boolean;
  validated?: boolean;
  editId: string;
  message?: string;
}

export function formatDeployResult(res: DeployResult): string {
  const rolloutText = res.userFraction !== undefined
    ? `${Math.round(res.userFraction * 100)}%`
    : "100% (Full rollout)";

  const notesText = res.releaseNotes && res.releaseNotes.length > 0
    ? res.releaseNotes.map((n) => `  - [${n.language}] ${n.text}`).join("\n")
    : "  - None provided";

  const actionText = res.validated
    ? "Validated successfully (dry-run, edit deleted)"
    : res.committed
    ? "Committed and published to Play Console"
    : "Draft staged";

  return [
    `# Google Play Deployment Summary`,
    ``,
    `| Property | Value |`,
    `|---|---|`,
    `| Package Name | \`${res.packageName}\` |`,
    `| Target Track | \`${res.track}\` |`,
    `| Version Code | \`${res.versionCode}\` |`,
    `| Release Status | \`${res.status}\` |`,
    `| Rollout Percentage | ${rolloutText} |`,
    `| Action | ${actionText} |`,
    `| Edit ID | \`${res.editId}\` |`,
    ``,
    `### Release Notes:`,
    notesText,
    ``,
    res.message ? `**Note:** ${res.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatReleaseLifecycleResult(res: ReleaseLifecycleResult): string {
  const rolloutText = res.userFraction !== undefined
    ? `${Math.round(res.userFraction * 100)}%`
    : res.status === "completed"
    ? "100%"
    : "N/A";

  const actionText = res.validated
    ? "Validated (dry-run, edit deleted)"
    : res.committed
    ? "Committed to Play Console"
    : "Staged";

  return [
    `# Google Play Release Lifecycle Summary`,
    ``,
    `| Property | Value |`,
    `|---|---|`,
    `| Package Name | \`${res.packageName}\` |`,
    `| Track | \`${res.track}\` |`,
    `| Version Codes | \`${res.versionCodes.join(", ")}\` |`,
    `| Release Status | \`${res.status}\` |`,
    `| Rollout Percentage | ${rolloutText} |`,
    `| Action | ${actionText} |`,
    `| Edit ID | \`${res.editId}\` |`,
    ``,
    res.message ? `**Status:** ${res.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

