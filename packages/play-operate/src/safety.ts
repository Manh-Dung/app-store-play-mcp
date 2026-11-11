/** Play-operate safety wiring — re-exports @store-mcp/shared. */
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
export { profileForTool, PLAY_PROFILES } from "./profiles.js";
