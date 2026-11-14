import test from "node:test";
import assert from "node:assert/strict";
import { executeDeployApp } from "./deploy.js";
import {
  executeCreateRelease,
  executePromoteRelease,
  executeUpdateRollout,
  executeHaltRollout,
} from "./release-lifecycle.js";

// Mock Publisher client factory
function createMockPublisher(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const editId = "test-edit-999";

  const mock = {
    calls,
    edits: {
      insert: async () => {
        calls.push("edits.insert");
        return { data: { id: editId, expiryTimeSeconds: "3600" } };
      },
      delete: async (params: { editId: string }) => {
        calls.push(`edits.delete:${params.editId}`);
        return { data: {} };
      },
      validate: async (params: { editId: string }) => {
        calls.push(`edits.validate:${params.editId}`);
        return { data: { id: params.editId } };
      },
      commit: async (params: { editId: string }) => {
        calls.push(`edits.commit:${params.editId}`);
        return { data: { id: params.editId } };
      },
      bundles: {
        upload: async () => {
          if (overrides.uploadError) {
            throw new Error(String(overrides.uploadError));
          }
          calls.push("bundles.upload");
          return { data: { versionCode: 105, sha256: "abc123hash" } };
        },
      },
      apks: {
        upload: async () => {
          calls.push("apks.upload");
          return { data: { versionCode: 105 } };
        },
      },
      tracks: {
        get: async (params: { track: string }) => {
          calls.push(`tracks.get:${params.track}`);
          return {
            data: {
              track: params.track,
              releases: [
                {
                  name: "1.0.4",
                  versionCodes: ["104"],
                  status: "completed",
                  releaseNotes: [{ language: "en-US", text: "Previous release" }],
                },
              ],
            },
          };
        },
        update: async (params: { track: string; requestBody: unknown }) => {
          if (overrides.trackUpdateError) {
            throw new Error(String(overrides.trackUpdateError));
          }
          calls.push(`tracks.update:${params.track}`);
          return { data: params.requestBody };
        },
      },
    },
  };

  return mock;
}

test("executeDeployApp executes full lifecycle and commits edit", async () => {
  const mock = createMockPublisher();

  const result = await executeDeployApp(
    {
      packageName: "com.example.app",
      track: "production",
      filePath: "/fake/path/app.aab",
      releaseNotes: [{ language: "en-US", text: "New bug fixes" }],
      userFraction: 0.1,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock as any,
    { skipFileCheck: true },
  );

  assert.equal(result.success, true);
  assert.equal(result.versionCode, 105);
  assert.equal(result.track, "production");
  assert.equal(result.status, "inProgress");
  assert.equal(result.userFraction, 0.1);
  assert.equal(result.committed, true);

  assert.ok(mock.calls.includes("edits.insert"));
  assert.ok(mock.calls.includes("bundles.upload"));
  assert.ok(mock.calls.includes("tracks.update:production"));
  assert.ok(mock.calls.includes("edits.commit:test-edit-999"));
  assert.ok(!mock.calls.some((c) => c.startsWith("edits.delete")));
});

test("executeDeployApp in validateOnly mode validates and cleans up edit", async () => {
  const mock = createMockPublisher();

  const result = await executeDeployApp(
    {
      packageName: "com.example.app",
      track: "beta",
      filePath: "/fake/path/app.aab",
      validateOnly: true,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock as any,
    { skipFileCheck: true },
  );

  assert.equal(result.success, true);
  assert.equal(result.committed, false);
  assert.equal(result.validated, true);

  assert.ok(mock.calls.includes("edits.validate:test-edit-999"));
  assert.ok(mock.calls.includes("edits.delete:test-edit-999"), "must delete edit on validateOnly");
  assert.ok(!mock.calls.some((c) => c.startsWith("edits.commit")));
});

test("executeDeployApp rolls back edit if upload or track update fails", async () => {
  const mock = createMockPublisher({ uploadError: "Invalid APK manifest" });

  await assert.rejects(
    async () => {
      await executeDeployApp(
        {
          packageName: "com.example.app",
          track: "production",
          filePath: "/fake/path/app.aab",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mock as any,
        { skipFileCheck: true },
      );
    },
    { message: /Invalid APK manifest/ },
  );

  assert.ok(mock.calls.includes("edits.insert"));
  assert.ok(mock.calls.includes("edits.delete:test-edit-999"), "must delete edit on failure");
  assert.ok(!mock.calls.some((c) => c.startsWith("edits.commit")));
});

test("executePromoteRelease promotes from beta to production", async () => {
  const mock = createMockPublisher();

  const result = await executePromoteRelease(
    {
      packageName: "com.example.app",
      fromTrack: "beta",
      toTrack: "production",
      userFraction: 0.2,
      releaseNotes: [{ language: "en-US", text: "Promoted to production 20%" }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock as any,
  );

  assert.equal(result.success, true);
  assert.equal(result.versionCodes[0], "104");
  assert.equal(result.track, "production");
  assert.equal(result.userFraction, 0.2);
  assert.equal(result.status, "inProgress");

  assert.ok(mock.calls.includes("tracks.get:beta"));
  assert.ok(mock.calls.includes("tracks.update:production"));
  assert.ok(mock.calls.includes("edits.commit:test-edit-999"));
});

test("executeCreateRelease creates and stages new release", async () => {
  const mock = createMockPublisher();

  const result = await executeCreateRelease(
    {
      packageName: "com.example.app",
      track: "alpha",
      versionCodes: ["106"],
      name: "1.0.6",
      releaseNotes: [{ language: "en-US", text: "Alpha tester build" }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock as any,
  );

  assert.equal(result.success, true);
  assert.equal(result.track, "alpha");
  assert.equal(result.versionCodes[0], "106");
  assert.equal(result.committed, true);
  assert.ok(mock.calls.includes("tracks.update:alpha"));
  assert.ok(mock.calls.includes("edits.commit:test-edit-999"));
});

test("executeUpdateRollout increases user fraction to 100% and marks completed", async () => {
  const mock = createMockPublisher();

  const result = await executeUpdateRollout(
    {
      packageName: "com.example.app",
      track: "production",
      userFraction: 1.0,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock as any,
  );

  assert.equal(result.success, true);
  assert.equal(result.status, "completed");
  assert.equal(result.userFraction, undefined);
  assert.ok(mock.calls.includes("tracks.get:production"));
  assert.ok(mock.calls.includes("tracks.update:production"));
  assert.ok(mock.calls.includes("edits.commit:test-edit-999"));
});

import { createConfirmationToken } from "@store-mcp/shared";

test("executeHaltRollout halts rollout with safety confirmation", async () => {
  const mock = createMockPublisher();

  // Phase 1: Calling without confirmation token is rejected
  await assert.rejects(
    async () => {
      await executeHaltRollout(
        {
          packageName: "com.example.app",
          track: "production",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mock as any,
      );
    },
    { message: /Two-phase confirmation required/ },
  );

  // Phase 2: Create a valid confirmation token with matching payload and execute
  const params = {
    packageName: "com.example.app",
    track: "production",
  };

  const token = createConfirmationToken({
    action: "halt_rollout",
    target: "com.example.app",
    params,
  });

  const result = await executeHaltRollout(
    {
      ...params,
      confirmationId: token.confirmationId,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock as any,
  );

  assert.equal(result.success, true);
  assert.equal(result.status, "halted");
  assert.ok(mock.calls.includes("tracks.update:production"));
  assert.ok(mock.calls.includes("edits.commit:test-edit-999"));
});
