import { z } from "zod";
import type { androidpublisher_v3 } from "googleapis";
import { defineTool, type Tool } from "../utils/tool.js";
import { publisher } from "../auth/client-factory.js";
import { packageNameArg, trackArg } from "../utils/schemas.js";
import { destructiveGate } from "@store-mcp/shared";
import { formatReleaseLifecycleResult, type ReleaseLifecycleResult } from "./formatters.js";

// ---------- 1. create_release ----------
export const createReleaseInputSchema = z
  .object({
    packageName: packageNameArg,
    track: trackArg,
    versionCodes: z.array(z.string()).min(1).describe("Version codes to release on this track."),
    status: z
      .enum(["completed", "draft", "inProgress", "halted"])
      .optional()
      .describe("Status of the release. Defaults to 'completed' or 'inProgress' if fraction < 1."),
    userFraction: z
      .number()
      .min(0.0001)
      .max(1.0)
      .optional()
      .describe("Fraction for staged rollout (e.g. 0.1 for 10%)."),
    name: z.string().optional().describe("Release name, e.g. '1.0.1'"),
    releaseNotes: z
      .array(
        z.object({
          language: z.string().describe("BCP-47 tag, e.g. 'en-US'"),
          text: z.string(),
        }),
      )
      .optional(),
    validateOnly: z.boolean().optional().describe("Dry-run validation mode."),
  })
  .strict();

export async function executeCreateRelease(
  input: z.infer<typeof createReleaseInputSchema>,
  client?: androidpublisher_v3.Androidpublisher,
): Promise<ReleaseLifecycleResult> {
  const pub = client ?? (await publisher());
  const { packageName, track, versionCodes, name, releaseNotes, validateOnly = false } = input;

  let userFraction = input.userFraction;
  let status = input.status;
  if (!status) {
    if (userFraction !== undefined && userFraction < 1.0) {
      status = "inProgress";
    } else {
      status = "completed";
      userFraction = undefined;
    }
  }

  const insertRes = await pub.edits.insert({ packageName, requestBody: {} });
  const editId = insertRes.data.id!;

  try {
    const releasePayload: Record<string, unknown> = {
      versionCodes,
      status,
      releaseNotes: releaseNotes ?? [],
    };
    if (userFraction !== undefined) releasePayload.userFraction = userFraction;
    if (name) releasePayload.name = name;

    await pub.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: { track, releases: [releasePayload] },
    });

    if (validateOnly) {
      await pub.edits.validate({ packageName, editId });
      await pub.edits.delete({ packageName, editId });
      return {
        success: true,
        packageName,
        track,
        versionCodes,
        status,
        userFraction,
        committed: false,
        validated: true,
        editId,
        message: "Release validated successfully (dry-run).",
      };
    }

    await pub.edits.commit({ packageName, editId });
    return {
      success: true,
      packageName,
      track,
      versionCodes,
      status,
      userFraction,
      committed: true,
      validated: false,
      editId,
      message: "Release successfully created and committed.",
    };
  } catch (err) {
    try {
      await pub.edits.delete({ packageName, editId });
    } catch {
      // Ignore cleanup error
    }
    throw err;
  }
}

// ---------- 2. promote_release ----------
export const promoteReleaseInputSchema = z
  .object({
    packageName: packageNameArg,
    fromTrack: trackArg.describe("Source track to promote from, e.g. 'beta' or 'internal'"),
    toTrack: trackArg.describe("Destination track to promote to, e.g. 'production'"),
    versionCodes: z
      .array(z.string())
      .optional()
      .describe("Specific version codes to promote. Omit to promote the active release from fromTrack."),
    userFraction: z
      .number()
      .min(0.0001)
      .max(1.0)
      .optional()
      .describe("Staged rollout fraction on the target track."),
    releaseNotes: z
      .array(
        z.object({
          language: z.string(),
          text: z.string(),
        }),
      )
      .optional()
      .describe("Optional release notes to replace source track notes."),
    validateOnly: z.boolean().optional(),
  })
  .strict();

export function selectActiveRelease(
  releases: Array<Record<string, unknown>>,
  preferredStatuses: string[] = ["completed", "inProgress", "draft"],
): Record<string, unknown> {
  if (!releases || releases.length === 0) {
    throw new Error("No releases found on track.");
  }
  const getHighestVersionCode = (r: Record<string, unknown>): number => {
    const codes = (r.versionCodes as string[] | number[]) ?? [];
    return Math.max(0, ...codes.map((c) => Number(c) || 0));
  };

  const sorted = [...releases].sort((a, b) => {
    const aStatusIdx = preferredStatuses.indexOf(String(a.status));
    const bStatusIdx = preferredStatuses.indexOf(String(b.status));
    const aRank = aStatusIdx === -1 ? 999 : aStatusIdx;
    const bRank = bStatusIdx === -1 ? 999 : bStatusIdx;
    if (aRank !== bRank) return aRank - bRank;
    return getHighestVersionCode(b) - getHighestVersionCode(a);
  });

  return sorted[0]!;
}

