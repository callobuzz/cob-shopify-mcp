import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "sales_summary",
	domain: "analytics",
	tier: 1,
	description: "Sales total/average by date range",
	scopes: ["read_reports"],
	input: {
		start_date: z.string().describe("ISO 8601 date, e.g. 2026-01-01"),
		end_date: z.string().describe("ISO 8601 date, e.g. 2026-01-31"),
	},
	handler: async (input: { start_date: string; end_date: string }, ctx: ExecutionContext) => {
		const query = `FROM sales SHOW total_sales, net_sales, gross_sales, orders, average_order_value SINCE ${input.start_date} UNTIL ${input.end_date}`;
		const result = await executeShopifyQL(query, ctx);
		const row = result.data[0] ?? {};

		return {
			totalSales: (row.total_sales as number) ?? 0,
			orderCount: (row.orders as number) ?? 0,
			averageOrderValue: (row.average_order_value as number) ?? 0,
			currency: "USD",
			netSales: (row.net_sales as number) ?? 0,
			grossSales: (row.gross_sales as number) ?? 0,
		};
	},
});
