import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "shopifyql_query",
	domain: "analytics",
	// Tier 2 (disabled by default): this is a raw passthrough that runs any ShopifyQL the caller
	// writes, so it reaches store data no curated analytics tool exposes. Enable deliberately with
	// tools.enable: ["shopifyql_query"].
	tier: 2,
	description: "Execute any ShopifyQL query for custom analytics and reporting",
	scopes: ["read_reports"],
	input: {
		query: z.string().describe("ShopifyQL query string, e.g. FROM sales SHOW total_sales SINCE -30d"),
	},
	handler: async (input: { query: string }, ctx: ExecutionContext) => {
		const trimmed = input.query.trim();
		if (!/^from\s/i.test(trimmed)) {
			throw new Error("ShopifyQL query must start with FROM");
		}
		const result = await executeShopifyQL(trimmed, ctx);
		return { data: result.data, columns: result.columns };
	},
});
