/**
 * Play-operate profiles (idea grafted from asc-mcp --workers).
 * A tool belongs to one or more profiles by name prefix.
 * "full" = every tool. accounts_/auth_ are always kept (see server.ts).
 */
export const PLAY_PROFILES = ["apps", "release", "listings", "reviews", "monetization", "vitals", "full"] as const;
export type PlayProfile = (typeof PLAY_PROFILES)[number];

const RULES: Array<[string[], string[]]> = [
  [["apps_", "accounts_", "auth_", "users_", "grants_"], ["apps"]],
  [
    [
      "edits_", "tracks_", "bundles_", "apks_", "testers_", "device_tier_",
      "app_recovery", "apprecovery_", "appsigning_", "generated_apks", "system_apks",
      "internal_app_sharing", "internalappsharingartifacts_", "deobfuscation_",
      "deploy_", "create_release", "promote_release", "update_rollout", "halt_rollout",
      "applications_",
    ],
    ["release"],
  ],
  [["listings_", "images_", "details_", "country_availability_", "aso_audit_", "metadata_dry_run_", "appstorecatalog_"], ["listings"]],
  [["reviews_", "appstoreappsreview_"], ["reviews"]],
  [["onetime_products_", "subscriptions_", "subscription_", "purchases_", "orders_", "external_transactions_", "monetization_", "inappproducts_"], ["monetization"]],
  [["reports_"], ["vitals"]],
];

export function profileForTool(name: string): string[] {
  const out: string[] = [];
  for (const [prefixes, profiles] of RULES) {
    if (prefixes.some((p) => name.startsWith(p))) out.push(...profiles);
  }
  return [...new Set(out)];
}
