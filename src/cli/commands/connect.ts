import { defineCommand } from "citty";
import { consola } from "consola";

export default defineCommand({
	meta: {
		name: "connect",
		description: "Connect a Shopify store via OAuth",
	},
	args: {
		store: {
			type: "string",
			description: "Store domain (e.g. my-store.myshopify.com). Defaults to the configured store.",
		},
	},
	/**
	 * Resolves the store domain the same way every other entry point does — flag, then
	 * SHOPIFY_STORE_DOMAIN, then auth.store_domain from the config file. Requiring --store here
	 * meant a fully configured install still could not start the OAuth flow.
	 *
	 * Returns the resolved domain so callers (and tests) can see which store was used.
	 */
	async run({ args }): Promise<string | undefined> {
		try {
			const { loadConfig } = await import("../../core/config/loader.js");
			const { createStorage } = await import("../../core/storage/factory.js");
			const { createAuthProvider } = await import("../../core/auth/factory.js");
			const { createLogger } = await import("../../core/observability/logger.js");

			// Passing the flag as an override rather than reading it directly keeps the precedence
			// rules in one place: overrides beat env, env beats the config file.
			const config = await loadConfig(args.store ? { auth: { store_domain: args.store } } : undefined);
			const domain = config.auth.store_domain;

			if (!domain) {
				consola.error(
					"No store domain configured. Pass --store my-store.myshopify.com, set SHOPIFY_STORE_DOMAIN, or set auth.store_domain in cob-shopify-mcp.config.yaml.",
				);
				process.exitCode = 1;
				return undefined;
			}

			if (!domain.endsWith(".myshopify.com")) {
				consola.error(`Invalid store domain: "${domain}". Expected format: my-store.myshopify.com`);
				process.exitCode = 1;
				return undefined;
			}

			const logger = createLogger("connect", config.observability.log_level);
			const storage = await createStorage(config.storage, logger);
			await storage.initialize();

			if (config.auth.method === "token") {
				consola.info("Auth method is 'token'. Set the SHOPIFY_ACCESS_TOKEN environment variable to connect.");
				return domain;
			}

			if (config.auth.method === "client-credentials") {
				consola.info(
					"Auth method is 'client-credentials'. No manual connect step is needed — the server authenticates automatically.",
				);
				return domain;
			}

			// authorization-code flow
			const auth = createAuthProvider(config.auth, storage, logger);

			if (!("authorize" in auth)) {
				consola.error("Auth provider does not support the interactive authorization flow.");
				process.exitCode = 1;
				return undefined;
			}

			consola.info(`Starting OAuth authorization for ${domain}...`);
			consola.info("A browser window will open. Approve the app to complete the connection.");

			const token = await (auth as { authorize: (domain: string) => Promise<string> }).authorize(domain);

			if (token) {
				consola.success(`Successfully connected to ${domain}`);
			}
			return domain;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			consola.error(`Failed to connect store: ${message}`);
			process.exitCode = 1;
			return undefined;
		}
	},
});
