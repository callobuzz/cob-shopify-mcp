#!/usr/bin/env node
import { Command } from "commander";
import { consola } from "consola";
import { loadConfig } from "../core/config/loader.js";
import { ToolRegistry } from "../core/registry/tool-registry.js";
import { loadYamlTools } from "../core/registry/yaml-loader.js";
import { VERSION } from "../index.js";
import { getAllTools } from "../server/get-all-tools.js";
import { buildDomainCommands } from "./domain-commands.js";

process.on("unhandledRejection", (reason) => {
	const message = reason instanceof Error ? reason.message : String(reason);
	consola.error(`Unhandled error: ${message}`);
	process.exit(1);
});

/**
 * Load enabled tools from built-in + custom YAML sources, filtered by config.
 * This is cheap (no network calls) — heavy work is deferred to execution time.
 */
async function loadEnabledTools() {
	const config = await loadConfig();
	const registry = new ToolRegistry();

	for (const tool of getAllTools()) {
		registry.register(tool);
	}

	if (config.tools.custom_paths.length > 0) {
		const yamlTools = loadYamlTools(config.tools.custom_paths);
		for (const tool of yamlTools) {
			registry.register(tool);
		}
	}

	return registry.filter(config);
}

/**
 * Build the Commander program with static commands and dynamic domain commands.
 */
const program = new Command()
	.name("cob-shopify-mcp")
	.version(VERSION)
	.description("cob-shopify-mcp — Shopify CLI & MCP Server")
	.option("--json", "Output as JSON")
	.option("--fields <fields>", "Select specific response fields (comma-separated, implies --json)")
	.option("--jq <expr>", "Filter JSON output with jq expression (implies --json)")
	.option("--schema", "Show command schema as JSON, don't execute")
	.option("--dry-run", "Preview mutations without executing")
	.option("-y, --yes", "Skip confirmation prompts");

// Static commands — delegate to existing citty handlers
program
	.command("start")
	.description("Start the MCP server")
	.allowUnknownOption()
	.action(async () => {
		const { runCommand } = await import("citty");
		const mod = await import("./commands/start.js");
		await runCommand(mod.default, { rawArgs: process.argv.slice(3) });
	});

program
	.command("connect")
	.description("Connect a Shopify store via OAuth")
	.allowUnknownOption()
	.action(async () => {
		const { runCommand } = await import("citty");
		const mod = await import("./commands/connect.js");
		await runCommand(mod.default, { rawArgs: process.argv.slice(3) });
	});

program
	.command("config")
	.description("Manage configuration")
	.allowUnknownOption()
	.allowExcessArguments()
	.action(async () => {
		const { runCommand } = await import("citty");
		const mod = await import("./commands/config/index.js");
		await runCommand(mod.default, { rawArgs: process.argv.slice(3) });
	});

program
	.command("tools")
	.description("List, inspect, and run tools")
	.allowUnknownOption()
	.allowExcessArguments()
	.action(async () => {
		const { runCommand } = await import("citty");
		const mod = await import("./commands/tools/index.js");
		await runCommand(mod.default, { rawArgs: process.argv.slice(3) });
	});

program
	.command("stores")
	.description("Manage connected stores")
	.allowUnknownOption()
	.allowExcessArguments()
	.action(async () => {
		const { runCommand } = await import("citty");
		const mod = await import("./commands/stores/index.js");
		await runCommand(mod.default, { rawArgs: process.argv.slice(3) });
	});

// Dynamic domain commands from enabled tools
try {
	const enabledTools = await loadEnabledTools();
	const domainCommands = buildDomainCommands(enabledTools);
	for (const domainCmd of domainCommands) {
		program.addCommand(domainCmd);
	}
} catch {
	// Config/tool loading may fail (e.g. no config file) — that's fine,
	// static commands (start, connect, config, tools, stores) still work.
}

program.parse();
