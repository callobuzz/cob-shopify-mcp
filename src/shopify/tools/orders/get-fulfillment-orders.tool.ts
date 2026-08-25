import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import query from "./get-fulfillment-orders.graphql";

export const getFulfillmentOrders = defineTool({
	name: "get_fulfillment_orders",
	domain: "orders",
	// Without this, stripping the "orders" domain suffix yields `get-fulfillment` — which loses the
	// subject (fulfillment *orders*) and sits confusingly next to `get-fulfillment-status`.
	cliAction: "get-fulfillment-orders",
	tier: 1,
	description:
		"Get the fulfillment orders for an order, including their line items and remaining quantities. Call this first to obtain the fulfillment order ID required by create_fulfillment.",
	scopes: ["read_orders", "read_assigned_fulfillment_orders"],
	input: {
		id: z.string().describe("Order GID, e.g. gid://shopify/Order/123"),
	},
	graphql: query,
	response: (data: any) => {
		const raw = data.data ?? data;
		const order = raw.order;
		if (!order) return { order: null };
		return {
			order: {
				id: order.id,
				name: order.name,
				displayFulfillmentStatus: order.displayFulfillmentStatus,
				fulfillmentOrders: (order.fulfillmentOrders?.edges ?? []).map((edge: any) => ({
					id: edge.node.id,
					status: edge.node.status,
					requestStatus: edge.node.requestStatus,
					assignedLocation: edge.node.assignedLocation?.name ?? null,
					lineItems: (edge.node.lineItems?.edges ?? []).map((li: any) => ({
						id: li.node.id,
						totalQuantity: li.node.totalQuantity,
						remainingQuantity: li.node.remainingQuantity,
					})),
				})),
			},
		};
	},
});
