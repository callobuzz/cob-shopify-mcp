import fs from "node:fs/promises";
import path from "node:path";
import type pino from "pino";
import type { StorageBackend } from "./storage.interface.js";
import type { StoreEntry, TokenMetadata } from "./types.js";

/**
 * JSON file storage backend.
 * Stores tokens, stores, and config as individual JSON files.
 * Tokens are stored in PLAINTEXT — a warning is logged on initialize().
 */
export class JsonStorage implements StorageBackend {
	private readonly storagePath: string;
	private readonly tokensFile: string;
	private readonly storesFile: string;
	private readonly configFile: string;
	private readonly logger?: pino.Logger;
	/** Serializes writes per file path within this process. */
	private readonly writeChain = new Map<string, Promise<void>>();
	/** Makes each temp filename unique within this process. */
	private writeCounter = 0;

	constructor(storagePath: string, logger?: pino.Logger) {
		this.storagePath = storagePath;
		this.tokensFile = path.join(storagePath, "tokens.json");
		this.storesFile = path.join(storagePath, "stores.json");
		this.configFile = path.join(storagePath, "config.json");
		this.logger = logger;
	}

	async initialize(): Promise<void> {
		await fs.mkdir(this.storagePath, { recursive: true });

		// Ensure files exist
		await this.ensureFile(this.tokensFile, {});
		await this.ensureFile(this.storesFile, {});
		await this.ensureFile(this.configFile, {});

		if (this.logger) {
			this.logger.warn(
				"JSON storage backend stores tokens in PLAINTEXT. " +
					"For production use, switch to SQLite backend with encryption: " +
					'storage.backend = "sqlite"',
			);
		}
	}

	async close(): Promise<void> {
		// No-op for file-based storage
	}

	// Token operations

	async getToken(storeDomain: string): Promise<string | null> {
		const data = await this.readJsonFile<Record<string, string>>(this.tokensFile);
		return data[storeDomain] ?? null;
	}

	async setToken(storeDomain: string, token: string, _metadata?: TokenMetadata): Promise<void> {
		await this.mutateJsonFile<Record<string, string>>(this.tokensFile, (data) => {
			data[storeDomain] = token;
		});
	}

	async removeToken(storeDomain: string): Promise<void> {
		await this.mutateJsonFile<Record<string, string>>(this.tokensFile, (data) => {
			delete data[storeDomain];
		});
	}

	// Store operations

	async listStores(): Promise<StoreEntry[]> {
		const data = await this.readJsonFile<Record<string, StoreEntry>>(this.storesFile);
		return Object.values(data);
	}

	async getStore(storeDomain: string): Promise<StoreEntry | null> {
		const data = await this.readJsonFile<Record<string, StoreEntry>>(this.storesFile);
		return data[storeDomain] ?? null;
	}

	async setStore(storeDomain: string, entry: StoreEntry): Promise<void> {
		await this.mutateJsonFile<Record<string, StoreEntry>>(this.storesFile, (data) => {
			data[storeDomain] = entry;
		});
	}

	async removeStore(storeDomain: string): Promise<void> {
		await this.mutateJsonFile<Record<string, StoreEntry>>(this.storesFile, (data) => {
			delete data[storeDomain];
		});
	}

	// Config persistence

	async getPersistedConfig(): Promise<Record<string, unknown> | null> {
		const data = await this.readJsonFile<Record<string, unknown>>(this.configFile);
		return Object.keys(data).length === 0 ? null : data;
	}

	async setPersistedConfig(config: Record<string, unknown>): Promise<void> {
		await this.writeJsonFile(this.configFile, config);
	}

	// Private helpers

	private async ensureFile(filePath: string, defaultContent: unknown): Promise<void> {
		try {
			await fs.access(filePath);
		} catch {
			await this.writeJsonFile(filePath, defaultContent);
		}
	}

	private async readJsonFile<T>(filePath: string): Promise<T> {
		try {
			const content = await fs.readFile(filePath, "utf-8");
			return JSON.parse(content) as T;
		} catch {
			return {} as T;
		}
	}

	/**
	 * Serializes work on one file within this process.
	 *
	 * Every mutation here is read-modify-write, so the read and the write must be held together.
	 * Without this, concurrent setToken() calls all read the same snapshot and the last write wins,
	 * silently dropping the other tokens. Overlapping token refreshes are normal for parallel tool
	 * calls, so this is reachable in ordinary use, not just under test.
	 */
	private async withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
		const previous = this.writeChain.get(filePath) ?? Promise.resolve();
		const run = previous.catch(() => {}).then(fn);
		// Track a void-typed tail so a rejection here never becomes an unhandled rejection for
		// the next waiter, which only needs the ordering, not the value.
		const tail = run.then(
			() => {},
			() => {},
		);
		this.writeChain.set(filePath, tail);
		try {
			return await run;
		} finally {
			// Only clear if no later operation has queued behind this one.
			if (this.writeChain.get(filePath) === tail) {
				this.writeChain.delete(filePath);
			}
		}
	}

	/** Read, mutate and write one file atomically with respect to other callers in this process. */
	private async mutateJsonFile<T extends object>(filePath: string, mutate: (data: T) => void): Promise<void> {
		await this.withFileLock(filePath, async () => {
			const data = await this.readJsonFile<T>(filePath);
			mutate(data);
			await this.writeJsonFileNow(filePath, data);
		});
	}

	/**
	 * Atomic write, safe against concurrent writers in other processes.
	 *
	 * The temp name is unique per process and per call: a fixed `<file>.tmp` means two concurrent
	 * writers write the same temp path and then both rename it, so one loses its data and the other
	 * fails with ENOENT (the temp file was already renamed away) or, on Windows, EPERM. Several
	 * server instances sharing a storage directory hit exactly this.
	 */
	private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
		await this.withFileLock(filePath, () => this.writeJsonFileNow(filePath, data));
	}

	private async writeJsonFileNow(filePath: string, data: unknown): Promise<void> {
		const tmpPath = `${filePath}.${process.pid}.${(this.writeCounter++).toString(36)}.tmp`;
		const content = JSON.stringify(data, null, 2);
		await fs.writeFile(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
		try {
			await this.renameWithRetry(tmpPath, filePath);
		} catch (err) {
			// Never leave a stray temp file behind on failure.
			await fs.rm(tmpPath, { force: true }).catch(() => {});
			throw err;
		}
		// On some platforms, rename doesn't preserve mode from writeFile.
		// Explicitly set permissions after rename — may be a no-op on Windows.
		try {
			await fs.chmod(filePath, 0o600);
		} catch {
			// chmod may not be fully supported on Windows; ignore gracefully
		}
	}

	/**
	 * Windows fails a rename with EPERM/EACCES/EBUSY when another process momentarily holds the
	 * destination open — including antivirus and file indexers. These are transient, so retry
	 * briefly rather than surfacing a spurious write failure.
	 */
	private async renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
		for (let attempt = 0; attempt < attempts; attempt++) {
			try {
				await fs.rename(from, to);
				return;
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code;
				const transient = code === "EPERM" || code === "EACCES" || code === "EBUSY";
				if (!transient || attempt === attempts - 1) throw err;
				await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
			}
		}
	}
}
