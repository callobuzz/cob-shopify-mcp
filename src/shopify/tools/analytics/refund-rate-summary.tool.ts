import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "refund_rate_summary",
	domain: "analytics",
	tier: 1,
	description: "Refund percentage and totals for a date range",
	scopes: ["read_reports"],
	input: {
		start_date: z.string().describe("ISO 8601 date, e.g. 2026-01-01"),
		end_date: z.string().describe("ISO 8601 date, e.g. 2026-01-31"),
	},
	handler: async (input: { start_date: string; end_date: string }, ctx: ExecutionContext) => {
		const query = `FROM sales SHOW orders, returns, sales_reversals SINCE ${input.start_date} UNTIL ${input.end_date}`;
		const result = await executeShopifyQL(query, ctx);

		const row = result.data[0] ?? {};
		const totalOrders = (row.orders as number) ?? 0;
		const refundedOrders = (row.returns as number) ?? 0;
		const totalRefundAmount = Math.abs((row.sales_reversals as number) ?? 0);
		const refundRate = totalOrders > 0 ? Math.round((refundedOrders / totalOrders) * 10000) / 100 : 0;

		return { totalOrders, refundedOrders, refundRate, totalRefundAmount, currency: "USD" };
	},
});
