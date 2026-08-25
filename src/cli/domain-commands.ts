/**
 * Groups ToolDefinitions by domain into Commander parent commands with subcommands.
 *
 * Each domain becomes a top-level CLI command (e.g. `cob-shopify products`)
 * with per-tool subcommands (e.g. `cob-shopify products list`).
 *
 * Built-in tools use pre-computed action names from the generated map
 * (created at build time by scripts/generate-cli-commands.ts).
 * Custom YAML tools fall back to runtime deriveActionName().
 */

import { Command } from "commander";
import type { ToolDefinition } from "../core/engine/types.js";
import { deriveActionName } from "./converter/derive-action-name.js";
import { toolToCommand } from "./converter/tool-to-command.js";
import { getDomainDescription } from "./domain-descriptions.js";

/**
 * Pre-computed action name map loaded from build-time generated JSON.
 * Falls back to empty object if the file doesn't exist (first clone, CI without prebuild).
 */
let actionNameMap: Record<string, string> = {};
try {
	// biome-ignore lint/suspicious/noTsIgnore: JSON import may not exist before first build
	// @ts-ignore -- JSON import may not exist before first build
	const imported = await import("./generated/action-names.json", { with: { type: "json" } });
	actionNameMap = imported.default;
} catch {
	// Generated file not found — will use runtime deriveActionName() for all tools
}

/**
 * Resolve the CLI action name for a tool, using the pre-computed map when
 * available and falling back to runtime derivation for custom/unknown tools.
 */
function resolveActionName(tool: ToolDefinition): string {
	// An explicit cliAction always wins: derivation strips the domain word mechanically, which is
	// wrong when that word is part of the subject rather than a redundant suffix.
	return tool.cliAction ?? actionNameMap[tool.name] ?? deriveActionName(tool.name, tool.domain);
}

/**
 * Build Commander parent commands for each domain, with tool subcommands.
 *
 * @param tools - The list of enabled tools to group by domain
 * @returns An array of Commander commands, one per domain
 */
export function buildDomainCommands(tools: ToolDefinition[]): Command[] {
	// Group tools by domain
	const domainMap = new Map<string, ToolDefinition[]>();
	for (const tool of tools) {
		const existing = domainMap.get(tool.domain);
		if (existing) {
			existing.push(tool);
		} else {
			domainMap.set(tool.domain, [tool]);
		}
	}

	// Build a Commander command per domain
	const result: Command[] = [];

	for (const [domain, domainTools] of domainMap) {
		const domainCmd = new Command(domain).description(getDomainDescription(domain));

		for (const tool of domainTools) {
			const actionName = resolveActionName(tool);
			domainCmd.addCommand(toolToCommand(tool, actionName));
		}

		result.push(domainCmd);
	}

	return result;
}
