import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupIntegrationContext,
	createIntegrationContext,
	type IntegrationContext,
	skipIfNoCredentials,
} from "../../../test/integration-helpers.js";
import conversionFunnel from "./conversion-funnel.tool.js";

describe.skipIf(skipIfNoCredentials())("conversion_funnel", () => {
	let context: IntegrationContext;

	beforeAll(async () => {
		context = await createIntegrationContext();
		context.registry.register(conversionFunnel);
	});

	afterAll(async () => {
		await cleanupIntegrationContext(context);
	});

	it("has correct metadata", () => {
		expect(conversionFunnel.name).toBe("conversion_funnel");
		expect(conversionFunnel.domain).toBe("analytics");
		expect(conversionFunnel.tier).toBe(1);
		expect(conversionFunnel.scopes).toEqual(["read_reports"]);
		expect(conversionFunnel.handler).toBeDefined();
	});

	it("returns funnel metrics with correct field types", async () => {
		const result = await context.engine.execute(
			"conversion_funnel",
			{ start_date: "2024-01-01", end_date: "2026-12-31" },
			context.ctx,
		);
		const data = result.data as any;
		expect(typeof data.sessions).toBe("number");
		expect(typeof data.orders).toBe("number");
		expect(typeof data.conversionRate).toBe("number");
		expect(typeof data.cartAbandonmentRate).toBe("number");
		expect(typeof data.ordersPerSession).toBe("number");
	});
});
