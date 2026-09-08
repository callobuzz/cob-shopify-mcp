import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetConfig } from "../../core/config/loader.js";
import connectCmd from "./connect.js";

/**
 * `connect` used to demand --store even though the store domain is already a first-class
 * config value (SHOPIFY_STORE_DOMAIN / auth.store_domain), so a correctly configured install
 * still could not run the OAuth flow. These cover the resolution order and the failure mode.
 */
describe("connect command", () => {
	let tmpDir: string;
	const originalCwd = process.cwd;
	const originalEnv = { ...process.env };

	async function run(args: Record<string, unknown>) {
		return connectCmd.run?.({ args, rawArgs: [], cmd: connectCmd } as never);
	}

	beforeEach(() => {
		tmpDir = join(homedir(), `.cob-connect-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tmpDir, { recursive: true });
		process.cwd = () => tmpDir;
		// Ambient SHOPIFY_*/COB_SHOPIFY_* values (a real dotenv file, or a previous run) would
		// otherwise supply a store domain and defeat every assertion below.
		for (const key of Object.keys(process.env)) {
			if (key.startsWith("SHOPIFY_") || key.startsWith("COB_SHOPIFY_")) {
				delete process.env[key];
			}
		}
		process.env.COB_SHOPIFY_STORAGE_BACKEND = "json";
		process.exitCode = undefined;
		_resetConfig();
	});

	afterEach(() => {
		process.cwd = originalCwd;
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnv)) {
				delete process.env[key];
			}
		}
		Object.assign(process.env, originalEnv);
		process.exitCode = undefined;
		rmSync(tmpDir, { recursive: true, force: true });
		_resetConfig();
	});

	it("does not require --store", () => {
		expect(connectCmd.args.store.required).toBeFalsy();
	});

	it("falls back to auth.store_domain from the config file when --store is omitted", async () => {
		writeFileSync(
			join(tmpDir, "cob-shopify-mcp.config.yaml"),
			"auth:\n  store_domain: file-store.myshopify.com\n  method: token\n",
		);

		await expect(run({})).resolves.toBe("file-store.myshopify.com");
		expect(process.exitCode).toBeUndefined();
	});

	it("falls back to SHOPIFY_STORE_DOMAIN when --store is omitted", async () => {
		process.env.SHOPIFY_STORE_DOMAIN = "env-store.myshopify.com";

		await expect(run({})).resolves.toBe("env-store.myshopify.com");
		expect(process.exitCode).toBeUndefined();
	});

	it("--store wins over the configured store domain", async () => {
		process.env.SHOPIFY_STORE_DOMAIN = "env-store.myshopify.com";

		await expect(run({ store: "flag-store.myshopify.com" })).resolves.toBe("flag-store.myshopify.com");
	});

	it("fails with actionable guidance when no store domain is configured anywhere", async () => {
		await expect(run({})).resolves.toBeUndefined();
		expect(process.exitCode).toBe(1);
	});

	it("rejects a domain that is not a myshopify.com host", async () => {
		await expect(run({ store: "example.com" })).resolves.toBeUndefined();
		expect(process.exitCode).toBe(1);
	});
});
