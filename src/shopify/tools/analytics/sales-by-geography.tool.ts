import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "sales_by_geography",
	domain: "analytics",
	tier: 1,
	description: "Sales breakdown by geographic region (country or region) using ShopifyQL",
	scopes: ["read_reports"],
	input: {
		start_date: z.string().describe("ISO 8601 date, e.g. 2026-01-01"),
		end_date: z.string().describe("ISO 8601 date, e.g. 2026-01-31"),
		group_by: z
			.enum(["country", "region"])
			.default("country")
			.describe("Group sales by country or region"),
		limit: z.coerce
			.number()
			.min(1)
			.max(100)
			.default(20)
			.describe("Number of locations to return"),
	},
	handler: async (
		input: { start_date: string; end_date: string; group_by: "country" | "region"; limit: number },
		ctx: ExecutionContext,
	) => {
		const dimension = input.group_by === "country" ? "billing_country" : "billing_region";
		const query = `FROM sales SHOW total_sales, orders GROUP BY ${dimension} SINCE ${input.start_date} UNTIL ${input.end_date} ORDER BY total_sales DESC LIMIT ${input.limit}`;
		const result = await executeShopifyQL(query, ctx);
		const regions = result.data.map((row) => ({
			location: (row[dimension] as string) ?? "Unknown",
			totalSales: (row.total_sales as number) ?? 0,
			orders: (row.orders as number) ?? 0,
		}));
		return { regions, groupBy: input.group_by, count: regions.length };
	},
});
