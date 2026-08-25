import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import query from "./create-fulfillment.graphql";

export const createFulfillment = defineTool({
	name: "create_fulfillment",
	domain: "orders",
	tier: 1,
	description:
		"Fulfill a fulfillment order (mark as shipped) and optionally attach tracking info. Requires a fulfillment order GID from get_fulfillment_orders — an order GID will not work.",
	scopes: ["write_assigned_fulfillment_orders"],
	input: {
		fulfillment_order_id: z
			.string()
			.describe("Fulfillment order GID from get_fulfillment_orders, e.g. gid://shopify/FulfillmentOrder/123"),
		tracking_company: z.string().optional().describe("Carrier name, e.g. UPS, FedEx, DHL, BlueDart"),
		tracking_number: z.string().optional().describe("Tracking number"),
		tracking_url: z.string().optional().describe("Tracking URL"),
		notify_customer: z.boolean().optional().describe("Send a shipping notification email to the customer"),
	},
	handler: async (input, ctx) => {
		const raw = await ctx.shopify.query(query, {
			fulfillment_order_id: input.fulfillment_order_id,
			tracking_company: input.tracking_company,
			tracking_number: input.tracking_number,
			tracking_url: input.tracking_url,
			notify_customer: input.notify_customer,
		});
		const data = raw.data ?? raw;
		const result = data.fulfillmentCreate;
		if (result.userErrors?.length > 0) {
			return { errors: result.userErrors };
		}
		return { fulfillment: result.fulfillment };
	},
});
