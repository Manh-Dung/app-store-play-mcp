/**
 * Download the official Google Play Android Publisher v3 Discovery Document.
 *
 * Usage:
 *   npm run spec:download
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "undici";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SPEC_DIR = path.join(ROOT, "spec");
const SPEC_URL = "https://androidpublisher.googleapis.com/$discovery/rest?version=v3";
const DEST_FILE = path.join(SPEC_DIR, "androidpublisher-v3-discovery.json");

async function main(): Promise<void> {
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  process.stdout.write(`[discovery] Fetching ${SPEC_URL} …\n`);

  const res = await request(SPEC_URL, {
    method: "GET",
    headers: {
      "user-agent": "app-store-play-mcp-codegen/1.0",
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Unexpected HTTP ${res.statusCode} from ${SPEC_URL}`);
  }

  const text = await res.body.text();
  // Format JSON neatly
  const formatted = JSON.stringify(JSON.parse(text), null, 2);
  fs.writeFileSync(DEST_FILE, formatted, "utf8");

  const stat = fs.statSync(DEST_FILE);
  process.stdout.write(
    `[discovery] Saved ${DEST_FILE} (${(stat.size / 1024).toFixed(1)} KB)\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[discovery] FATAL: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});

