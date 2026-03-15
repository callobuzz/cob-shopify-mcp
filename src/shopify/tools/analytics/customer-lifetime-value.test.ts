import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupIntegrationContext,
	createIntegrationContext,
	type IntegrationContext,
	skipIfNoCredentials,
} from "../../../test/integration-helpers.js";
import customerLifetimeValue from "./customer-lifetime-value.tool.js";

describe.skipIf(skipIfNoCredentials())("customer_lifetime_value", () => {
	let context: IntegrationContext;

	beforeAll(async () => {
		context = await createIntegrationContext();
		context.registry.register(customerLifetimeValue);
	});

	afterAll(async () => {
		await cleanupIntegrationContext(context);
	});

	it("has correct metadata", () => {
		expect(customerLifetimeValue.name).toBe("customer_lifetime_value");
		expect(customerLifetimeValue.domain).toBe("analytics");
		expect(customerLifetimeValue.tier).toBe(1);
		expect(customerLifetimeValue.scopes).toEqual(["read_reports", "read_customers"]);
		expect(customerLifetimeValue.handler).toBeDefined();
	});

	it("returns customers array with correct field types", async () => {
		const result = await context.engine.execute(
			"customer_lifetime_value",
			{ limit: 10, sort_by: "amount" },
			context.ctx,
		);
		const data = result.data as any;
		expect(Array.isArray(data.customers)).toBe(true);
		expect(typeof data.count).toBe("number");
		for (const customer of data.customers) {
			expect(typeof customer.email).toBe("string");
			expect(typeof customer.totalOrders).toBe("number");
			expect(typeof customer.totalAmountSpent).toBe("number");
			expect(typeof customer.averageOrderValue).toBe("number");
		}
	});
});
