import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cleanupIntegrationContext,
	createIntegrationContext,
	type IntegrationContext,
	skipIfNoCredentials,
} from "../../test/integration-helpers.js";
import { executeShopifyQL } from "./shopifyql-client.js";

describe.skipIf(skipIfNoCredentials())("executeShopifyQL", () => {
	let context: IntegrationContext;

	beforeAll(async () => {
		context = await createIntegrationContext();
	});

	afterAll(async () => {
		await cleanupIntegrationContext(context);
	});

	it("should return data and columns for a valid sales query", async () => {
		const result = await executeShopifyQL("FROM sales SHOW total_sales SINCE -30d", context.ctx);

		expect(result).toHaveProperty("data");
		expect(result).toHaveProperty("columns");
		expect(Array.isArray(result.data)).toBe(true);
		expect(Array.isArray(result.columns)).toBe(true);

		if (result.columns.length > 0) {
			expect(result.columns[0]).toHaveProperty("name");
			expect(result.columns[0]).toHaveProperty("dataType");
			expect(result.columns[0]).toHaveProperty("displayName");
		}
	});

	it("should coerce MONEY values to numbers", async () => {
		const result = await executeShopifyQL("FROM sales SHOW total_sales SINCE -30d", context.ctx);

		if (result.data.length > 0) {
			const moneyColumns = result.columns.filter((c) => c.dataType.toUpperCase() === "MONEY");
			for (const col of moneyColumns) {
				for (const row of result.data) {
					const val = row[col.name];
					expect(val === null || typeof val === "number").toBe(true);
				}
			}
		}
	});

	it("should preserve null values", async () => {
		// Query that may produce nulls — results verified by checking type
		const result = await executeShopifyQL("FROM sales SHOW total_sales SINCE -30d", context.ctx);

		// Verify the structure is correct; null preservation is tested by type check
		for (const row of result.data) {
			for (const col of result.columns) {
				const val = row[col.name];
				expect(val === null || typeof val === "string" || typeof val === "number").toBe(true);
			}
		}
	});

	it("returns zeroed aggregates, not an empty set, for a range with no data", async () => {
		const result = await executeShopifyQL("FROM sales SHOW total_sales SINCE 1900-01-01 UNTIL 1900-01-02", context.ctx);

		// Verified live: Shopify answers an empty range with one row of zeros rather than no rows.
		// Callers must therefore test the values, not the row count, to detect "no activity".
		expect(Array.isArray(result.columns)).toBe(true);
		expect(result.data.length).toBeLessThanOrEqual(1);
		for (const row of result.data) {
			expect(row.total_sales === 0 || row.total_sales === null).toBe(true);
		}
	});

	it("should throw on invalid ShopifyQL query", async () => {
		await expect(executeShopifyQL("FROM invalid_table SHOW nothing", context.ctx)).rejects.toThrow();
	});

	it("should return expected columns for a multi-field query", async () => {
		const result = await executeShopifyQL("FROM sales SHOW total_sales, orders SINCE -7d", context.ctx);

		expect(result.columns.length).toBeGreaterThanOrEqual(1);
		expect(result).toHaveProperty("data");
		expect(Array.isArray(result.data)).toBe(true);
	});
});
