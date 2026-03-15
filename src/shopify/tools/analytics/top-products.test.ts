import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupIntegrationContext,
	createIntegrationContext,
	type IntegrationContext,
	skipIfNoCredentials,
} from "../../../test/integration-helpers.js";
import topProducts from "./top-products.tool.js";

describe.skipIf(skipIfNoCredentials())("top_products", () => {
	let context: IntegrationContext;

	beforeAll(async () => {
		context = await createIntegrationContext();
		context.registry.register(topProducts);
	});

	afterAll(async () => {
		await cleanupIntegrationContext(context);
	});

	it("has correct metadata", () => {
		expect(topProducts.name).toBe("top_products");
		expect(topProducts.domain).toBe("analytics");
		expect(topProducts.tier).toBe(1);
		expect(topProducts.scopes).toEqual(["read_reports"]);
		expect(topProducts.handler).toBeDefined();
	});

	it("returns top products sorted by revenue", async () => {
		const result = await context.engine.execute(
			"top_products",
			{ start_date: "2024-01-01", end_date: "2026-12-31", sort_by: "revenue", limit: 5 },
			context.ctx,
		);
		const data = result.data as any;
		expect(Array.isArray(data.products)).toBe(true);
		expect(typeof data.count).toBe("number");
		expect(data.count).toBe(data.products.length);

		if (data.products.length > 0) {
			const first = data.products[0];
			expect(first.productId).toBeNull();
			expect(typeof first.productTitle).toBe("string");
			expect(typeof first.totalRevenue).toBe("number");
			expect(typeof first.totalQuantity).toBe("number");
			expect(typeof first.orderCount).toBe("number");
		}

		// Verify revenue descending order
		for (let i = 1; i < data.products.length; i++) {
			expect(data.products[i - 1].totalRevenue).toBeGreaterThanOrEqual(data.products[i].totalRevenue);
		}
	});
});
