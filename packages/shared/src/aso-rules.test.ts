import test from "node:test";
import assert from "node:assert/strict";
import {
  auditAsoMetadata,
  validateFieldLimits,
  diffMetadataFields,
  type AppMetadata,
} from "./aso-rules.js";

test("validateFieldLimits enforces Apple character limits", () => {
  const result = validateFieldLimits("apple", {
    name: "A".repeat(31), // Max 30
    subtitle: "Valid Subtitle", // <= 30
    keywords: "A".repeat(101), // Max 100
  });

  assert.equal(result.valid, false);
  assert.equal(result.violations.length, 2);
  assert.ok(result.violations.some((v) => v.field === "name" && v.limit === 30));
  assert.ok(result.violations.some((v) => v.field === "keywords" && v.limit === 100));
});

test("validateFieldLimits enforces Google character limits", () => {
  const result = validateFieldLimits("google", {
    title: "Good App",
    shortDescription: "B".repeat(81), // Max 80
    fullDescription: "C".repeat(4001), // Max 4000
  });

  assert.equal(result.valid, false);
  assert.equal(result.violations.length, 2);
  assert.ok(result.violations.some((v) => v.field === "shortDescription" && v.limit === 80));
  assert.ok(result.violations.some((v) => v.field === "fullDescription" && v.limit === 4000));
});

test("auditAsoMetadata identifies ASO gaps across locales", () => {
  const metadata: AppMetadata = {
    appId: "com.example.app",
    defaultLocale: "en-US",
    locales: {
      "en-US": {
        title: "Productivity Tool",
        subtitle: "", // Gap: empty subtitle
        keywords: "todo", // Gap: keyword space underutilized (< 50 chars)
        description: "Full description...",
        hasScreenshots: true,
      },
      "vi-VN": {
        title: "Ứng dụng năng suất",
        subtitle: "Quản lý công việc",
        keywords: "", // Gap: empty keywords
        description: "Mô tả đầy đủ...",
        hasScreenshots: false, // Gap: missing screenshots in localized store
      },
    },
  };

  const audit = auditAsoMetadata("apple", metadata);
  assert.equal(audit.appId, "com.example.app");
  assert.ok(audit.score < 100);

  const gaps = audit.gaps;
  assert.ok(gaps.some((g) => g.locale === "en-US" && g.field === "subtitle"));
  assert.ok(gaps.some((g) => g.locale === "vi-VN" && g.field === "hasScreenshots"));
  assert.ok(gaps.some((g) => g.locale === "vi-VN" && g.field === "keywords"));
});

test("diffMetadataFields produces side-by-side diff with limit checks", () => {
  const current = {
    title: "Old Title",
    subtitle: "Short",
  };
  const proposed = {
    title: "New Title 2026",
    subtitle: "A".repeat(35), // Over limit for Apple
  };

  const diff = diffMetadataFields("apple", current, proposed);
  assert.equal(diff.hasErrors, true);
  assert.equal(diff.changes.length, 2);

  const subChange = diff.changes.find((c) => c.field === "subtitle");
  assert.ok(subChange);
  assert.equal(subChange?.exceedsLimit, true);
  assert.equal(subChange?.proposedLength, 35);
  assert.equal(subChange?.limit, 30);
});

