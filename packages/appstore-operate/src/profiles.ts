/**
 * App Store profiles, modelled on asc-mcp --workers.
 * Generated tool names are Apple operationIds in snake_case, so profiles
 * match on substrings/prefixes, not on a curated name list.
 * "full" = every tool. accounts_/auth_ are always kept (see server.ts).
 */
export const APPSTORE_PROFILES = ["apps", "builds", "testflight", "monetization", "marketing", "analytics", "full"] as const;

const RULES: Array<[string[], string[]]> = [
  [["apps_", "app_infos", "app_store_versions", "app_store_version_localizations", "app_availabilities", "app_categories", "app_encryption", "app_data_usages", "age_rating", "accessibility_", "end_user_license", "territories", "review_submissions", "customer_reviews", "app_store_review", "users", "actors", "bundle_ids", "certificates", "devices", "profiles"], ["apps"]],
  [["builds_", "build_bundles", "build_beta", "ci_", "scm_"], ["builds"]],
  [["beta_", "sandbox_testers", "beta_app", "pre_release", "testflight_"], ["testflight"]],
  [["in_app_purchases", "subscriptions", "subscription_", "promoted_purchases", "app_prices", "app_price_points", "app_price_schedules", "win_back", "offer_codes"], ["monetization"]],
  [["app_custom_product_page", "app_store_version_experiments", "app_screenshots", "app_previews", "app_events", "app_asset_library", "promoted_purchases", "aso_audit_", "metadata_dry_run_"], ["marketing"]],
  [["analytics_", "sales_reports", "finance_reports", "diagnostic_", "app_perf", "build_perf", "power_perf", "metrics"], ["analytics"]],
];

export function profileForTool(name: string): string[] {
  const out: string[] = [];
  for (const [keys, profiles] of RULES) {
    if (keys.some((k) => name.includes(k))) out.push(...profiles);
  }
  // "apps" is the fallback so no tool is silently unprofiled.
  if (out.length === 0) out.push("apps");
  return [...new Set(out)];
}
