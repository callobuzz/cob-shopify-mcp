import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "top_products",
	domain: "analytics",
	tier: 1,
	description: "Best-selling products by revenue or order count in a date range (values in shop currency)",
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
		sort_by: z.enum(["revenue", "orders"]).default("revenue").describe("Sort by revenue or order count"),
		limit: z.coerce.number().min(1).max(50).default(10).describe("Number of products to return"),
	},
	handler: async (
		input: { start_date: string; end_date: string; sort_by: string; limit: number },
		ctx: ExecutionContext,
	) => {
		const sortColumn = input.sort_by === "orders" ? "orders" : "total_sales";
		const query = `FROM sales SHOW total_sales, orders, net_sales GROUP BY product_title SINCE ${input.start_date} UNTIL ${input.end_date} ORDER BY ${sortColumn} DESC LIMIT ${input.limit}`;

		const result = await executeShopifyQL(query, ctx);

		const products = result.data.map((row) => ({
			// Shopify returns a null product_title for sales it cannot attribute to a product — on a
			// real store that row can top the list. Casting it to string produced a `null` masquerading
			// as one, which breaks any consumer that treats the title as text.
			productTitle: typeof row.product_title === "string" ? row.product_title : null,
			totalRevenue: typeof row.total_sales === "number" ? Math.round(row.total_sales * 100) / 100 : 0,
			netSales: typeof row.net_sales === "number" ? Math.round(row.net_sales * 100) / 100 : 0,
			orderCount: typeof row.orders === "number" ? row.orders : 0,
		}));

		return { products, count: products.length };
	},
});
