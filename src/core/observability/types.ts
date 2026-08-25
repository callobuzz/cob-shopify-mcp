export interface ShopifyCostData {
	requestedQueryCost: number;
	actualQueryCost: number;
	throttleStatus: {
		maximumAvailable: number;
		currentlyAvailable: number;
		restoreRate: number;
	};
}

/**
 * ShopifyQL requests are billed against a second, separate budget returned as
 * `extensions.shopifyqlCost`, alongside the usual `extensions.cost`. It is not a leaky bucket:
 * there is no restore rate, the allowance refills only at `windowResetAt`. Exhausting it makes
 * Shopify answer analytics queries with a "Rate limited" GraphQL error inside an HTTP 200.
 */
export interface ShopifyQLCostData {
	requestedQueryCost: number;
	maximumAvailable: number;
	currentlyAvailable: number;
	windowResetAt: string;
}

export interface SessionCostStats {
	totalCostConsumed: number;
	totalCallsMade: number;
	budgetRemaining: number;
	averageCostPerCall: number;
}

export interface CostSummary {
	_cost: ShopifyCostData;
	_session: SessionCostStats;
}

export interface AuditEntry {
	tool: string;
	input: Record<string, unknown>;
	store: string;
	ts: string;
	duration_ms: number;
	status: "success" | "error";
	cost?: ShopifyCostData;
	error?: string;
}