export async function executePromoteRelease(
  input: z.infer<typeof promoteReleaseInputSchema>,
  client?: androidpublisher_v3.Androidpublisher,
): Promise<ReleaseLifecycleResult> {
  const pub = client ?? (await publisher());
  const { packageName, fromTrack, toTrack, releaseNotes, validateOnly = false } = input;

  const insertRes = await pub.edits.insert({ packageName, requestBody: {} });
  const editId = insertRes.data.id!;

  try {
    // Read source track releases
    const sourceTrackRes = await pub.edits.tracks.get({ packageName, editId, track: fromTrack });
    const sourceReleases = (sourceTrackRes.data.releases ?? []) as Array<Record<string, unknown>>;
    if (sourceReleases.length === 0) {
      throw new Error(`No active releases found on source track "${fromTrack}".`);
    }

    const latestRelease = selectActiveRelease(sourceReleases, ["completed", "inProgress", "draft"]);
    const versionCodes = input.versionCodes ?? (latestRelease.versionCodes as string[]);
    if (!versionCodes || versionCodes.length === 0) {
      throw new Error(`Could not resolve versionCodes to promote from track "${fromTrack}".`);
    }

    let userFraction = input.userFraction;
    let status = "completed";
    if (userFraction !== undefined && userFraction < 1.0) {
      status = "inProgress";
    } else {
      userFraction = undefined;
    }

    const targetRelease: Record<string, unknown> = {
      versionCodes,
      status,
      name: latestRelease.name,
      releaseNotes: releaseNotes ?? latestRelease.releaseNotes ?? [],
    };
    if (userFraction !== undefined) targetRelease.userFraction = userFraction;

    await pub.edits.tracks.update({
      packageName,
      editId,
      track: toTrack,
      requestBody: { track: toTrack, releases: [targetRelease] },
    });

    if (validateOnly) {
      await pub.edits.validate({ packageName, editId });
      await pub.edits.delete({ packageName, editId });
      return {
        success: true,
        packageName,
        track: toTrack,
        versionCodes,
        status,
        userFraction,
        committed: false,
        validated: true,
        editId,
        message: `Promotion from ${fromTrack} to ${toTrack} validated successfully.`,
      };
    }

    await pub.edits.commit({ packageName, editId });
    return {
      success: true,
      packageName,
      track: toTrack,
      versionCodes,
      status,
      userFraction,
      committed: true,
      validated: false,
      editId,
      message: `Successfully promoted release from ${fromTrack} to ${toTrack}.`,
    };
  } catch (err) {
    try {
      await pub.edits.delete({ packageName, editId });
    } catch {
      // Ignore
    }
    throw err;
  }
}

// ---------- 3. update_rollout ----------
export const updateRolloutInputSchema = z
  .object({
    packageName: packageNameArg,
    track: trackArg,
    userFraction: z
      .number()
      .min(0.0001)
      .max(1.0)
      .describe("New rollout fraction (e.g. 0.5 for 50%, 1.0 for 100% full release)."),
    validateOnly: z.boolean().optional(),
  })
  .strict();

export async function executeUpdateRollout(
  input: z.infer<typeof updateRolloutInputSchema>,
  client?: androidpublisher_v3.Androidpublisher,
): Promise<ReleaseLifecycleResult> {
  const pub = client ?? (await publisher());
  const { packageName, track, validateOnly = false } = input;
  let userFraction = input.userFraction;

  const insertRes = await pub.edits.insert({ packageName, requestBody: {} });
  const editId = insertRes.data.id!;

  try {
    const trackRes = await pub.edits.tracks.get({ packageName, editId, track });
    const releases = (trackRes.data.releases ?? []) as Array<Record<string, unknown>>;
    if (releases.length === 0) {
      throw new Error(`No active release found on track "${track}".`);
    }

    const current = selectActiveRelease(releases, ["inProgress", "draft", "completed"]);
    let status = "inProgress";
    if (userFraction >= 1.0) {
      status = "completed";
      userFraction = undefined as any;
    }

    const updatedRelease: Record<string, unknown> = {
      ...current,
      status,
    };
    if (userFraction !== undefined) {
      updatedRelease.userFraction = userFraction;
    } else {
      delete updatedRelease.userFraction;
    }

    await pub.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: { track, releases: [updatedRelease] },
    });

    if (validateOnly) {
      await pub.edits.validate({ packageName, editId });
      await pub.edits.delete({ packageName, editId });
      return {
        success: true,
        packageName,
        track,
        versionCodes: (current.versionCodes as string[]) ?? [],
        status,
        userFraction,
        committed: false,
        validated: true,
        editId,
        message: `Rollout update validated successfully for track "${track}".`,
      };
    }

    await pub.edits.commit({ packageName, editId });
    return {
      success: true,
      packageName,
      track,
      versionCodes: (current.versionCodes as string[]) ?? [],
      status,
      userFraction,
      committed: true,
      validated: false,
      editId,
      message: `Rollout fraction updated successfully on track "${track}".`,
    };
  } catch (err) {
    try {
      await pub.edits.delete({ packageName, editId });
    } catch {
      // Ignore
    }
    throw err;
  }
}

