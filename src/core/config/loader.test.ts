import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KNOWN_API_VERSIONS } from "./api-versions.js";
import { _resetConfig, getConfig, loadConfig } from "./loader.js";

// api_version is validated against real support windows, so a hardcoded literal here would
// start failing the day it ages out. Track the newest known version instead.
const TEST_API_VERSION = KNOWN_API_VERSIONS[KNOWN_API_VERSIONS.length - 1].version;

describe("config loader", () => {
	let tmpDir: string;
	const originalCwd = process.cwd;
	const originalEnv = { ...process.env };

	beforeEach(() => {
		tmpDir = join(homedir(), `.cob-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tmpDir, { recursive: true });
		process.cwd = () => tmpDir;
		// Env overrides file config by design, so any ambient SHOPIFY_*/COB_SHOPIFY_* value would
		// silently defeat the file-precedence assertions below. That is not hypothetical: a real
		// .env, or any run that loads one, sets exactly these.
		for (const key of Object.keys(process.env)) {
			if (key.startsWith("SHOPIFY_") || key.startsWith("COB_SHOPIFY_")) {
				delete process.env[key];
			}
		}
		_resetConfig();
	});

	afterEach(() => {
		process.cwd = originalCwd;
		// Restore env
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnv)) {
				delete process.env[key];
			}
		}
		Object.assign(process.env, originalEnv);
		rmSync(tmpDir, { recursive: true, force: true });
		_resetConfig();
	});

	it("loads config from YAML file", async () => {
		const yaml = `
auth:
  store_domain: yaml-store.myshopify.com
  access_token: shpat_yaml
shopify:
  api_version: "${TEST_API_VERSION}"
`;
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.yaml"), yaml);

		const config = await loadConfig();
		expect(config.auth.store_domain).toBe("yaml-store.myshopify.com");
		expect(config.auth.access_token).toBe("shpat_yaml");
		expect(config.shopify.api_version).toBe(TEST_API_VERSION);
	});

	it("loads config from JSON file", async () => {
		const json = {
			auth: {
				store_domain: "json-store.myshopify.com",
				access_token: "shpat_json",
			},
			transport: { type: "http", port: 8080 },
		};
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.json"), JSON.stringify(json));

		const config = await loadConfig();
		expect(config.auth.store_domain).toBe("json-store.myshopify.com");
		expect(config.transport.type).toBe("http");
		expect(config.transport.port).toBe(8080);
	});

	it("env vars override file values", async () => {
		const yaml = `
auth:
  store_domain: file-store.myshopify.com
  access_token: shpat_file
`;
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.yaml"), yaml);
		process.env.SHOPIFY_STORE_DOMAIN = "env-store.myshopify.com";
		process.env.SHOPIFY_ACCESS_TOKEN = "shpat_env";

		const config = await loadConfig();
		expect(config.auth.store_domain).toBe("env-store.myshopify.com");
		expect(config.auth.access_token).toBe("shpat_env");
	});

	it("VAR_NAME interpolation replaces with env value", async () => {
		process.env.MY_TOKEN = "shpat_interpolated";
		const yaml = `
auth:
  store_domain: test.myshopify.com
  access_token: \${MY_TOKEN}
`;
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.yaml"), yaml);

		const config = await loadConfig();
		expect(config.auth.access_token).toBe("shpat_interpolated");
	});

	it("VAR_NAME with missing var throws descriptive error", async () => {
		delete process.env.NONEXISTENT_VAR;
		const yaml = `
auth:
  store_domain: test.myshopify.com
  access_token: \${NONEXISTENT_VAR}
`;
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.yaml"), yaml);

		await expect(loadConfig()).rejects.toThrow("NONEXISTENT_VAR");
	});

	it("~ in storage.path expands to os.homedir()", async () => {
		const config = await loadConfig({
			storage: { backend: "json", path: "~/.cob-shopify-mcp/", encrypt_tokens: false },
		});
		expect(config.storage.path).toBe(`${homedir()}/.cob-shopify-mcp/`);
		expect(config.storage.path).not.toContain("~");
	});

	it("deep merges nested objects (env override of auth fields preserves other auth fields from file)", async () => {
		const yaml = `
auth:
  method: token
  store_domain: file-store.myshopify.com
  access_token: shpat_file
`;
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.yaml"), yaml);
		process.env.SHOPIFY_ACCESS_TOKEN = "shpat_env";

		const config = await loadConfig();
		// env overrides access_token but store_domain from file is preserved
		expect(config.auth.access_token).toBe("shpat_env");
		expect(config.auth.store_domain).toBe("file-store.myshopify.com");
		expect(config.auth.method).toBe("token");
	});

	it("loadConfig() with overrides takes highest priority", async () => {
		const yaml = `
auth:
  store_domain: file-store.myshopify.com
observability:
  log_level: warn
`;
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.yaml"), yaml);
		process.env.COB_SHOPIFY_LOG_LEVEL = "error";

		const config = await loadConfig({
			observability: { log_level: "debug", audit_log: true, metrics: false },
		});
		expect(config.observability.log_level).toBe("debug");
	});

	it("getConfig() throws before loadConfig() is called", () => {
		expect(() => getConfig()).toThrow("Config not loaded");
	});

	it("getConfig() returns frozen (immutable) object", async () => {
		await loadConfig();
		const config = getConfig();
		expect(Object.isFrozen(config)).toBe(true);
		expect(Object.isFrozen(config.auth)).toBe(true);
		expect(Object.isFrozen(config.shopify)).toBe(true);
		expect(Object.isFrozen(config.shopify.cache)).toBe(true);
		expect(Object.isFrozen(config.tools)).toBe(true);
		expect(Object.isFrozen(config.transport)).toBe(true);
		expect(Object.isFrozen(config.storage)).toBe(true);
		expect(Object.isFrozen(config.observability)).toBe(true);
		expect(Object.isFrozen(config.rate_limit)).toBe(true);
	});
});
