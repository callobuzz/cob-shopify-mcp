import type { ExecutionContext } from "@core/engine/types.js";
import { describe, expect, it, vi } from "vitest";
import { getFulfillmentOrders } from "./get-fulfillment-orders.tool.js";

function makeCtx(queryFn = vi.fn()): ExecutionContext {
	return {
		shopify: { query: queryFn },
		config: {} as any,
		storage: {} as any,
		logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } as any,
		costTracker: {} as any,
	};
}

describe("get_fulfillment_orders", () => {
	it("has correct tool definition", () => {
		expect(getFulfillmentOrders.name).toBe("get_fulfillment_orders");
		expect(getFulfillmentOrders.domain).toBe("orders");
		expect(getFulfillmentOrders.tier).toBe(1);
		expect(getFulfillmentOrders.scopes).toEqual(["read_orders", "read_assigned_fulfillment_orders"]);
	});

	it("is not treated as a mutation (read-only scopes)", () => {
		expect(getFulfillmentOrders.scopes.some((s) => s.startsWith("write_"))).toBe(false);
	});

	it("flattens fulfillment order and line item edges", () => {
		const result = getFulfillmentOrders.response?.({
			order: {
				id: "gid://shopify/Order/1",
				name: "#1001",
				displayFulfillmentStatus: "UNFULFILLED",
				fulfillmentOrders: {
					edges: [
						{
							node: {
								id: "gid://shopify/FulfillmentOrder/10",
								status: "OPEN",
								requestStatus: "UNSUBMITTED",
								assignedLocation: { name: "Main Warehouse" },
								lineItems: {
									edges: [
										{
											node: {
												id: "gid://shopify/FulfillmentOrderLineItem/100",
												totalQuantity: 3,
												remainingQuantity: 2,
											},
										},
									],
								},
							},
						},
					],
				},
			},
		});

		expect(result.order.fulfillmentOrders).toHaveLength(1);
		expect(result.order.fulfillmentOrders[0].id).toBe("gid://shopify/FulfillmentOrder/10");
		expect(result.order.fulfillmentOrders[0].assignedLocation).toBe("Main Warehouse");
		expect(result.order.fulfillmentOrders[0].lineItems).toEqual([
			{ id: "gid://shopify/FulfillmentOrderLineItem/100", totalQuantity: 3, remainingQuantity: 2 },
		]);
	});

	it("unwraps a data envelope", () => {
		const result = getFulfillmentOrders.response?.({
			data: { order: { id: "gid://shopify/Order/1", name: "#1001", displayFulfillmentStatus: "FULFILLED" } },
		});
		expect(result.order.name).toBe("#1001");
		expect(result.order.fulfillmentOrders).toEqual([]);
	});

	it("returns null order when the order is not found", () => {
		expect(getFulfillmentOrders.response?.({ order: null })).toEqual({ order: null });
	});

	it("handles a fulfillment order with no assigned location", () => {
		const result = getFulfillmentOrders.response?.({
			order: {
				id: "gid://shopify/Order/1",
				name: "#1001",
				displayFulfillmentStatus: "UNFULFILLED",
				fulfillmentOrders: {
					edges: [{ node: { id: "gid://shopify/FulfillmentOrder/10", status: "OPEN", requestStatus: null } }],
				},
			},
		});
		expect(result.order.fulfillmentOrders[0].assignedLocation).toBeNull();
		expect(result.order.fulfillmentOrders[0].lineItems).toEqual([]);
	});

	it("sends the order id as the id variable", async () => {
		const queryFn = vi.fn().mockResolvedValue({ order: null });
		const ctx = makeCtx(queryFn);
		await ctx.shopify.query(getFulfillmentOrders.graphql as string, { id: "gid://shopify/Order/1" });
		expect(queryFn).toHaveBeenCalledWith(expect.any(String), { id: "gid://shopify/Order/1" });
	});
});
