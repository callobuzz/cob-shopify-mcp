import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupIntegrationContext,
	createIntegrationContext,
	type IntegrationContext,
	skipIfNoCredentials,
} from "../../../test/integration-helpers.js";
import salesSummary from "./sales-summary.tool.js";

describe.skipIf(skipIfNoCredentials())("sales_summary", () => {
	let context: IntegrationContext;

	beforeAll(async () => {
		context = await createIntegrationContext();
		context.registry.register(salesSummary);
	});

	afterAll(async () => {
		await cleanupIntegrationContext(context);
	});

	it("has correct metadata", () => {
		expect(salesSummary.name).toBe("sales_summary");
		expect(salesSummary.domain).toBe("analytics");
		expect(salesSummary.tier).toBe(1);
		expect(salesSummary.scopes).toEqual(["read_reports"]);
		expect(salesSummary.handler).toBeDefined();
	});

	it("returns sales data for a date range", async () => {
		const result = await context.engine.execute(
			"sales_summary",
			{ start_date: "2024-01-01", end_date: "2026-12-31" },
			context.ctx,
		);
		const data = result.data as any;
		expect(typeof data.totalSales).toBe("number");
		expect(typeof data.orderCount).toBe("number");
		expect(typeof data.averageOrderValue).toBe("number");
		expect(typeof data.netSales).toBe("number");
		expect(typeof data.grossSales).toBe("number");
	});
});
