import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupIntegrationContext,
	createIntegrationContext,
	type IntegrationContext,
	skipIfNoCredentials,
} from "../../../test/integration-helpers.js";
import salesByGeography from "./sales-by-geography.tool.js";

describe.skipIf(skipIfNoCredentials())("sales_by_geography", () => {
	let context: IntegrationContext;

	beforeAll(async () => {
		context = await createIntegrationContext();
		context.registry.register(salesByGeography);
	});

	afterAll(async () => {
		await cleanupIntegrationContext(context);
	});

	it("has correct metadata", () => {
		expect(salesByGeography.name).toBe("sales_by_geography");
		expect(salesByGeography.domain).toBe("analytics");
		expect(salesByGeography.tier).toBe(1);
		expect(salesByGeography.scopes).toEqual(["read_reports"]);
		expect(salesByGeography.handler).toBeDefined();
	});

	it("returns regions array grouped by country", async () => {
		const result = await context.engine.execute(
			"sales_by_geography",
			{ start_date: "2024-01-01", end_date: "2026-12-31", group_by: "country" },
			context.ctx,
		);
		const data = result.data as any;
		expect(Array.isArray(data.regions)).toBe(true);
		expect(data.groupBy).toBe("country");
		expect(typeof data.count).toBe("number");
		for (const region of data.regions) {
			expect(typeof region.location).toBe("string");
			expect(typeof region.totalSales).toBe("number");
			expect(typeof region.orders).toBe("number");
		}
	});

	it("returns regions array grouped by region", async () => {
		const result = await context.engine.execute(
			"sales_by_geography",
			{ start_date: "2024-01-01", end_date: "2026-12-31", group_by: "region" },
			context.ctx,
		);
		const data = result.data as any;
		expect(Array.isArray(data.regions)).toBe(true);
		expect(data.groupBy).toBe("region");
		expect(typeof data.count).toBe("number");
		for (const region of data.regions) {
			expect(typeof region.location).toBe("string");
			expect(typeof region.totalSales).toBe("number");
			expect(typeof region.orders).toBe("number");
		}
	});
});
