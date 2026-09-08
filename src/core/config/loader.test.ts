import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
	// The auto-detected client-credentials method used to be injected into the ENV layer, which
	// merges ABOVE the file layer. Because authorization-code needs the same client_id +
	// client_secret + no access_token, the inference could not tell the two apart and silently
	// clobbered an explicitly configured method - making the OAuth authorize flow unreachable.
	it("auto-detection does not override an explicit auth.method from the config file", async () => {
		const yaml = `
auth:
  method: authorization-code
  store_domain: oauth-store.myshopify.com
`;
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.yaml"), yaml);
		process.env.SHOPIFY_CLIENT_ID = "env-client-id";
		process.env.SHOPIFY_CLIENT_SECRET = "env-client-secret";

		const config = await loadConfig();
		expect(config.auth.method).toBe("authorization-code");
		expect(config.auth.client_id).toBe("env-client-id");
	});

	it("SHOPIFY_AUTH_METHOD sets auth.method from the environment", async () => {
		process.env.SHOPIFY_AUTH_METHOD = "authorization-code";
		process.env.SHOPIFY_CLIENT_ID = "env-client-id";
		process.env.SHOPIFY_CLIENT_SECRET = "env-client-secret";

		const config = await loadConfig();
		expect(config.auth.method).toBe("authorization-code");
	});

	it("SHOPIFY_AUTH_METHOD overrides auth.method from the config file", async () => {
		writeFileSync(join(tmpDir, "cob-shopify-mcp.config.yaml"), "auth:\n  method: token\n");
		process.env.SHOPIFY_AUTH_METHOD = "authorization-code";
		process.env.SHOPIFY_CLIENT_ID = "env-client-id";
		process.env.SHOPIFY_CLIENT_SECRET = "env-client-secret";

		const config = await loadConfig();
		expect(config.auth.method).toBe("authorization-code");
	});

	it("auto-detection does not override an explicit auth.method from overrides", async () => {
		process.env.SHOPIFY_CLIENT_ID = "env-client-id";
		process.env.SHOPIFY_CLIENT_SECRET = "env-client-secret";

		const config = await loadConfig({ auth: { method: "authorization-code" } });
		expect(config.auth.method).toBe("authorization-code");
	});

	it("still auto-detects client-credentials when no method is configured anywhere", async () => {
		process.env.SHOPIFY_CLIENT_ID = "env-client-id";
		process.env.SHOPIFY_CLIENT_SECRET = "env-client-secret";

		const config = await loadConfig();
		expect(config.auth.method).toBe("client-credentials");
	});

	it("does not auto-detect client-credentials when an access_token is present", async () => {
		process.env.SHOPIFY_CLIENT_ID = "env-client-id";
		process.env.SHOPIFY_CLIENT_SECRET = "env-client-secret";
		process.env.SHOPIFY_ACCESS_TOKEN = "shpat_env";

		const config = await loadConfig();
		expect(config.auth.method).toBe("token");
	});

	// Under transport: stdio, stdout IS the JSON-RPC channel. dotenv >= 17.1 prints a banner
	// there on every load, which corrupts the first frame and leaves the MCP client unable to
	// initialize - the reason `start` only worked with DOTENV_CONFIG_QUIET=true set by hand.
	// Asserted in a real child process: vitest intercepts console.log in-process, so an
	// in-process stdout spy passes even while the banner is being printed for real.
	it("loading config writes nothing to stdout", async () => {
		const loaderUrl = new URL("./loader.ts", import.meta.url).href;
		const projectRoot = new URL("../../../", import.meta.url);
		const scriptPath = join(tmpDir, "probe-stdout.mjs");
		// chdir inside the child rather than spawning with cwd: tmpDir so that `tsx` still
		// resolves from the project's node_modules, while loadConfig() still reads tmpDir.
		writeFileSync(
			scriptPath,
			[
				`process.chdir(${JSON.stringify(tmpDir)});`,
				`const { loadConfig } = await import(${JSON.stringify(loaderUrl)});`,
				"await loadConfig();",
			].join("\n"),
		);

		const { DOTENV_CONFIG_QUIET: _ignored, ...cleanEnv } = process.env;
		const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath], {
			cwd: fileURLToPath(projectRoot),
			encoding: "utf-8",
			env: cleanEnv,
		});

		expect(result.stderr).not.toContain("Cannot find");
		expect(result.stdout).toBe("");
	}, 30_000);
});
