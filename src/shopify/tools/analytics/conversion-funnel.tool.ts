import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "conversion_funnel",
	domain: "analytics",
	tier: 1,
	description: "Conversion funnel metrics including sessions, orders, conversion rate, and cart abandonment",
	scopes: ["read_reports"],
	input: {
		start_date: z.string().describe("ISO 8601 date, e.g. 2026-01-01"),
		end_date: z.string().describe("ISO 8601 date, e.g. 2026-01-31"),
	},
	handler: async (input: { start_date: string; end_date: string }, ctx: ExecutionContext) => {
		try {
			const query = `FROM sales, sessions SHOW sessions, orders, conversion_rate, cart_abandonment_rate SINCE ${input.start_date} UNTIL ${input.end_date}`;
			const result = await executeShopifyQL(query, ctx);
			const row = result.data[0] ?? {};
			const sessions = (row.sessions as number) ?? 0;
			const orders = (row.orders as number) ?? 0;
			return {
				sessions,
				orders,
				conversionRate: (row.conversion_rate as number) ?? 0,
				cartAbandonmentRate: (row.cart_abandonment_rate as number) ?? 0,
				ordersPerSession: sessions > 0 ? orders / sessions : 0,
			};
		} catch {
			const [salesResult, sessionsResult] = await Promise.all([
				executeShopifyQL(
					`FROM sales SHOW orders SINCE ${input.start_date} UNTIL ${input.end_date}`,
					ctx,
				),
				executeShopifyQL(
					`FROM sessions SHOW sessions SINCE ${input.start_date} UNTIL ${input.end_date}`,
					ctx,
				),
			]);
			const orders = (salesResult.data[0]?.orders as number) ?? 0;
			const sessions = (sessionsResult.data[0]?.sessions as number) ?? 0;
			return {
				sessions,
				orders,
				conversionRate: sessions > 0 ? orders / sessions : 0,
				cartAbandonmentRate: 0,
				ordersPerSession: sessions > 0 ? orders / sessions : 0,
			};
		}
	},
});
