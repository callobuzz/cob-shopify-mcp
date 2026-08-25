import type { ShopifyCostData } from "@core/observability/types.js";

export interface ShopifyQueryResult {
	data: unknown;
	cost: ShopifyCostData | null;
}

export interface ShopifyClientConfig {
	storeDomain: string;
	apiVersion: string;
	authProvider: { getToken(storeDomain: string): Promise<string> };
	costTracker: { recordCall(cost: ShopifyCostData): void };
	logger: {
		debug(msg: string, ...args: unknown[]): void;
		warn(msg: string, ...args: unknown[]): void;
		error(msg: string, ...args: unknown[]): void;
	};
	cache?: { readTtl: number; searchTtl: number; analyticsTtl: number };
	rateLimit?: {
		respectShopifyCost: boolean;
		maxConcurrent: number;
		/**
		 * Longest to block waiting for the ShopifyQL allowance window to reset before failing with
		 * the reset time. Defaults to 10s: the window is a minute, so waiting always terminates, but
		 * a tool call that blocks that long reads as a hang. Batch jobs can raise it.
		 */
		maxShopifyQLWaitMs?: number;
	};
}

export type QueryType = "read" | "search" | "mutation" | "analytics";
