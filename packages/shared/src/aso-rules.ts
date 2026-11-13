/**
 * Shared ASO (App Store Optimization) rules, character limits, and auditing logic
 * for Apple App Store and Google Play Store.
 */

export type StoreType = "apple" | "google";

export interface FieldViolation {
  field: string;
  length: number;
  limit: number;
  message: string;
}

export interface FieldValidationResult {
  valid: boolean;
  violations: FieldViolation[];
}

export interface LocalizedMetadata {
  title?: string;
  subtitle?: string; // Apple
  shortDescription?: string; // Google
  keywords?: string; // Apple
  description?: string;
  hasScreenshots?: boolean;
  screenshotCount?: number;
}

export interface AppMetadata {
  appId: string;
  appName?: string;
  defaultLocale: string;
  locales: Record<string, LocalizedMetadata>;
}

export interface AsoGap {
  locale: string;
  field: string;
  severity: "critical" | "warning" | "info";
  issue: string;
  recommendation: string;
}

export interface AsoAuditReport {
  appId: string;
  appName?: string;
  store: StoreType;
  score: number;
  totalLocales: number;
  gaps: AsoGap[];
  summary: string;
}

export interface FieldChange {
  field: string;
  currentValue: string;
  proposedValue: string;
  currentLength: number;
  proposedLength: number;
  limit?: number;
  exceedsLimit: boolean;
}

export interface MetadataDiffResult {
  store: StoreType;
  hasErrors: boolean;
  changes: FieldChange[];
  formattedMarkdown: string;
}

export const CHAR_LIMITS: Record<StoreType, Record<string, number>> = {
  apple: {
    name: 30,
    title: 30,
    subtitle: 30,
    keywords: 100,
    promotionalText: 170,
    description: 4000,
  },
  google: {
    name: 30,
    title: 30,
    shortDescription: 80,
    fullDescription: 4000,
    description: 4000,
  },
};

/**
 * Validate field lengths against platform-specific character limits.
 */
