import type { Tool } from "../utils/tool.js";
import { accountTools } from "./accounts.js";
import { authTools } from "./auth.js";
import { appsTools } from "./apps.js";
import { editTools } from "./edits.js";
import { listingTools } from "./listings.js";
import { imageTools } from "./images.js";
import { bundleTools } from "./bundles.js";
import { trackTools } from "./tracks.js";
import { onetimeProductTools } from "./onetime-products.js";
import { subscriptionTools } from "./subscriptions.js";
import { purchaseTools } from "./purchases.js";
import { orderTools } from "./orders.js";
import { reviewTools } from "./reviews.js";
import { userTools } from "./users.js";
import { distributionTools } from "./distribution.js";
import { reportTools } from "./reports.js";
import { allGeneratedTools } from "./generated/index.js";

const handwrittenTools: Tool[] = [
  ...accountTools,
  ...authTools,
  ...appsTools,
  ...editTools,
  ...listingTools,
  ...imageTools,
  ...bundleTools,
  ...trackTools,
  ...onetimeProductTools,
  ...subscriptionTools,
  ...purchaseTools,
  ...orderTools,
  ...reviewTools,
  ...userTools,
  ...distributionTools,
  ...reportTools,
];

// Deduplication policy: handwritten tools have priority and shadow generated tools with the same name.
const handwrittenNames = new Set(handwrittenTools.map((t) => t.name));
export const uniqueGeneratedTools: Tool[] = allGeneratedTools.filter(
  (t) => !handwrittenNames.has(t.name),
);

export const allTools: Tool[] = [
  ...handwrittenTools,
  ...uniqueGeneratedTools,
];

export function toolByName(name: string): Tool | undefined {
  return allTools.find((t) => t.name === name);
}
