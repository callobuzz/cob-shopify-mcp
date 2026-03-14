import { defineCommand } from "citty";
import { consola } from "consola";

export default defineCommand({
	meta: { name: "info", description: "Show details for a specific tool" },
	args: {
		name: {
			type: "positional",
			description: "Tool name",
			required: true,
		},
	},
	async run({ args }) {
		const { loadConfig, _resetConfig } = await import("../../../core/config/loader.js");
		const { getAllTools } = await import("../../../server/get-all-tools.js");
		const { loadYamlTools } = await import("../../../core/registry/yaml-loader.js");

		_resetConfig();
		const config = await loadConfig();

		const allTools = getAllTools();

		// Load custom YAML tools
		if (config.tools.custom_paths.length > 0) {
			const yamlTools = loadYamlTools(config.tools.custom_paths);
			allTools.push(...yamlTools);
		}

		const tool = allTools.find((t) => t.name === args.name);

		if (!tool) {
			consola.error(`Tool "${args.name}" not found.`);
			process.exitCode = 1;
			return;
		}

		// Deprecation warning
		const { getNewCommand, printDeprecationWarning } = await import("../../deprecation.js");
		printDeprecationWarning(
			`tools info ${args.name}`,
			`${getNewCommand(tool.name, tool.domain)} --describe`,
		);

		const lines: string[] = [
			`Name:        ${tool.name}`,
			`Domain:      ${tool.domain}`,
			`Tier:        ${tool.tier}`,
			`Description: ${tool.description}`,
			`Scopes:      ${tool.scopes.join(", ")}`,
			`Inputs:      ${Object.keys(tool.input).join(", ") || "(none)"}`,
		];

		if (tool.graphql) {
			lines.push(`GraphQL:     (defined)`);
		}

		process.stderr.write(`${lines.join("\n")}\n`);
	},
});
