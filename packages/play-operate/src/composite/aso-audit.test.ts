import test from "node:test";
import assert from "node:assert/strict";
import { executePlayAsoAudit, executePlayMetadataDryRun } from "./aso-audit.js";

function createMockPublisher() {
  const mock = {
    edits: {
      insert: async () => ({ data: { id: "audit-edit-1" } }),
      delete: async () => ({ data: {} }),
      listings: {
        list: async () => ({
          data: {
            listings: [
              {
                language: "en-US",
                title: "Mood Tracker Daily Journal",
                shortDescription: "", // Missing shortDescription!
                fullDescription: "Track your moods daily...",
              },
            ],
          },
        }),
      },
      images: {
        list: async () => ({
          data: {
            images: [], // No screenshots!
          },
        }),
      },
    },
  };
  return mock;
}

test("executePlayAsoAudit identifies missing shortDescription and screenshots", async () => {
  const mock = createMockPublisher();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report = await executePlayAsoAudit("com.example.mood", mock as any);

  assert.equal(report.appId, "com.example.mood");
  assert.equal(report.store, "google");
  assert.ok(report.score < 80);

  const gapFields = report.gaps.map((g) => g.field);
  assert.ok(gapFields.includes("shortDescription"), "Must flag empty shortDescription");
  assert.ok(gapFields.includes("hasScreenshots"), "Must flag missing screenshots");
});

test("executePlayMetadataDryRun validates Google 80-char short description limit", () => {
  const diff = executePlayMetadataDryRun({
    current: { shortDescription: "Good app" },
    proposed: { shortDescription: "B".repeat(85) }, // Exceeds 80 limit
  });

  assert.equal(diff.hasErrors, true);
  assert.ok(diff.formattedMarkdown.includes("EXCEEDS LIMIT"));
});

