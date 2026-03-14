import { defineCommand } from "citty";
import { consola } from "consola";

export default defineCommand({
	meta: { name: "run", description: "Execute a tool directly from the CLI" },
	args: {
		name: {
			type: "positional",
			description: "Tool name (e.g. list_products, get_order, complete_draft_order)",
			required: true,
		},
		params: {
			type: "string",
			description: 'JSON string of parameters (e.g. \'{"limit": 5}\' or \'{"id": "gid://shopify/Order/123"}\')',
			alias: "p",
		},
	},
	async run({ args }) {
		const { loadConfig, _resetConfig } = await import("../../../core/config/loader.js");
		const { ToolRegistry } = await import("../../../core/registry/tool-registry.js");
		const { ToolEngine } = await import("../../../core/engine/tool-engine.js");
		const { getAllTools } = await import("../../../server/get-all-tools.js");
		const { loadYamlTools } = await import("../../../core/registry/yaml-loader.js");
		const { createAuthProvider } = await import("../../../core/auth/factory.js");
		const { createShopifyClient } = await import("../../../shopify/client/factory.js");
		const { CostTracker } = await import("../../../core/observability/cost-tracker.js");
		const { createLogger } = await import("../../../core/observability/logger.js");
		const { createStorage } = await import("../../../core/storage/factory.js");

		_resetConfig();

		try {
			const config = await loadConfig();
			const logger = createLogger(config.observability.log_level);

			// Build registry with all tools (built-in + custom YAML)
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

			// Check if tool exists
			const enabledTools = registry.filter(config);
			const enabledNames = new Set(enabledTools.map((t) => t.name));
			const tool = registry.get(args.name);

			if (!tool) {
				consola.error(`Tool "${args.name}" not found.`);
				consola.info("Run 'cob-shopify-mcp tools list' to see all available tools.");
				process.exitCode = 1;
				return;
			}

			// Deprecation warning
			const { getNewCommand, printDeprecationWarning } = await import("../../deprecation.js");
			printDeprecationWarning(
				`tools run ${args.name}`,
				getNewCommand(tool.name, tool.domain),
			);

			if (!enabledNames.has(args.name)) {
				consola.error(`Tool "${args.name}" is disabled by config.`);
				consola.info("Check your tools.disable / tools.enable settings, or COB_SHOPIFY_READ_ONLY.");
				process.exitCode = 1;
				return;
			}

			// Parse input params
			let input: Record<string, unknown> = {};
			if (args.params) {
				try {
					input = JSON.parse(args.params);
				} catch {
					consola.error('Invalid JSON in --params. Use format: \'{"key": "value"}\'');
					process.exitCode = 1;
					return;
				}
			}

			// Also parse any remaining CLI args as key=value pairs
			const rawArgs = process.argv.slice(process.argv.indexOf(args.name) + 1);
			for (const arg of rawArgs) {
				if (arg.startsWith("--") && arg.includes("=")) {
					const eqIndex = arg.indexOf("=");
					const key = arg.slice(2, eqIndex);
					const val = arg.slice(eqIndex + 1);
					if (val === "true") input[key] = true;
					else if (val === "false") input[key] = false;
					else if (!Number.isNaN(Number(val)) && val !== "") input[key] = Number(val);
					else {
						try {
							input[key] = JSON.parse(val);
						} catch {
							input[key] = val;
						}
					}
				}
			}

			// Boot storage, auth, shopify client
			const storage = await createStorage(config.storage, logger);
			await storage.initialize();
			const costTracker = new CostTracker();
			const authProvider = createAuthProvider(config.auth, storage, logger);
			const shopifyClient = createShopifyClient({
				storeDomain: config.auth.store_domain,
				apiVersion: config.shopify.api_version,
				authProvider,
				costTracker,
				logger,
				cache: {
					readTtl: config.shopify.cache.read_ttl,
					searchTtl: config.shopify.cache.search_ttl,
					analyticsTtl: config.shopify.cache.analytics_ttl,
				},
			});

			// Create execution context
			const ctx = {
				shopify: shopifyClient,
				config,
				storage,
				logger,
				costTracker,
			};

			// Execute
			const engine = new ToolEngine(registry);
			consola.start(`Running ${args.name}...`);

			const result = await engine.execute(args.name, input, ctx);

			// Output result as JSON to stdout
			const output = JSON.stringify(result.data, null, 2);
			process.stdout.write(`${output}\n`);

			// Show cost summary on stderr
			const stats = costTracker.getSessionStats();
			if (stats.totalCallsMade > 0) {
				consola.info(`API cost: ${stats.totalCostConsumed} points | Budget remaining: ${stats.budgetRemaining}`);
			}
		} catch (err) {
			consola.error(`Failed to run tool "${args.name}":`, err instanceof Error ? err.message : String(err));
			process.exitCode = 1;
		}
	},
});
