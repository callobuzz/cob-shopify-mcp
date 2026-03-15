import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupIntegrationContext,
	createIntegrationContext,
	type IntegrationContext,
	skipIfNoCredentials,
} from "../../../test/integration-helpers.js";
import refundRateSummary from "./refund-rate-summary.tool.js";

describe.skipIf(skipIfNoCredentials())("refund_rate_summary", () => {
	let context: IntegrationContext;

	beforeAll(async () => {
		context = await createIntegrationContext();
		context.registry.register(refundRateSummary);
	});

	afterAll(async () => {
		await cleanupIntegrationContext(context);
	});

	it("has correct metadata", () => {
		expect(refundRateSummary.name).toBe("refund_rate_summary");
		expect(refundRateSummary.domain).toBe("analytics");
		expect(refundRateSummary.tier).toBe(1);
		expect(refundRateSummary.scopes).toEqual(["read_reports"]);
		expect(refundRateSummary.handler).toBeDefined();
	});

	it("returns refund data for a date range", async () => {
		const result = await context.engine.execute(
			"refund_rate_summary",
			{ start_date: "2024-01-01", end_date: "2026-12-31" },
			context.ctx,
		);
		const data = result.data as any;
		expect(typeof data.totalOrders).toBe("number");
		expect(typeof data.refundedOrders).toBe("number");
		expect(typeof data.refundRate).toBe("number");
		expect(typeof data.totalRefundAmount).toBe("number");
		expect(typeof data.currency).toBe("string");
	});
});
