import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import query from "./update-fulfillment-tracking.graphql";

export const updateFulfillmentTracking = defineTool({
	name: "update_fulfillment_tracking",
	domain: "orders",
	tier: 1,
	description:
		"Update the tracking company, number, or URL on an existing fulfillment. Use create_fulfillment to attach tracking when first fulfilling.",
	scopes: ["write_assigned_fulfillment_orders"],
	input: {
		fulfillment_id: z.string().describe("Fulfillment GID, e.g. gid://shopify/Fulfillment/123"),
		tracking_company: z.string().optional().describe("Carrier name, e.g. UPS, FedEx, DHL"),
		tracking_number: z.string().optional().describe("New tracking number"),
		tracking_url: z.string().optional().describe("New tracking URL"),
		notify_customer: z.boolean().optional().describe("Send a tracking update email to the customer"),
	},
	handler: async (input, ctx) => {
		const raw = await ctx.shopify.query(query, {
			fulfillment_id: input.fulfillment_id,
			tracking_company: input.tracking_company,
			tracking_number: input.tracking_number,
			tracking_url: input.tracking_url,
			notify_customer: input.notify_customer,
		});
		const data = raw.data ?? raw;
		const result = data.fulfillmentTrackingInfoUpdate;
		if (result.userErrors?.length > 0) {
			return { errors: result.userErrors };
		}
		return { fulfillment: result.fulfillment };
	},
});
