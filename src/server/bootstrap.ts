import { createAuthProvider } from "@core/auth/factory.js";
import { loadConfig } from "@core/config/loader.js";
import type { CobConfig, DeepPartial } from "@core/config/types.js";
import { registerAdvertiser } from "@core/engine/advertiser.js";
import { ToolEngine } from "@core/engine/tool-engine.js";
import type { ExecutionContext } from "@core/engine/types.js";
import { AuditLogger } from "@core/observability/audit.js";
import { CostTracker } from "@core/observability/cost-tracker.js";
import { createLogger } from "@core/observability/logger.js";
import { ToolRegistry } from "@core/registry/tool-registry.js";
import { loadYamlTools } from "@core/registry/yaml-loader.js";
import { createStorage } from "@core/storage/factory.js";
import { createTransport } from "@core/transport/factory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createShopifyClient } from "@shopify/client/factory.js";
import { getAllPrompts } from "./get-all-prompts.js";
import { getAllResources } from "./get-all-resources.js";
import { getAllTools } from "./get-all-tools.js";
import { registerPrompts } from "./register-prompts.js";
import { registerResources } from "./register-resources.js";
import { registerTools } from "./register-tools.js";

export async function bootstrap(overrides?: DeepPartial<CobConfig>): Promise<void> {
	// 1. Load config
	let config: CobConfig;
	try {
		config = await loadConfig(overrides);
	} catch (error) {
		throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
	}

	// 2. Create logger
	const logger = createLogger("server", config.observability.log_level);

	// 3. Create storage
	let storage: Awaited<ReturnType<typeof createStorage>>;
	try {
		storage = await createStorage(config.storage, logger);
		await storage.initialize();
	} catch (error) {
		throw new Error(`Failed to initialize storage: ${error instanceof Error ? error.message : String(error)}`);
	}

	// 4. Create auth provider
	let auth: ReturnType<typeof createAuthProvider>;
	try {
		auth = createAuthProvider(config.auth, storage, logger);
	} catch (error) {
		throw new Error(`Failed to initialize authentication: ${error instanceof Error ? error.message : String(error)}`);
	}

	// 5. Create CostTracker
	const costTracker = new CostTracker();

	// 6. Create AuditLogger
	const auditLogger = new AuditLogger(
		config.observability.audit_log,
		config.storage.path.replace(/\.[^.]+$/, ".audit.jsonl"),
		logger,
	);
	try {
		await auditLogger.initialize();
	} catch (error) {
		throw new Error(`Failed to initialize audit logger: ${error instanceof Error ? error.message : String(error)}`);
	}

	// 7. Create Shopify client
	const shopify = createShopifyClient({
		storeDomain: config.auth.store_domain,
		apiVersion: config.shopify.api_version,
		authProvider: auth,
		costTracker,
		logger,
		cache: {
			readTtl: config.shopify.cache.read_ttl,
			searchTtl: config.shopify.cache.search_ttl,
			analyticsTtl: config.shopify.cache.analytics_ttl,
		},
		rateLimit: {
			respectShopifyCost: config.rate_limit.respect_shopify_cost,
			maxConcurrent: config.rate_limit.max_concurrent,
		},
	});

	// 8. Build ExecutionContext
	const ctx: ExecutionContext = {
		shopify,
		config,
		storage,
		logger,
		costTracker,
	};

	// 9. Create tool registry and engine
	const registry = new ToolRegistry();
	const toolEngine = new ToolEngine(registry);

	// 10. Register all tools
	const allTools = getAllTools();
	for (const tool of allTools) {
		registry.register(tool);
	}

	// Load YAML custom tools
	if (config.tools.custom_paths.length > 0) {
		const yamlTools = loadYamlTools(config.tools.custom_paths);
		for (const tool of yamlTools) {
			registry.register(tool);
		}
	}

	// 11. Create McpServer
	const server = new McpServer({
		name: "cob-shopify-mcp",
		version: "1.0.0",
	});

	// 12. Register tools, resources, prompts
	if (config.tools.advertise_and_activate) {
		registerAdvertiser(server, registry, toolEngine, config, ctx);
	} else {
		registerTools(server, registry, toolEngine, config, ctx);
	}

	const allResources = getAllResources();
	registerResources(server, allResources, ctx);

	const allPrompts = getAllPrompts();
	registerPrompts(server, allPrompts);

	// 13. Create and start transport
	const transport = createTransport({
		type: config.transport.type,
		httpPort: config.transport.port,
		httpHost: config.transport.host,
	});
	try {
		await transport.start(server);
	} catch (error) {
		throw new Error(`Failed to start transport: ${error instanceof Error ? error.message : String(error)}`);
	}

	logger.info(
		{
			tools: registry.filter(config).length,
			resources: allResources.length,
			prompts: allPrompts.length,
			transport: config.transport.type,
		},
		"MCP server started successfully",
	);

	// 14. Graceful shutdown
	const shutdown = async () => {
		logger.info("Shutting down...");
		await transport.stop();
		await auditLogger.close();
		await storage.close();
		process.exit(0);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}
