import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "conversion_funnel",
	domain: "analytics",
	tier: 1,
	description:
		"Conversion funnel: sessions at each stage (viewed, added to cart, reached checkout, " +
		"completed checkout), orders, and the rate at which visitors reach each stage",
	scopes: ["read_reports"],
	input: {
		start_date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
			.describe("ISO 8601 date, e.g. 2026-01-01"),
		end_date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
			.describe("ISO 8601 date, e.g. 2026-01-31"),
	},
	handler: async (input: { start_date: string; end_date: string }, ctx: ExecutionContext) => {
		// The sessions dataset carries the funnel stages directly; deriving a "funnel" from session
		// and order totals alone, as this once did, cannot show where visitors drop off.
		const [salesResult, sessionsResult] = await Promise.all([
			executeShopifyQL(
				`FROM sales SHOW orders, total_sales, customers SINCE ${input.start_date} UNTIL ${input.end_date}`,
				ctx,
			),
			executeShopifyQL(
				"FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, " +
					`sessions_that_completed_checkout SINCE ${input.start_date} UNTIL ${input.end_date}`,
				ctx,
			),
		]);

		const salesRow = salesResult.data[0] ?? {};
		const sessionsRow = sessionsResult.data[0] ?? {};

		const orders = (salesRow.orders as number) ?? 0;
		const totalSales = (salesRow.total_sales as number) ?? 0;
		const customers = (salesRow.customers as number) ?? 0;

		const viewSessions = (sessionsRow.sessions as number) ?? 0;
		const cartSessions = (sessionsRow.sessions_with_cart_additions as number) ?? 0;
		const checkoutSessions = (sessionsRow.sessions_that_reached_checkout as number) ?? 0;
		const purchaseSessions = (sessionsRow.sessions_that_completed_checkout as number) ?? 0;

		// Every stage is a share of the sessions that entered the funnel, so the rates are directly
		// comparable and the drop-off between two stages is their difference.
		const rate = (stage: number) => (viewSessions > 0 ? Math.round((stage / viewSessions) * 10000) / 100 : 0);

		return {
			viewSessions,
			cartSessions,
			checkoutSessions,
			purchaseSessions,
			orders,
			customers,
			totalSales,
			cartRate: rate(cartSessions),
			checkoutRate: rate(checkoutSessions),
			conversionRate: rate(purchaseSessions),
			averageOrderValue: orders > 0 ? Math.round((totalSales / orders) * 100) / 100 : 0,
		};
	},
});
