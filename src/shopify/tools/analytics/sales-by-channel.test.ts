import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupIntegrationContext,
	createIntegrationContext,
	type IntegrationContext,
	skipIfNoCredentials,
} from "../../../test/integration-helpers.js";
import salesByChannel from "./sales-by-channel.tool.js";

describe.skipIf(skipIfNoCredentials())("sales_by_channel", () => {
	let context: IntegrationContext;

	beforeAll(async () => {
		context = await createIntegrationContext();
		context.registry.register(salesByChannel);
	});

	afterAll(async () => {
		await cleanupIntegrationContext(context);
	});

	it("has correct metadata", () => {
		expect(salesByChannel.name).toBe("sales_by_channel");
		expect(salesByChannel.domain).toBe("analytics");
		expect(salesByChannel.tier).toBe(1);
		expect(salesByChannel.scopes).toEqual(["read_reports"]);
		expect(salesByChannel.handler).toBeDefined();
	});

	it("returns channels array with correct field types", async () => {
		const result = await context.engine.execute(
			"sales_by_channel",
			{ start_date: "2024-01-01", end_date: "2026-12-31" },
			context.ctx,
		);
		const data = result.data as any;
		expect(Array.isArray(data.channels)).toBe(true);
		expect(typeof data.count).toBe("number");
		for (const channel of data.channels) {
			expect(typeof channel.channel).toBe("string");
			expect(typeof channel.totalSales).toBe("number");
			expect(typeof channel.netSales).toBe("number");
			expect(typeof channel.orders).toBe("number");
			expect(typeof channel.unitsSold).toBe("number");
		}
	});
});
