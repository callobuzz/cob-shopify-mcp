import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { readReversalValue, shopifyQLField } from "@shopify/client/shopifyql-fields.js";
import { z } from "zod";

export default defineTool({
	name: "refund_rate_summary",
	domain: "analytics",
	tier: 1,
	description:
		"Refund summary for a date range: refunded value, gross sales and refund rate as a share of gross sales (values in shop currency)",
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
		// Shopify renamed `returns` to `sales_reversals` in API 2026-04 and removed the old name in
		// 2026-07. Ask for whichever spelling the configured version actually serves.
		const reversalsField = shopifyQLField("returns", ctx.config.shopify.api_version);
		const query = `FROM sales SHOW orders, ${reversalsField}, gross_sales, net_sales, discounts SINCE ${input.start_date} UNTIL ${input.end_date}`;
		const result = await executeShopifyQL(query, ctx);

		const row = result.data[0] ?? {};
		const totalOrders = (row.orders as number) ?? 0;
		const grossSales = (row.gross_sales as number) ?? 0;
		const netSales = (row.net_sales as number) ?? 0;

		// `returns`/`sales_reversals` is MONEY (confirmed against the live API: dataType MONEY), and
		// is the refunded value itself — so use it directly rather than approximating it from
		// gross - net - discounts. Shopify reports it as a negative or positive magnitude depending
		// on the column, so take the absolute value.
		const reversalValue = (readReversalValue(row, "returns") as number) ?? 0;
		const totalRefundAmount = Math.round(Math.abs(reversalValue) * 100) / 100;

		// A rate over money must divide by money. Dividing the refunded amount by an order count
		// yields a number with no meaning, which is what this reported before.
		const refundRate = grossSales > 0 ? Math.round((totalRefundAmount / grossSales) * 10000) / 100 : 0;

		return { totalOrders, grossSales, netSales, totalRefundAmount, refundRate };
	},
});
