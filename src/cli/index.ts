#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
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
 * Build the CLI main command with both static commands and dynamic domain commands.
 */
async function buildMain() {
	let domainCommands: Record<string, ReturnType<typeof defineCommand>> = {};

	try {
		const enabledTools = await loadEnabledTools();
		domainCommands = buildDomainCommands(enabledTools);
	} catch {
		// Config/tool loading may fail (e.g. no config file) — that's fine,
		// static commands (start, connect, config, tools, stores) still work.
	}

	return defineCommand({
		meta: {
			name: "cob-shopify-mcp",
			version: VERSION,
			description: "cob-shopify-mcp — Shopify CLI & MCP Server",
		},
		subCommands: {
			start: () => import("./commands/start.js").then((m) => m.default),
			connect: () => import("./commands/connect.js").then((m) => m.default),
			config: () => import("./commands/config/index.js").then((m) => m.default),
			tools: () => import("./commands/tools/index.js").then((m) => m.default),
			stores: () => import("./commands/stores/index.js").then((m) => m.default),
			...domainCommands,
		},
	});
}

const main = await buildMain();
runMain(main);