export function validateFieldLimits(
  store: StoreType,
  fields: Record<string, string | undefined>,
): FieldValidationResult {
  const limits = CHAR_LIMITS[store];
  const violations: FieldViolation[] = [];

  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const limit = limits[field];
    if (limit !== undefined && value.length > limit) {
      violations.push({
        field,
        length: value.length,
        limit,
        message: `Field "${field}" length (${value.length}) exceeds maximum limit of ${limit} characters.`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Audit an app's metadata across all configured locales to uncover ASO opportunities and omissions.
 */
export function auditAsoMetadata(
  store: StoreType,
  metadata: AppMetadata,
): AsoAuditReport {
  const gaps: AsoGap[] = [];
  let score = 100;
  const localeEntries = Object.entries(metadata.locales);
  const totalLocales = localeEntries.length;

  if (totalLocales === 0) {
    return {
      appId: metadata.appId,
      store,
      score: 0,
      totalLocales: 0,
      gaps: [
        {
          locale: "all",
          field: "locales",
          severity: "critical",
          issue: "No localized metadata entries found for this application.",
          recommendation: `Add primary listing metadata for ${metadata.defaultLocale}.`,
        },
      ],
      summary: "No metadata found to audit.",
    };
  }

  for (const [locale, data] of localeEntries) {
    // 1. Title / Name check
    if (!data.title || data.title.trim().length === 0) {
      gaps.push({
        locale,
        field: "title",
        severity: "critical",
        issue: "Title is missing or empty.",
        recommendation: "Provide a descriptive, keyword-rich title up to 30 characters.",
      });
      score -= 20;
    }

    // 2. Subtitle / Short Description
    if (store === "apple") {
      if (!data.subtitle || data.subtitle.trim().length === 0) {
        gaps.push({
          locale,
          field: "subtitle",
          severity: "warning",
          issue: "Apple subtitle is missing.",
          recommendation: "Add a 30-character subtitle to boost conversion and ranking.",
        });
        score -= 15;
      }
    } else {
      if (!data.shortDescription || data.shortDescription.trim().length === 0) {
        gaps.push({
          locale,
          field: "shortDescription",
          severity: "warning",
          issue: "Google Play short description is missing.",
          recommendation: "Add an engaging short description up to 80 characters.",
        });
        score -= 15;
      }
    }

    // 3. Keywords (Apple only)
    if (store === "apple") {
      if (!data.keywords || data.keywords.trim().length === 0) {
        gaps.push({
          locale,
          field: "keywords",
          severity: "critical",
          issue: "Apple keywords field is empty.",
          recommendation: "Fill the 100-character keyword field with comma-separated high-intent search terms.",
        });
        score -= 20;
      } else if (data.keywords.length < 50) {
        gaps.push({
          locale,
          field: "keywords",
          severity: "info",
          issue: `Keyword space is underutilized (${data.keywords.length}/100 characters used).`,
          recommendation: "Add more relevant keywords to maximize search exposure up to 100 characters.",
        });
        score -= 5;
      }
    }

    // 4. Screenshots check
    if (data.hasScreenshots === false || (data.screenshotCount !== undefined && data.screenshotCount === 0)) {
      gaps.push({
        locale,
        field: "hasScreenshots",
        severity: "critical",
        issue: "No localized screenshots provided.",
        recommendation: "Upload localized screenshots for this locale to improve conversion.",
      });
      score -= 20;
    }

    // 5. Check character limit violations
    const validation = validateFieldLimits(store, {
      title: data.title,
      subtitle: data.subtitle,
      shortDescription: data.shortDescription,
      keywords: data.keywords,
      description: data.description,
    });

    for (const v of validation.violations) {
      gaps.push({
        locale,
        field: v.field,
        severity: "critical",
        issue: v.message,
        recommendation: `Trim "${v.field}" to under ${v.limit} characters.`,
      });
      score -= 15;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    appId: metadata.appId,
    appName: metadata.appName,
    store,
    score,
    totalLocales,
    gaps,
    summary: `ASO Score: ${score}/100 across ${totalLocales} locale(s) with ${gaps.length} identified gap(s).`,
  };
}

/**
 * Compare current vs proposed metadata, check length limits, and generate a side-by-side Markdown diff.
 */
export function diffMetadataFields(
  store: StoreType,
  current: Record<string, string | undefined>,
  proposed: Record<string, string | undefined>,
): MetadataDiffResult {
  const limits = CHAR_LIMITS[store];
  const allKeys = [...new Set([...Object.keys(current), ...Object.keys(proposed)])];
  const changes: FieldChange[] = [];
  let hasErrors = false;

  for (const field of allKeys) {
    const curVal = current[field] ?? "";
    const propVal = proposed[field] ?? "";
    if (curVal === propVal && curVal === "") continue;

    const limit = limits[field];
    const exceedsLimit = limit !== undefined ? propVal.length > limit : false;
    if (exceedsLimit) hasErrors = true;

    changes.push({
      field,
      currentValue: curVal,
      proposedValue: propVal,
      currentLength: curVal.length,
      proposedLength: propVal.length,
      limit,
      exceedsLimit,
    });
  }

  const lines: string[] = [
    `# Metadata Dry-Run Preview (${store.toUpperCase()})`,
    ``,
    `| Field | Current Length | Proposed Length | Max Limit | Status |`,
    `|---|---|---|---|---|`,
  ];

  for (const c of changes) {
    const limitText = c.limit !== undefined ? String(c.limit) : "N/A";
    const statusText = c.exceedsLimit
      ? `EXCEEDS LIMIT (${c.proposedLength}/${limitText})`
      : c.currentValue !== c.proposedValue
      ? "Changed"
      : "Unchanged";

    lines.push(`| \`${c.field}\` | ${c.currentLength} | ${c.proposedLength} | ${limitText} | ${statusText} |`);
  }

  lines.push(``);
  lines.push(`### Proposed Changes Diff`);
  for (const c of changes) {
    if (c.currentValue === c.proposedValue) continue;
    lines.push(`**Field \`${c.field}\`:**`);
    lines.push("```diff");
    if (c.currentValue) lines.push(`- ${c.currentValue}`);
    if (c.proposedValue) lines.push(`+ ${c.proposedValue}`);
    lines.push("```");
  }

  return {
    store,
    hasErrors,
    changes,
    formattedMarkdown: lines.join("\n"),
  };
}

