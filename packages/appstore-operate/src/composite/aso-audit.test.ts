import test from "node:test";
import assert from "node:assert/strict";
import { executeAsoAuditPortfolio, executeMetadataDryRunPreview } from "./aso-audit.js";
import type { AscRequester } from "./beta-feedback.js";
import type { AscRequestInit, AscResponse } from "../utils/http.js";

function createMockAscRequester(): AscRequester {
  return async (init: AscRequestInit): Promise<AscResponse<any>> => {
    const path = init.path;

    if (path === "/v1/apps") {
      return {
        status: 200,
        headers: {},
        requestId: "req-1",
        body: {
          data: [
            {
              id: "app-1",
              type: "apps",
              attributes: { name: "DoneDone", bundleId: "com.donedone.app", primaryLocale: "en-US" },
            },
          ],
        },
      };
    }

    if (path.includes("/appInfos") && !path.includes("appInfoLocalizations")) {
      return {
        status: 200,
        headers: {},
        requestId: "req-2",
        body: {
          data: [{ id: "info-1", type: "appInfos" }],
        },
      };
    }

    if (path.includes("/appInfoLocalizations")) {
      return {
        status: 200,
        headers: {},
        requestId: "req-3",
        body: {
          data: [
            {
              id: "infoloc-1",
              type: "appInfoLocalizations",
              attributes: { locale: "en-US", name: "DoneDone", subtitle: "" },
            },
          ],
        },
      };
    }

    if (path.includes("/appStoreVersions") && !path.includes("appStoreVersionLocalizations")) {
      return {
        status: 200,
        headers: {},
        requestId: "req-4",
        body: {
          data: [{ id: "ver-1", type: "appStoreVersions", attributes: { versionString: "1.0.0" } }],
        },
      };
    }

    if (path.includes("/appStoreVersionLocalizations") && !path.includes("appScreenshotSets")) {
      return {
        status: 200,
        headers: {},
        requestId: "req-5",
        body: {
          data: [
            {
              id: "verloc-1",
              type: "appStoreVersionLocalizations",
              attributes: { locale: "en-US", keywords: "", description: "Track tasks with ease." },
            },
          ],
        },
      };
    }

    if (path.includes("/appScreenshotSets")) {
      return {
        status: 200,
        headers: {},
        requestId: "req-6",
        body: {
          data: [], // No screenshots!
        },
      };
    }

    throw new Error(`Unhandled mock path: ${path}`);
  };
}

test("executeAsoAuditPortfolio audits app metadata and flags omissions", async () => {
  const mock = createMockAscRequester();
  const report = await executeAsoAuditPortfolio({ appId: "app-1" }, mock);

  assert.equal(report.reports.length, 1);
  const appReport = report.reports[0]!;
  assert.equal(appReport.appId, "app-1");
  assert.ok(appReport.score < 80);

  const gapFields = appReport.gaps.map((g) => g.field);
  assert.ok(gapFields.includes("subtitle"), "Must flag empty subtitle");
  assert.ok(gapFields.includes("keywords"), "Must flag empty keywords");
  assert.ok(gapFields.includes("hasScreenshots"), "Must flag missing screenshots");
});

test("executeMetadataDryRunPreview catches Apple limit overflows", () => {
  const preview = executeMetadataDryRunPreview({
    current: { subtitle: "Simple App" },
    proposed: { subtitle: "This subtitle is way too long for Apple Store limit" },
  });

  assert.equal(preview.hasErrors, true);
  assert.ok(preview.formattedMarkdown.includes("EXCEEDS LIMIT"));
});

