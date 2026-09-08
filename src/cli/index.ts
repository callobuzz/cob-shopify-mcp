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
	.name("cob-shopify")
	.version(VERSION)
	.description("cob-shopify — Shopify CLI & MCP Server")
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
	.option("--transport <type>", "Transport type (stdio or http)")
	.option("--port <port>", "HTTP port")
	.option("--host <host>", "HTTP host to bind")
	.option("--read-only", "Enable read-only mode")
	.option("--log-level <level>", "Log level (debug, info, warn, error)")
	.option("--config <path>", "Path to config file")
	.action(async (opts) => {
		const { bootstrap } = await import("../server/bootstrap.js");
		const overrides: Record<string, unknown> = {};
		if (opts.transport) overrides.transport = { type: opts.transport };
		if (opts.port) {
			overrides.transport = {
				...(overrides.transport as Record<string, unknown>),
				port: Number.parseInt(opts.port, 10),
			};
		}
		if (opts.host) {
			overrides.transport = { ...(overrides.transport as Record<string, unknown>), host: opts.host };
		}
		if (opts.readOnly) overrides.tools = { read_only: true };
		if (opts.logLevel) overrides.observability = { log_level: opts.logLevel };
		try {
			await bootstrap(overrides);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Failed to start server: ${message}`);
			process.exit(1);
		}
	});

program
	.command("connect")
	.description("Connect a Shopify store via OAuth")
	.allowUnknownOption()
	// Without this, allowUnknownOption() lets `--store x` through as an unknown option but
	// Commander then rejects the same tokens as excess operands ("too many arguments"), so the
	// only documented way to invoke connect could never run. Every sibling delegator below
	// pairs the two flags for exactly this reason.
	.allowExcessArguments()
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
