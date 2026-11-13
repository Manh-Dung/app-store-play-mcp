import fs from "node:fs";
import { z } from "zod";
import type { androidpublisher_v3 } from "googleapis";
import { defineTool, type Tool } from "../utils/tool.js";
import { publisher } from "../auth/client-factory.js";
import { packageNameArg, trackArg } from "../utils/schemas.js";
import { formatDeployResult, type DeployResult, type ReleaseNoteItem } from "./formatters.js";

export const deployAppInputSchema = z
  .object({
    packageName: packageNameArg,
    track: trackArg.describe(
      "Target track: 'internal', 'alpha', 'beta', 'production', or a custom closed-testing track ID.",
    ),
    filePath: z.string().describe("Absolute file path to the .aab (App Bundle) or .apk to upload."),
    releaseNotes: z
      .array(
        z.object({
          language: z.string().describe("BCP-47 language tag, e.g. 'en-US', 'vi-VN'"),
          text: z.string().describe("Release notes content for this locale"),
        }),
      )
      .optional()
      .describe("Localized release notes."),
    userFraction: z
      .number()
      .min(0.0001)
      .max(1.0)
      .optional()
      .describe(
        "Fraction of users who will receive the update (e.g. 0.1 for 10% staged rollout). Omit for 100% rollout.",
      ),
    status: z
      .enum(["completed", "draft", "inProgress", "halted"])
      .optional()
      .describe(
        "Release status. Defaults to 'inProgress' if userFraction < 1, otherwise 'completed'.",
      ),
    name: z.string().optional().describe("Human-readable release name, e.g. '1.2.0 (42)'"),
    mappingFilePath: z
      .string()
      .optional()
      .describe("Optional path to ProGuard/R8 mapping.txt deobfuscation file."),
    changesNotSentForReview: z
      .boolean()
      .optional()
      .describe("If true, changes are committed without submitting to review."),
    validateOnly: z
      .boolean()
      .optional()
      .describe(
        "Dry-run mode: validates edit without committing to Play Console and safely cleans up.",
      ),
  })
  .strict();

export type DeployAppInput = z.infer<typeof deployAppInputSchema>;

export async function executeDeployApp(
  input: DeployAppInput,
  client?: androidpublisher_v3.Androidpublisher,
  options: { skipFileCheck?: boolean } = {},
): Promise<DeployResult> {
  const pub = client ?? (await publisher());
  const {
    packageName,
    track,
    filePath,
    releaseNotes = [],
    name,
    mappingFilePath,
    changesNotSentForReview,
    validateOnly = false,
  } = input;

  if (!options.skipFileCheck && !fs.existsSync(filePath)) {
    throw new Error(`File not found at specified path: ${filePath}`);
  }

  // Determine status & fraction
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

  // Step 1: Open atomic edit session
  const insertRes = await pub.edits.insert({ packageName, requestBody: {} });
  const editId = insertRes.data.id;
  if (!editId) {
    throw new Error("Failed to initialize Google Play edit session (empty edit ID returned).");
  }

  try {
    // Step 2: Upload artifact (AAB or APK)
    let versionCode: number;
    const isAab = filePath.toLowerCase().endsWith(".aab");

    if (isAab) {
      const uploadRes = await pub.edits.bundles.upload({
        packageName,
        editId,
        media: {
          mimeType: "application/octet-stream",
          body: options.skipFileCheck ? ({} as any) : fs.createReadStream(filePath),
        },
      });
      versionCode = uploadRes.data.versionCode!;
    } else {
      const uploadRes = await pub.edits.apks.upload({
        packageName,
        editId,
        media: {
          mimeType: "application/vnd.android.package-archive",
          body: options.skipFileCheck ? ({} as any) : fs.createReadStream(filePath),
        },
      });
      versionCode = uploadRes.data.versionCode!;
    }

    if (!versionCode) {
      throw new Error("Artifact upload succeeded but no versionCode was returned.");
    }

    // Step 3: Upload deobfuscation mapping file if provided
    if (mappingFilePath) {
      if (!options.skipFileCheck && !fs.existsSync(mappingFilePath)) {
        throw new Error(`Mapping file not found: ${mappingFilePath}`);
      }
      await pub.edits.deobfuscationfiles.upload({
        packageName,
        editId,
        deobfuscationFileType: "proguard",
        apkVersionCode: versionCode,
        media: {
          mimeType: "application/octet-stream",
          body: options.skipFileCheck ? ({} as any) : fs.createReadStream(mappingFilePath),
        },
      });
    }

    // Step 4: Update target track with the staged release
    const releasePayload: Record<string, unknown> = {
      versionCodes: [String(versionCode)],
      status,
      releaseNotes: releaseNotes.map((n) => ({
        language: n.language,
        text: n.text,
      })),
    };

    if (userFraction !== undefined) {
      releasePayload.userFraction = userFraction;
    }
    if (name) {
      releasePayload.name = name;
    }

    await pub.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: {
        track,
        releases: [releasePayload],
      },
    });

    // Step 5: Validate or Commit
    if (validateOnly) {
      await pub.edits.validate({ packageName, editId });
      // Always delete edit on dry-run to prevent leaving stale edits
      await pub.edits.delete({ packageName, editId });
      return {
        success: true,
        packageName,
        track,
        versionCode,
        status,
        userFraction,
        committed: false,
        validated: true,
        releaseNotes,
        editId,
        message: "Dry-run validation successful. No changes committed to production.",
      };
    }

    await pub.edits.commit({
      packageName,
      editId,
      changesNotSentForReview,
    });

    return {
      success: true,
      packageName,
      track,
      versionCode,
      status,
      userFraction,
      committed: true,
      validated: false,
      releaseNotes,
      editId,
      message: "Release successfully published to Google Play Console.",
    };
  } catch (err) {
    // Atomic rollback: clean up edit session to prevent leaking resources
    try {
      await pub.edits.delete({ packageName, editId });
    } catch {
      // Ignore secondary error on cleanup
    }
    throw err;
  }
}

export const deployAppTool: Tool = defineTool({
  name: "deploy_app",
  description:
    "1-shot complete deployment to Google Play: opens edit session, uploads AAB/APK, assigns to track with rollout % and release notes, and commits (or dry-run validates). Automatically rolls back on error so no edit session is leaked.",
  input: deployAppInputSchema,
  handler: async (args) => {
    const res = await executeDeployApp(args);
    return formatDeployResult(res);
  },
});

