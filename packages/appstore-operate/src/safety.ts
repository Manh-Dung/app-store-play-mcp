/** App Store safety wiring — re-exports @store-mcp/shared. */
export {
  isWriteTool,
  isDestructiveTool,
  filterTools,
  destructiveGate,
  redact,
  redactResult,
  translateError,
  parseServerArgs,
  helpText,
} from "@store-mcp/shared";
export { profileForTool, APPSTORE_PROFILES } from "./profiles.js";
