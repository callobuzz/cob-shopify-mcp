import type pino from "pino";
import type { ZodType } from "zod";
import type { CobConfig } from "../config/types.js";
import type { CostTracker } from "../observability/cost-tracker.js";
import type { SessionCostStats, ShopifyCostData } from "../observability/types.js";
import type { StorageBackend } from "../storage/storage.interface.js";

export interface ToolDefinition {
	name: string;
	domain: string;
	tier: 1 | 2 | 3;
	description: string;
	scopes: string[];
	input: Record<string, ZodType>;
	/**
	 * Explicit CLI action name, overriding the name derived by stripping the domain word.
	 *
	 * Set this when the domain word is part of a compound noun rather than a redundant suffix:
	 * `get_fulfillment_orders` is about *fulfillment orders*, so the automatic strip turns it into
	 * `get-fulfillment`, which both loses the meaning and reads as a near-duplicate of
	 * `get-fulfillment-status`.
	 */
	cliAction?: string;
	outputFields?: string[];
	graphql?: string;
	handler?: (input: any, ctx: ExecutionContext) => Promise<any>;
	response?: (data: any) => any;
}

export interface ExecutionContext {
	shopify: {
		query: (query: string, variables?: Record<string, unknown>, queryType?: string) => Promise<any>;
	};
	config: CobConfig;
	storage: StorageBackend;
	logger: pino.Logger;
	costTracker: CostTracker;
}

export interface ToolResult {
	data: unknown;
	_cost?: ShopifyCostData;
	_session?: SessionCostStats;
}
