import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { executeShopifyQL } from "@shopify/client/shopifyql-client.js";
import { z } from "zod";

export default defineTool({
	name: "customer_lifetime_value",
	domain: "analytics",
	tier: 1,
	description: "Customer lifetime value report showing top customers by spend or order count",
	scopes: ["read_reports", "read_customers"],
	input: {
		limit: z.coerce.number().min(1).max(100).default(25).describe("Number of customers to return"),
		sort_by: z.enum(["amount", "orders"]).default("amount").describe("Sort by total spend or order count"),
	},
	handler: async (input: { limit: number; sort_by: "amount" | "orders" }, ctx: ExecutionContext) => {
		const sortColumn = input.sort_by === "amount" ? "total_amount_spent" : "total_orders";
		const query = `FROM customers SHOW customer_email, total_orders, total_amount_spent ORDER BY ${sortColumn} DESC LIMIT ${input.limit}`;
		const result = await executeShopifyQL(query, ctx);
		const customers = result.data.map((row) => {
			const totalOrders = (row.total_orders as number) ?? 0;
			const totalAmountSpent = (row.total_amount_spent as number) ?? 0;
			return {
				email: (row.customer_email as string) ?? "",
				totalOrders,
				totalAmountSpent,
				averageOrderValue: totalOrders > 0 ? totalAmountSpent / totalOrders : 0,
			};
		});
		return { customers, count: customers.length };
	},
});
