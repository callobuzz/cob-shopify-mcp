import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { parse as parseYaml } from "yaml";
import { configSchema } from "./schema.js";
import type { CobConfig, DeepPartial } from "./types.js";

let _config: CobConfig | null = null;

/**
 * Interpolate ${VAR_NAME} patterns in strings with environment variable values.
 * Throws if a referenced env var is not set.
 */
function interpolateValue(value: unknown): unknown {
	if (typeof value === "string") {
		return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
			const envVal = process.env[varName];
			if (envVal === undefined) {
				throw new Error(`Environment variable "\${${varName}}" is referenced in config but not set`);
			}
			return envVal;
		});
	}
	if (Array.isArray(value)) {
		return value.map(interpolateValue);
	}
	if (value !== null && typeof value === "object") {
		return interpolateObject(value as Record<string, unknown>);
	}
	return value;
}

function interpolateObject(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(obj)) {
		result[key] = interpolateValue(val);
	}
	return result;
}

/**
 * Deep merge two objects. source values override target values.
 * Arrays are replaced, not merged.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = { ...target };
	for (const [key, sourceVal] of Object.entries(source)) {
		const targetVal = result[key];
		if (
			sourceVal !== null &&
			typeof sourceVal === "object" &&
			!Array.isArray(sourceVal) &&
			targetVal !== null &&
			typeof targetVal === "object" &&
			!Array.isArray(targetVal)
		) {
			result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
		} else {
			result[key] = sourceVal;
		}
	}
	return result;
}

/**
 * Deep freeze an object recursively.
 */
function deepFreeze<T extends object>(obj: T): T {
	Object.freeze(obj);
	for (const value of Object.values(obj)) {
		if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
			deepFreeze(value as object);
		}
	}
	return obj;
}

/**
 * Try to find and load a config file (YAML then JSON).
 */
function loadConfigFile(cwd: string): Record<string, unknown> {
	const yamlPath = resolve(cwd, "cob-shopify-mcp.config.yaml");
	if (existsSync(yamlPath)) {
		const content = readFileSync(yamlPath, "utf-8");
		return (parseYaml(content) as Record<string, unknown>) ?? {};
	}

	const jsonPath = resolve(cwd, "cob-shopify-mcp.config.json");
	if (existsSync(jsonPath)) {
		const content = readFileSync(jsonPath, "utf-8");
		return JSON.parse(content) as Record<string, unknown>;
	}

	return {};
}

/**
 * Build a partial config from environment variables.
 */
function envVarsToConfig(): Record<string, unknown> {
	const config: Record<string, unknown> = {};

	const auth: Record<string, unknown> = {};
	if (process.env.SHOPIFY_ACCESS_TOKEN) auth.access_token = process.env.SHOPIFY_ACCESS_TOKEN;
	if (process.env.SHOPIFY_STORE_DOMAIN) auth.store_domain = process.env.SHOPIFY_STORE_DOMAIN;
	if (process.env.SHOPIFY_CLIENT_ID) auth.client_id = process.env.SHOPIFY_CLIENT_ID;
	if (process.env.SHOPIFY_CLIENT_SECRET) auth.client_secret = process.env.SHOPIFY_CLIENT_SECRET;

	// Auto-detect client-credentials method when client_id + client_secret are set
	// but no access_token is provided
	if (auth.client_id && auth.client_secret && !auth.access_token) {
		auth.method = "client-credentials";
	}

	if (Object.keys(auth).length > 0) config.auth = auth;

	if (process.env.SHOPIFY_API_VERSION) {
		config.shopify = { api_version: process.env.SHOPIFY_API_VERSION };
	}

	const tools: Record<string, unknown> = {};
	if (process.env.COB_SHOPIFY_READ_ONLY) {
		const val = process.env.COB_SHOPIFY_READ_ONLY.toLowerCase();
		tools.read_only = val === "true" || val === "1";
	}
	if (process.env.COB_SHOPIFY_CUSTOM_TOOLS) {
		tools.custom_paths = process.env.COB_SHOPIFY_CUSTOM_TOOLS.split(",").map((p) => p.trim());
	}
	if (process.env.COB_SHOPIFY_DISABLE) {
		tools.disable = process.env.COB_SHOPIFY_DISABLE.split(",").map((s) => s.trim());
	}
	if (process.env.COB_SHOPIFY_ENABLE) {
		tools.enable = process.env.COB_SHOPIFY_ENABLE.split(",").map((s) => s.trim());
	}
	if (Object.keys(tools).length > 0) config.tools = tools;

	if (process.env.COB_SHOPIFY_LOG_LEVEL) {
		config.observability = { log_level: process.env.COB_SHOPIFY_LOG_LEVEL };
	}

	if (process.env.COB_SHOPIFY_STORAGE_BACKEND) {
		config.storage = { backend: process.env.COB_SHOPIFY_STORAGE_BACKEND };
	}

	const transport: Record<string, unknown> = {};
	if (process.env.COB_SHOPIFY_TRANSPORT) transport.type = process.env.COB_SHOPIFY_TRANSPORT;
	if (process.env.COB_SHOPIFY_PORT) transport.port = Number.parseInt(process.env.COB_SHOPIFY_PORT, 10);
	if (process.env.COB_SHOPIFY_HOST) transport.host = process.env.COB_SHOPIFY_HOST;
	if (Object.keys(transport).length > 0) config.transport = transport;

	return config;
}

/**
 * Expand ~ at the start of storage.path to the user's home directory.
 */
function expandTilde(configPath: string): string {
	if (configPath.startsWith("~")) {
		return configPath.replace(/^~/, homedir());
	}
	return configPath;
}

/**
 * Load configuration from multiple sources with priority:
 * defaults < config file < env vars < overrides
 *
 * Stores the result as a frozen singleton accessible via getConfig().
 */
export async function loadConfig(overrides?: DeepPartial<CobConfig>): Promise<CobConfig> {
	// 1. Load .env file (if exists)
	loadDotenv();

	// 2-3. Find and parse config file
	const fileConfig = loadConfigFile(process.cwd());

	// 4. Interpolate ${VAR_NAME} patterns
	const interpolatedFileConfig = interpolateObject(fileConfig);

	// 5. Map environment variables to config paths
	const envConfig = envVarsToConfig();

	// 6. Deep merge: file config < env vars < overrides
	let merged = interpolatedFileConfig;
	merged = deepMerge(merged, envConfig);
	if (overrides) {
		merged = deepMerge(merged, overrides as Record<string, unknown>);
	}

	// 7-8. Validate with Zod (applies defaults) + expand tilde
	const validated = configSchema.parse(merged);
	validated.storage.path = expandTilde(validated.storage.path);

	// 9. Store as frozen singleton
	_config = deepFreeze(validated) as CobConfig;
	return _config;
}

/**
 * Returns the loaded config. Throws if loadConfig() hasn't been called yet.
 */
export function getConfig(): CobConfig {
	if (_config === null) {
		throw new Error("Config not loaded. Call loadConfig() before getConfig().");
	}
	return _config;
}

/**
 * Reset the config singleton (for testing purposes).
 * @internal
 */
export function _resetConfig(): void {
	_config = null;
}
