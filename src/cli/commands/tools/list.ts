import { defineCommand } from "citty";
import { consola } from "consola";
import { formatTable } from "../../utils.js";

export default defineCommand({
	meta: { name: "list", description: "List all available tools" },
	args: {
		domain: {
			type: "string",
			description: "Filter by domain (e.g. products, orders)",
		},
		tier: {
			type: "string",
			description: "Filter by tier (1, 2, or 3)",
		},
	},
	async run({ args }) {
		const { printDeprecationWarning } = await import("../../deprecation.js");
		printDeprecationWarning(
			"tools list",
			"'cob-shopify --help' or 'cob-shopify <domain>'",
		);

		const { loadConfig, _resetConfig } = await import("../../../core/config/loader.js");
		const { ToolRegistry } = await import("../../../core/registry/tool-registry.js");
		const { getAllTools } = await import("../../../server/get-all-tools.js");
		const { loadYamlTools } = await import("../../../core/registry/yaml-loader.js");

		_resetConfig();

		try {
			const config = await loadConfig();
			const registry = new ToolRegistry();
			const allTools = getAllTools();

			for (const tool of allTools) {
				registry.register(tool);
			}

			// Load custom YAML tools
			if (config.tools.custom_paths.length > 0) {
				const yamlTools = loadYamlTools(config.tools.custom_paths);
				for (const tool of yamlTools) {
					registry.register(tool);
				}
			}

			const enabledTools = registry.filter(config);
			const enabledNames = new Set(enabledTools.map((t) => t.name));

			let tools = registry.getAll();

			if (args.domain) {
				tools = tools.filter((t) => t.domain === args.domain);
			}
			if (args.tier) {
				const tierNum = Number.parseInt(args.tier, 10);
				tools = tools.filter((t) => t.tier === tierNum);
			}

			if (tools.length === 0) {
				consola.info("No tools found matching the given filters.");
				return;
			}

			const rows = tools.map((t) => [
				t.name,
				t.domain,
				String(t.tier),
				enabledNames.has(t.name) ? "enabled" : "disabled",
			]);

			const table = formatTable(["Name", "Domain", "Tier", "Status"], rows);
			process.stderr.write(`${table}\n`);
			consola.info(`\n${tools.length} tools total`);
		} catch (err) {
			consola.error("Failed to list tools:", err instanceof Error ? err.message : String(err));
			process.exitCode = 1;
		}
	},
});
