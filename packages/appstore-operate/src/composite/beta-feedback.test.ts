import test from "node:test";
import assert from "node:assert/strict";
import {
  executeBetaFeedbackSummary,
  executeCrashReports,
  type AscRequester,
  type FeedbackItem,
} from "./beta-feedback.js";
import { formatBetaFeedbackSummary, formatCrashReports } from "./formatters.js";
import type { AscRequestInit, AscResponse } from "../utils/http.js";

function createMockAscRequester(): AscRequester {
  return async (init: AscRequestInit): Promise<AscResponse<any>> => {
    if (init.path.includes("betaFeedbackCrashSubmissions")) {
      return {
        status: 200,
        headers: {},
        requestId: "req-crash-1",
        body: {
          data: [
            {
              id: "crash-1",
              type: "betaFeedbackCrashSubmissions",
              attributes: {
                comment: "App crashed when tapping checkout",
                createdDate: "2026-11-10T12:00:00Z",
                deviceModel: "iPhone14,2",
                osVersion: "17.4.1",
                appUptimeInMilliseconds: 14500,
                batteryPercentage: 0.72,
                diskBytesAvailable: 50000000000,
              },
            },
            {
              id: "crash-2",
              type: "betaFeedbackCrashSubmissions",
              attributes: {
                comment: "Freeze on startup",
                createdDate: "2026-11-11T09:30:00Z",
                deviceModel: "iPhone14,2",
                osVersion: "17.5.0",
                appUptimeInMilliseconds: 3200,
                batteryPercentage: 0.45,
                diskBytesAvailable: 12000000000,
              },
            },
          ],
        },
      };
    }

    if (init.path.includes("betaFeedbackScreenshotSubmissions")) {
      return {
        status: 200,
        headers: {},
        requestId: "req-shot-1",
        body: {
          data: [
            {
              id: "shot-1",
              type: "betaFeedbackScreenshotSubmissions",
              attributes: {
                comment: "The French text overflows the button",
                createdDate: "2026-11-09T15:00:00Z",
                deviceModel: "iPhone15,3",
                osVersion: "17.4.1",
                locale: "fr-FR",
              },
            },
            {
              id: "shot-2",
              type: "betaFeedbackScreenshotSubmissions",
              attributes: {
                comment: "Loving the new onboarding flow, very smooth!",
                createdDate: "2026-11-11T16:00:00Z",
                deviceModel: "iPad13,4",
                osVersion: "17.5.0",
                locale: "en-US",
              },
            },
          ],
        },
      };
    }

    throw new Error(`Unhandled mock path: ${init.path}`);
  };
}

test("executeBetaFeedbackSummary fetches, categorizes and prioritizes feedback", async () => {
  const mockRequester = createMockAscRequester();

  const result = await executeBetaFeedbackSummary(
    {
      appId: "123456789",
      limit: 10,
    },
    mockRequester,
  );

  assert.equal(result.appId, "123456789");
  assert.equal(result.totalCrashSubmissions, 2);
  assert.equal(result.totalScreenshotSubmissions, 2);

  // Check priority classification
  assert.equal(result.categories.blockers.length, 2, "Crashes and freezes must be blockers");
  assert.ok(result.categories.blockers.some((b: FeedbackItem) => b.comment.includes("checkout")));
  assert.ok(result.categories.blockers.some((b: FeedbackItem) => b.comment.includes("Freeze")));

  assert.equal(result.categories.bugs.length, 1, "Overflow text should be classified as bug");
  assert.ok(result.categories.bugs[0]?.comment.includes("overflows"));

  assert.equal(result.categories.usability.length, 1, "Praise/suggestion is usability");
  assert.ok(result.categories.usability[0]?.comment.includes("Loving the new onboarding"));

  const md = formatBetaFeedbackSummary(result);
  assert.ok(md.includes("TestFlight Beta Feedback Summary"));
  assert.ok(md.includes("Blockers & Crashes"));
  assert.ok(md.includes("Bugs & Functional Issues"));
});

test("executeCrashReports analyzes device and OS distribution", async () => {
  const mockRequester = createMockAscRequester();

  const result = await executeCrashReports(
    {
      appId: "123456789",
    },
    mockRequester,
  );

  assert.equal(result.totalCrashes, 2);
  assert.equal(result.deviceDistribution["iPhone14,2"], 2);
  assert.equal(result.osDistribution["17.4.1"], 1);
  assert.equal(result.osDistribution["17.5.0"], 1);
  assert.equal(result.averageUptimeSeconds, 9); // (14.5 + 3.2) / 2 = 8.85 rounded to 9

  const md = formatCrashReports(result);
  assert.ok(md.includes("TestFlight Crash Diagnostics"));
  assert.ok(md.includes("iPhone14,2"));
});
