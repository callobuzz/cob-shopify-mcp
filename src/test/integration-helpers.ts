import { createAuthProvider } from "@core/auth/factory.js";
import { _resetConfig, loadConfig } from "@core/config/loader.js";
import { ToolEngine } from "@core/engine/tool-engine.js";
import type { ExecutionContext } from "@core/engine/types.js";
import { CostTracker } from "@core/observability/cost-tracker.js";
import { createLogger } from "@core/observability/logger.js";
import { ToolRegistry } from "@core/registry/tool-registry.js";
import { createStorage } from "@core/storage/factory.js";
import type { StorageBackend } from "@core/storage/storage.interface.js";
import { createShopifyClient } from "@shopify/client/factory.js";

export interface IntegrationCredentials {
	method: "token" | "client-credentials";
	storeDomain: string;
	accessToken?: string;
	clientId?: string;
	clientSecret?: string;
}

/**
 * Resolve integration-test credentials from the environment.
 *
 * Mirrors the loader's own auto-detection (`core/config/loader.ts`): an explicit
 * `SHOPIFY_ACCESS_TOKEN` wins, otherwise `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` are
 * exchanged via the client-credentials grant.
 *
 * Client credentials are the project's recommended auth method and what consumers actually
 * configure, so gating the integration suite on `SHOPIFY_ACCESS_TOKEN` alone meant a correctly
 * configured store still skipped every test — and the run reported green.
 */
export function detectIntegrationCredentials(env: NodeJS.ProcessEnv = process.env): IntegrationCredentials | null {
	const storeDomain = env.SHOPIFY_STORE_DOMAIN;
	if (!storeDomain) return null;

	if (env.SHOPIFY_ACCESS_TOKEN) {
		return { method: "token", storeDomain, accessToken: env.SHOPIFY_ACCESS_TOKEN };
	}

	if (env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET) {
		return {
			method: "client-credentials",
			storeDomain,
			clientId: env.SHOPIFY_CLIENT_ID,
			clientSecret: env.SHOPIFY_CLIENT_SECRET,
		};
	}

	return null;
}

export function skipIfNoCredentials(): boolean {
	return detectIntegrationCredentials() === null;
}

export interface IntegrationContext {
	ctx: ExecutionContext;
	registry: ToolRegistry;
	engine: ToolEngine;
	storage: StorageBackend;
}

export async function createIntegrationContext(): Promise<IntegrationContext> {
	_resetConfig();

	const credentials = detectIntegrationCredentials();
	if (!credentials) {
		throw new Error(
			"No integration credentials. Set SHOPIFY_STORE_DOMAIN plus either SHOPIFY_ACCESS_TOKEN, " +
				"or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET.",
		);
	}

	const config = await loadConfig({
		auth:
			credentials.method === "token"
				? {
						method: "token",
						store_domain: credentials.storeDomain,
						access_token: credentials.accessToken,
					}
				: {
						method: "client-credentials",
						store_domain: credentials.storeDomain,
						client_id: credentials.clientId,
						client_secret: credentials.clientSecret,
					},
		storage: { backend: "json", path: "./test-data/", encrypt_tokens: false },
		observability: { log_level: "warn", audit_log: false, metrics: false },
	});

	const logger = createLogger("integration-test", "warn");
	const storage = await createStorage(config.storage, logger);
	await storage.initialize();
	const auth = createAuthProvider(config.auth, storage, logger);
	const costTracker = new CostTracker();

	const shopify = createShopifyClient({
		storeDomain: config.auth.store_domain,
		apiVersion: config.shopify.api_version,
		authProvider: auth,
		costTracker,
		logger,
		cache: { readTtl: 0, searchTtl: 0, analyticsTtl: 0 },
		rateLimit: {
			respectShopifyCost: true,
			maxConcurrent: 2,
			// The live analytics suite runs far more ShopifyQL than any single user session and will
			// spend the per-window allowance. Wait the window out rather than failing: a test run may
			// take longer, but a red suite should mean a broken tool, not a spent budget.
			maxShopifyQLWaitMs: 70_000,
		},
	});

	const ctx: ExecutionContext = { shopify, config, storage, logger, costTracker };
	const registry = new ToolRegistry();
	const engine = new ToolEngine(registry);

	return { ctx, registry, engine, storage };
}

export async function cleanupIntegrationContext(context: IntegrationContext): Promise<void> {
	await context.storage.close();
	_resetConfig();
}
