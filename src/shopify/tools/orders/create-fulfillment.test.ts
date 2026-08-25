import type { ExecutionContext } from "@core/engine/types.js";
import { describe, expect, it, vi } from "vitest";
import { createFulfillment } from "./create-fulfillment.tool.js";

function makeCtx(queryFn = vi.fn()): ExecutionContext {
	return {
		shopify: { query: queryFn },
		config: {} as any,
		storage: {} as any,
		logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } as any,
		costTracker: {} as any,
	};
}

describe("create_fulfillment", () => {
	it("has correct tool definition", () => {
		expect(createFulfillment.name).toBe("create_fulfillment");
		expect(createFulfillment.domain).toBe("orders");
		expect(createFulfillment.tier).toBe(1);
		expect(createFulfillment.scopes).toEqual(["write_assigned_fulfillment_orders"]);
	});

	it("is treated as a mutation by the write_ scope convention", () => {
		expect(createFulfillment.scopes.some((s) => s.startsWith("write_"))).toBe(true);
	});

	it("requires only the fulfillment order id", () => {
		expect(createFulfillment.input.fulfillment_order_id.safeParse("gid://shopify/FulfillmentOrder/1").success).toBe(
			true,
		);
		expect(createFulfillment.input.tracking_number.safeParse(undefined).success).toBe(true);
		expect(createFulfillment.input.fulfillment_order_id.safeParse(undefined).success).toBe(false);
	});

	it("passes tracking info through as flat variables", async () => {
		const queryFn = vi.fn().mockResolvedValue({
			fulfillmentCreate: {
				fulfillment: {
					id: "gid://shopify/Fulfillment/5",
					status: "SUCCESS",
					createdAt: "2026-08-14T00:00:00Z",
					trackingInfo: [{ company: "UPS", number: "1Z999", url: "https://ups.com/1Z999" }],
				},
				userErrors: [],
			},
		});
		const ctx = makeCtx(queryFn);

		const result = await createFulfillment.handler?.(
			{
				fulfillment_order_id: "gid://shopify/FulfillmentOrder/10",
				tracking_company: "UPS",
				tracking_number: "1Z999",
				tracking_url: "https://ups.com/1Z999",
				notify_customer: true,
			},
			ctx,
		);

		expect(queryFn).toHaveBeenCalledWith(expect.any(String), {
			fulfillment_order_id: "gid://shopify/FulfillmentOrder/10",
			tracking_company: "UPS",
			tracking_number: "1Z999",
			tracking_url: "https://ups.com/1Z999",
			notify_customer: true,
		});
		expect(result.fulfillment.id).toBe("gid://shopify/Fulfillment/5");
		expect(result.fulfillment.status).toBe("SUCCESS");
	});

	it("fulfills without tracking info", async () => {
		const queryFn = vi.fn().mockResolvedValue({
			fulfillmentCreate: {
				fulfillment: { id: "gid://shopify/Fulfillment/6", status: "SUCCESS", trackingInfo: [] },
				userErrors: [],
			},
		});
		const ctx = makeCtx(queryFn);

		const result = await createFulfillment.handler?.(
			{ fulfillment_order_id: "gid://shopify/FulfillmentOrder/11" },
			ctx,
		);

		expect(queryFn).toHaveBeenCalledWith(expect.any(String), {
			fulfillment_order_id: "gid://shopify/FulfillmentOrder/11",
			tracking_company: undefined,
			tracking_number: undefined,
			tracking_url: undefined,
			notify_customer: undefined,
		});
		expect(result.fulfillment.status).toBe("SUCCESS");
	});

	it("unwraps a data envelope", async () => {
		const queryFn = vi.fn().mockResolvedValue({
			data: {
				fulfillmentCreate: {
					fulfillment: { id: "gid://shopify/Fulfillment/7", status: "SUCCESS" },
					userErrors: [],
				},
			},
		});
		const ctx = makeCtx(queryFn);
		const result = await createFulfillment.handler?.(
			{ fulfillment_order_id: "gid://shopify/FulfillmentOrder/12" },
			ctx,
		);
		expect(result.fulfillment.id).toBe("gid://shopify/Fulfillment/7");
	});

	it("returns errors when userErrors present", async () => {
		const queryFn = vi.fn().mockResolvedValue({
			fulfillmentCreate: {
				fulfillment: null,
				userErrors: [{ field: ["fulfillment"], message: "Fulfillment order is already fulfilled" }],
			},
		});
		const ctx = makeCtx(queryFn);

		const result = await createFulfillment.handler?.(
			{ fulfillment_order_id: "gid://shopify/FulfillmentOrder/10" },
			ctx,
		);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toBe("Fulfillment order is already fulfilled");
		expect(result.fulfillment).toBeUndefined();
	});
});
