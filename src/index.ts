export const VERSION = "0.7.0";

export type { CobConfig, DeepPartial } from "./core/config/types.js";
export type { PromptDefinition, PromptMessage } from "./core/engine/prompt-types.js";
export type { ResourceContent, ResourceDefinition } from "./core/engine/resource-types.js";
export type { ExecutionContext, ToolDefinition, ToolResult } from "./core/engine/types.js";
export { bootstrap } from "./server/bootstrap.js";
