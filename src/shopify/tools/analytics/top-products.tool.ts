import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "top_products",
	domain: "analytics",
	tier: 1,
	description: "Best-selling products by revenue or quantity in a date range",
	scopes: ["read_reports"],
	input: {
		start_date: z.string().describe("ISO 8601 date, e.g. 2026-01-01"),
		end_date: z.string().describe("ISO 8601 date, e.g. 2026-01-31"),
		sort_by: z.enum(["revenue", "quantity"]).default("revenue").describe("Sort by revenue or quantity"),
		limit: z.coerce.number().min(1).max(50).default(10).describe("Number of products to return"),
	},
	handler: async (
		input: { start_date: string; end_date: string; sort_by: string; limit: number },
		ctx: ExecutionContext,
	) => {
		const sortColumn = input.sort_by === "quantity" ? "units_sold" : "total_sales";
		const query = `FROM sales SHOW total_sales, units_sold, orders GROUP BY product_title SINCE ${input.start_date} UNTIL ${input.end_date} ORDER BY ${sortColumn} DESC LIMIT ${input.limit}`;

		const result = await executeShopifyQL(query, ctx);

		const products = result.data.map((row) => ({
			productId: null,
			productTitle: row.product_title as string,
			totalRevenue: typeof row.total_sales === "number" ? Math.round(row.total_sales * 100) / 100 : 0,
			totalQuantity: typeof row.units_sold === "number" ? row.units_sold : 0,
			orderCount: typeof row.orders === "number" ? row.orders : 0,
		}));

		return { products, count: products.length };
	},
});
