import type { ExecutionContext } from "@core/engine/types.js";
import { describe, expect, it, vi } from "vitest";
import { updateFulfillmentTracking } from "./update-fulfillment-tracking.tool.js";

function makeCtx(queryFn = vi.fn()): ExecutionContext {
	return {
		shopify: { query: queryFn },
		config: {} as any,
		storage: {} as any,
		logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } as any,
		costTracker: {} as any,
	};
}

describe("update_fulfillment_tracking", () => {
	it("has correct tool definition", () => {
		expect(updateFulfillmentTracking.name).toBe("update_fulfillment_tracking");
		expect(updateFulfillmentTracking.domain).toBe("orders");
		expect(updateFulfillmentTracking.tier).toBe(1);
		expect(updateFulfillmentTracking.scopes).toEqual(["write_assigned_fulfillment_orders"]);
	});

	it("is treated as a mutation by the write_ scope convention", () => {
		expect(updateFulfillmentTracking.scopes.some((s) => s.startsWith("write_"))).toBe(true);
	});

	it("requires the fulfillment id", () => {
		expect(updateFulfillmentTracking.input.fulfillment_id.safeParse(undefined).success).toBe(false);
		expect(updateFulfillmentTracking.input.tracking_company.safeParse(undefined).success).toBe(true);
	});

	it("sends the updated tracking fields", async () => {
		const queryFn = vi.fn().mockResolvedValue({
			fulfillmentTrackingInfoUpdate: {
				fulfillment: {
					id: "gid://shopify/Fulfillment/5",
					status: "SUCCESS",
					trackingInfo: [{ company: "FedEx", number: "7788", url: "https://fedex.com/7788" }],
				},
				userErrors: [],
			},
		});
		const ctx = makeCtx(queryFn);

		const result = await updateFulfillmentTracking.handler?.(
			{
				fulfillment_id: "gid://shopify/Fulfillment/5",
				tracking_company: "FedEx",
				tracking_number: "7788",
				tracking_url: "https://fedex.com/7788",
				notify_customer: false,
			},
			ctx,
		);

		expect(queryFn).toHaveBeenCalledWith(expect.any(String), {
			fulfillment_id: "gid://shopify/Fulfillment/5",
			tracking_company: "FedEx",
			tracking_number: "7788",
			tracking_url: "https://fedex.com/7788",
			notify_customer: false,
		});
		expect(result.fulfillment.trackingInfo[0].number).toBe("7788");
	});

	it("unwraps a data envelope", async () => {
		const queryFn = vi.fn().mockResolvedValue({
			data: {
				fulfillmentTrackingInfoUpdate: {
					fulfillment: { id: "gid://shopify/Fulfillment/8", status: "SUCCESS", trackingInfo: [] },
					userErrors: [],
				},
			},
		});
		const ctx = makeCtx(queryFn);
		const result = await updateFulfillmentTracking.handler?.({ fulfillment_id: "gid://shopify/Fulfillment/8" }, ctx);
		expect(result.fulfillment.id).toBe("gid://shopify/Fulfillment/8");
	});

	it("returns errors when userErrors present", async () => {
		const queryFn = vi.fn().mockResolvedValue({
			fulfillmentTrackingInfoUpdate: {
				fulfillment: null,
				userErrors: [{ field: ["fulfillmentId"], message: "Fulfillment does not exist" }],
			},
		});
		const ctx = makeCtx(queryFn);

		const result = await updateFulfillmentTracking.handler?.({ fulfillment_id: "gid://shopify/Fulfillment/999" }, ctx);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toBe("Fulfillment does not exist");
	});
});
