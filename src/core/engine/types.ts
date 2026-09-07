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
	/**
	 * Which of Shopify's two GraphQL APIs `graphql` is written against.
	 *
	 * Defaults to `admin`, which is what every tool before 0.10.0 was. `storefront` exists
	 * because some objects live on one schema only -- `Shop.brand`, the merchant's logo and
	 * brand colours, is Storefront-only and has no Admin equivalent. They are different
	 * endpoints with different tokens and different auth headers, so this is a transport
	 * choice, not a query one, and it cannot be expressed inside the document.
	 */
	api?: "admin" | "storefront";
	graphql?: string;
	handler?: (input: any, ctx: ExecutionContext) => Promise<any>;
	response?: (data: any) => any;
}

export interface ExecutionContext {
	shopify: {
		query: (query: string, variables?: Record<string, unknown>, queryType?: string) => Promise<any>;
	};
	/**
	 * The Storefront API, when one is configured. Absent rather than throwing, so a server that
	 * never loads a `api: storefront` tool costs nothing and needs no extra credential.
	 */
	storefront?: {
		query: (query: string, variables?: Record<string, unknown>) => Promise<any>;
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
