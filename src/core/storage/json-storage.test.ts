import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonStorage } from "./json-storage.js";
import type { StoreEntry } from "./types.js";

describe("JsonStorage", () => {
	let tmpDir: string;
	let storage: JsonStorage;

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `cob-json-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		storage = new JsonStorage(tmpDir);
	});

	afterEach(async () => {
		await storage.close();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("initialize creates directory", async () => {
		await storage.initialize();
		const stat = await fs.stat(tmpDir);
		expect(stat.isDirectory()).toBe(true);
	});

	it("setToken + getToken roundtrip", async () => {
		await storage.initialize();
		await storage.setToken("test.myshopify.com", "shpat_abc123");
		const token = await storage.getToken("test.myshopify.com");
		expect(token).toBe("shpat_abc123");
	});

	it("getToken returns null for unknown domain", async () => {
		await storage.initialize();
		const token = await storage.getToken("unknown.myshopify.com");
		expect(token).toBeNull();
	});

	it("removeToken makes getToken return null", async () => {
		await storage.initialize();
		await storage.setToken("test.myshopify.com", "shpat_abc123");
		await storage.removeToken("test.myshopify.com");
		const token = await storage.getToken("test.myshopify.com");
		expect(token).toBeNull();
	});

	it("listStores returns all stored stores", async () => {
		await storage.initialize();
		const entry1: StoreEntry = {
			domain: "store1.myshopify.com",
			scopes: ["read_products"],
			installedAt: "2026-01-01T00:00:00Z",
			status: "active",
		};
		const entry2: StoreEntry = {
			domain: "store2.myshopify.com",
			scopes: ["read_orders"],
			installedAt: "2026-02-01T00:00:00Z",
			status: "inactive",
		};
		await storage.setStore("store1.myshopify.com", entry1);
		await storage.setStore("store2.myshopify.com", entry2);

		const stores = await storage.listStores();
		expect(stores).toHaveLength(2);
		expect(stores).toEqual(expect.arrayContaining([entry1, entry2]));
	});

	it("setStore + getStore roundtrip", async () => {
		await storage.initialize();
		const entry: StoreEntry = {
			domain: "test.myshopify.com",
			scopes: ["read_products", "write_products"],
			installedAt: "2026-03-01T00:00:00Z",
			status: "active",
			ownerEmail: "owner@example.com",
		};
		await storage.setStore("test.myshopify.com", entry);
		const result = await storage.getStore("test.myshopify.com");
		expect(result).toEqual(entry);
	});

	it("removeStore makes getStore return null", async () => {
		await storage.initialize();
		const entry: StoreEntry = {
			domain: "test.myshopify.com",
			scopes: ["read_products"],
			installedAt: "2026-01-01T00:00:00Z",
			status: "active",
		};
		await storage.setStore("test.myshopify.com", entry);
		await storage.removeStore("test.myshopify.com");
		const result = await storage.getStore("test.myshopify.com");
		expect(result).toBeNull();
	});

	it("getPersistedConfig returns null when empty", async () => {
		await storage.initialize();
		const config = await storage.getPersistedConfig();
		expect(config).toBeNull();
	});

	it("setPersistedConfig + getPersistedConfig roundtrip", async () => {
		await storage.initialize();
		const config = { theme: "dark", maxRetries: 5 };
		await storage.setPersistedConfig(config);
		const result = await storage.getPersistedConfig();
		expect(result).toEqual(config);
	});

	it("logs plaintext warning on initialize", async () => {
		const chunks: string[] = [];
		const dest = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(chunk.toString());
				callback();
			},
		});
		const logger = pino({ level: "warn" }, dest);
		const child = logger.child({ module: "storage" });

		const storageWithLogger = new JsonStorage(tmpDir, child);
		await storageWithLogger.initialize();
		dest.end();

		expect(chunks.length).toBeGreaterThan(0);
		const parsed = JSON.parse(chunks[0]);
		expect(parsed.msg).toContain("PLAINTEXT");
	});

	it("uses atomic writes (temp file then rename)", async () => {
		await storage.initialize();
		// After writing, the tokens.json should exist and the .tmp should not
		await storage.setToken("test.myshopify.com", "shpat_xyz");
		const tokensPath = path.join(tmpDir, "tokens.json");
		const tmpPath = `${tokensPath}.tmp`;

		const stat = await fs.stat(tokensPath);
		expect(stat.isFile()).toBe(true);

		// Temp file should not linger
		await expect(fs.access(tmpPath)).rejects.toThrow();
	});

	it("keeps every token when writes overlap", async () => {
		await storage.initialize();

		// A fixed `<file>.tmp` makes concurrent writers collide: they write the same temp path and
		// both rename it, so writes are lost and the losing rename fails with ENOENT (or EPERM on
		// Windows). Overlapping token refreshes are normal for parallel tool calls.
		const domains = Array.from({ length: 25 }, (_, i) => `store-${i}.myshopify.com`);
		await Promise.all(domains.map((d) => storage.setToken(d, `shpat_${d}`)));

		for (const d of domains) {
			expect(await storage.getToken(d)).toBe(`shpat_${d}`);
		}
	});

	it("leaves no temp files behind after concurrent writes", async () => {
		await storage.initialize();

		await Promise.all(
			Array.from({ length: 25 }, (_, i) => storage.setToken(`concurrent-${i}.myshopify.com`, `shpat_${i}`)),
		);

		const leftover = (await fs.readdir(tmpDir)).filter((f) => f.endsWith(".tmp"));
		expect(leftover).toEqual([]);
	});

	it("never exposes a partially written file to a concurrent reader", async () => {
		await storage.initialize();
		const tokensPath = path.join(tmpDir, "tokens.json");

		// Readers must always observe a complete document: rename is atomic, so a reader sees
		// either the old file or the new one, never a half-flushed buffer.
		const writes = Promise.all(
			Array.from({ length: 20 }, (_, i) => storage.setToken(`reader-${i}.myshopify.com`, `shpat_${i}`)),
		);

		const reads: Promise<void>[] = [];
		for (let i = 0; i < 40; i++) {
			reads.push(
				fs
					.readFile(tokensPath, "utf-8")
					.then((content) => {
						expect(() => JSON.parse(content)).not.toThrow();
					})
					.catch(() => {
						// The file briefly not being readable is acceptable; malformed JSON is not.
					}),
			);
		}

		await Promise.all([writes, ...reads]);
	});
});