// ---------- 4. halt_rollout ----------
export const haltRolloutInputSchema = z
  .object({
    packageName: packageNameArg,
    track: trackArg,
    confirm: z.boolean().optional(),
    confirmationId: z.string().optional(),
    validateOnly: z.boolean().optional(),
  })
  .strict();

export async function executeHaltRollout(
  input: z.infer<typeof haltRolloutInputSchema>,
  client?: androidpublisher_v3.Androidpublisher,
): Promise<ReleaseLifecycleResult> {
  const gate = destructiveGate("halt_rollout", input);
  if (gate) {
    throw new Error(gate);
  }

  const pub = client ?? (await publisher());
  const { packageName, track, validateOnly = false } = input;

  const insertRes = await pub.edits.insert({ packageName, requestBody: {} });
  const editId = insertRes.data.id!;

  try {
    const trackRes = await pub.edits.tracks.get({ packageName, editId, track });
    const releases = (trackRes.data.releases ?? []) as Array<Record<string, unknown>>;
    if (releases.length === 0) {
      throw new Error(`No active release found on track "${track}".`);
    }

    const current = selectActiveRelease(releases, ["inProgress", "draft", "completed"]);
    const updatedRelease: Record<string, unknown> = {
      ...current,
      status: "halted",
    };

    await pub.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: { track, releases: [updatedRelease] },
    });

    if (validateOnly) {
      await pub.edits.validate({ packageName, editId });
      await pub.edits.delete({ packageName, editId });
      return {
        success: true,
        packageName,
        track,
        versionCodes: (current.versionCodes as string[]) ?? [],
        status: "halted",
        committed: false,
        validated: true,
        editId,
        message: `Halt rollout validated successfully for track "${track}".`,
      };
    }

    await pub.edits.commit({ packageName, editId });
    return {
      success: true,
      packageName,
      track,
      versionCodes: (current.versionCodes as string[]) ?? [],
      status: "halted",
      committed: true,
      validated: false,
      editId,
      message: `Rollout successfully halted on track "${track}".`,
    };
  } catch (err) {
    try {
      await pub.edits.delete({ packageName, editId });
    } catch {
      // Ignore
    }
    throw err;
  }
}

// Export tool definitions
export const createReleaseTool: Tool = defineTool({
  name: "create_release",
  description:
    "Stage and publish a release on any track (internal, alpha, beta, production). Manages edit session automatically with auto-rollback on failure.",
  input: createReleaseInputSchema,
  handler: async (args) => formatReleaseLifecycleResult(await executeCreateRelease(args)),
});

export const promoteReleaseTool: Tool = defineTool({
  name: "promote_release",
  description:
    "Promote an existing release from one track (e.g. beta) to another track (e.g. production) with optional staged rollout percentage and release notes.",
  input: promoteReleaseInputSchema,
  handler: async (args) => formatReleaseLifecycleResult(await executePromoteRelease(args)),
});

export const updateRolloutTool: Tool = defineTool({
  name: "update_rollout",
  description:
    "Increase or update the rollout percentage of an active in-progress staged release on a track (e.g. 0.1 -> 0.5 -> 1.0).",
  input: updateRolloutInputSchema,
  handler: async (args) => formatReleaseLifecycleResult(await executeUpdateRollout(args)),
});

export const haltRolloutTool: Tool = defineTool({
  name: "halt_rollout",
  description:
    "Halt an active staged rollout immediately. Destructive action: requires confirmation.",
  input: haltRolloutInputSchema,
  handler: async (args) => formatReleaseLifecycleResult(await executeHaltRollout(args)),
});

