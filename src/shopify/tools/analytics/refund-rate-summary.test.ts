import { ToolEngine } from "@core/engine/tool-engine.js";
import { ToolRegistry } from "@core/registry/tool-registry.js";
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
		expect(typeof data.grossSales).toBe("number");
		expect(typeof data.netSales).toBe("number");
		expect(typeof data.refundRate).toBe("number");
		expect(typeof data.totalRefundAmount).toBe("number");
		// A rate expressed as a percentage of gross sales cannot exceed 100 or go negative.
		expect(data.refundRate).toBeGreaterThanOrEqual(0);
		expect(data.totalRefundAmount).toBeGreaterThanOrEqual(0);
	});
});

/**
 * Shopify introduced `sales_reversals` in API 2026-04 and deprecated `returns`. Verified against
 * the live API: `sales_reversals` does not exist before 2026-04 (Column Not Found), while `returns`
 * is still served through at least 2026-10. So the correct column depends on the configured
 * api_version, and a store on 2026-01 genuinely cannot use the new name.
 *
 * A live store serves one version at a time and cannot demonstrate both, so these assert the
 * emitted query text and the row parsing directly. No Shopify behaviour is simulated — only the
 * string this tool builds and the row shape the live API returns for each version.
 */
describe("refund_rate_summary — sales reversals rename", () => {
	function captureQuery(apiVersion: string, columnName: string, value: number) {
		const queries: string[] = [];
		const ctx = {
			shopify: {
				query: async (_gql: string, variables?: Record<string, unknown>) => {
					queries.push(String(variables?.query));
					return {
						data: {
							shopifyqlQuery: {
								parseErrors: [],
								tableData: {
									columns: [
										{ name: "orders", dataType: "INTEGER", displayName: "Orders" },
										// MONEY, matching the live API: `returns`/`sales_reversals` is a refunded
										// value in shop currency, not a count of orders or items.
										{ name: columnName, dataType: "MONEY", displayName: "Reversals" },
										{ name: "gross_sales", dataType: "MONEY", displayName: "Gross sales" },
										{ name: "net_sales", dataType: "MONEY", displayName: "Net sales" },
										{ name: "discounts", dataType: "MONEY", displayName: "Discounts" },
									],
									rows: [
										{
											orders: "200",
											[columnName]: String(value),
											gross_sales: "1000.00",
											net_sales: "900.00",
											discounts: "25.00",
										},
									],
								},
							},
						},
					};
				},
			},
			config: { shopify: { api_version: apiVersion } },
		} as any;

		return { ctx, queries };
	}

	const run = (apiVersion: string, columnName: string, value = 10) => {
		const { ctx, queries } = captureQuery(apiVersion, columnName, value);
		return refundRateSummary
			.handler?.({ start_date: "2026-01-01", end_date: "2026-01-31" }, ctx)
			.then((result: any) => ({ result, query: queries[0] }));
	};

	it("asks for `returns` on 2026-01, where that is the only spelling served", async () => {
		const { query } = await run("2026-01", "returns");
		expect(query).toContain("SHOW orders, returns,");
		expect(query).not.toContain("sales_reversals");
	});

	it("asks for `sales_reversals` on 2026-07, the current spelling", async () => {
		const { query } = await run("2026-07", "sales_reversals");
		expect(query).toContain("SHOW orders, sales_reversals,");
		expect(query).not.toContain(" returns,");
	});

	it("asks for `sales_reversals` on 2026-04, the version that serves both", async () => {
		const { query } = await run("2026-04", "sales_reversals");
		expect(query).toContain("sales_reversals");
	});

	it("computes the same refund rate on 2026-01 and 2026-07", async () => {
		const old = await run("2026-01", "returns", 10);
		const modern = await run("2026-07", "sales_reversals", 10);

		expect(old?.result.totalRefundAmount).toBe(10);
		expect(modern?.result.totalRefundAmount).toBe(10);
		expect(old?.result.refundRate).toBe(modern?.result.refundRate);
		expect(old?.result).toEqual(modern?.result);
	});

	it("expresses the refund rate as a share of gross sales, not of order count", async () => {
		// 10 refunded against 1000 gross sales is 1%. Dividing by the 200 orders instead would
		// give 5, a number with no unit and no meaning.
		const { result } = (await run("2026-01", "returns", 10)) ?? {};

		expect(result.totalRefundAmount).toBe(10);
		expect(result.grossSales).toBe(1000);
		expect(result.refundRate).toBe(1);
	});

	it("reports a refund magnitude even when Shopify signs the reversal negative", async () => {
		const { result } = (await run("2026-01", "returns", -10)) ?? {};

		expect(result.totalRefundAmount).toBe(10);
		expect(result.refundRate).toBe(1);
	});

	it("reports a zero rate rather than dividing by zero gross sales", async () => {
		// A store with no sales in the range — the live store returns exactly this for a quiet period.
		const ctx = {
			shopify: {
				query: async () => ({
					data: {
						shopifyqlQuery: {
							parseErrors: [],
							tableData: {
								columns: [
									{ name: "orders", dataType: "INTEGER", displayName: "Orders" },
									{ name: "returns", dataType: "MONEY", displayName: "Returns" },
									{ name: "gross_sales", dataType: "MONEY", displayName: "Gross sales" },
									{ name: "net_sales", dataType: "MONEY", displayName: "Net sales" },
									{ name: "discounts", dataType: "MONEY", displayName: "Discounts" },
								],
								rows: [{ orders: "0", returns: "0", gross_sales: "0", net_sales: "0", discounts: "0" }],
							},
						},
					},
				}),
			},
			config: { shopify: { api_version: "2026-01" } },
		} as any;

		const result: any = await refundRateSummary.handler?.({ start_date: "2026-01-01", end_date: "2026-01-31" }, ctx);

		expect(result.refundRate).toBe(0);
		expect(Number.isNaN(result.refundRate)).toBe(false);
	});

	it("still reads the value if the served column disagrees with the configured version", async () => {
		// Stale version table, or Shopify silently serving a different schema.
		const { result } = (await run("2026-01", "sales_reversals", 8)) ?? {};
		expect(result.totalRefundAmount).toBe(8);
	});

	it("picks the right column when driven through the real ToolEngine", async () => {
		const registry = new ToolRegistry();
		registry.register(refundRateSummary);
		const engine = new ToolEngine(registry);

		const seen: Record<string, string> = {};
		for (const [version, column] of [
			["2026-01", "returns"],
			["2026-07", "sales_reversals"],
		]) {
			const { ctx, queries } = captureQuery(version, column, 10);
			const out = await engine.execute(
				"refund_rate_summary",
				{ start_date: "2026-01-01", end_date: "2026-01-31" },
				ctx,
			);
			seen[version] = queries[0];
			expect((out.data as any).totalRefundAmount).toBe(10);
			expect((out.data as any).refundRate).toBe(1);
		}

		expect(seen["2026-01"]).toContain(" returns,");
		expect(seen["2026-01"]).not.toContain("sales_reversals");
		expect(seen["2026-07"]).toContain(" sales_reversals,");
		expect(seen["2026-07"]).not.toContain(" returns,");
	});

	it("leaves the non-renamed columns alone in both versions", async () => {
		for (const [version, column] of [
			["2026-01", "returns"],
			["2026-07", "sales_reversals"],
		]) {
			const { query } = (await run(version, column)) ?? {};
			expect(query).toContain("gross_sales");
			expect(query).toContain("net_sales");
			expect(query).toContain("discounts");
			expect(query).toContain("SINCE 2026-01-01 UNTIL 2026-01-31");
		}
	});
});
