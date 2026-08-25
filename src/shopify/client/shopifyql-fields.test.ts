import { describe, expect, it } from "vitest";
import {
	RETURNS_DEPRECATED_VERSION,
	readReversalValue,
	SALES_REVERSAL_RENAMES,
	SALES_REVERSALS_MIN_VERSION,
	shopifyQLField,
	usesSalesReversalNames,
} from "./shopifyql-fields.js";

describe("usesSalesReversalNames", () => {
	it("keeps legacy names on versions before the rename", () => {
		for (const v of ["2025-01", "2025-04", "2025-07", "2025-10", "2026-01"]) {
			expect(usesSalesReversalNames(v), v).toBe(false);
		}
	});

	it("uses new names from the rename version onward", () => {
		for (const v of ["2026-04", "2026-07", "2026-10", "2027-01", "2030-10"]) {
			expect(usesSalesReversalNames(v), v).toBe(true);
		}
	});

	it("switches exactly at 2026-04, the version where both spellings resolve", () => {
		expect(SALES_REVERSALS_MIN_VERSION).toBe("2026-04");
		expect(usesSalesReversalNames("2026-01")).toBe(false);
		expect(usesSalesReversalNames("2026-04")).toBe(true);
	});

	it("prefers the new names from the version that deprecated the legacy ones", () => {
		// The legacy names are still served (verified live through 2026-10), so this is about not
		// writing new queries against a deprecated column — not about avoiding a hard failure.
		expect(usesSalesReversalNames(RETURNS_DEPRECATED_VERSION)).toBe(true);
	});

	it("defaults to the new names for a non-quarterly string", () => {
		expect(usesSalesReversalNames("latest")).toBe(true);
		expect(usesSalesReversalNames("")).toBe(true);
	});
});

describe("shopifyQLField", () => {
	it("returns the legacy spelling on 2026-01", () => {
		expect(shopifyQLField("returns", "2026-01")).toBe("returns");
		expect(shopifyQLField("quantity_returned", "2026-01")).toBe("quantity_returned");
	});

	it("returns the new spelling on 2026-07", () => {
		expect(shopifyQLField("returns", "2026-07")).toBe("sales_reversals");
		expect(shopifyQLField("quantity_returned", "2026-07")).toBe("reversed_quantity");
	});

	it("accepts the new spelling as input and downgrades it for an old version", () => {
		expect(shopifyQLField("sales_reversals", "2026-01")).toBe("returns");
		expect(shopifyQLField("reversed_quantity", "2026-01")).toBe("quantity_returned");
	});

	it("accepts the new spelling as input and keeps it for a new version", () => {
		expect(shopifyQLField("sales_reversals", "2026-07")).toBe("sales_reversals");
	});

	it("passes unrelated column names through untouched on both sides of the cutover", () => {
		for (const v of ["2026-01", "2026-07"]) {
			expect(shopifyQLField("gross_sales", v)).toBe("gross_sales");
			expect(shopifyQLField("orders", v)).toBe("orders");
		}
	});

	it("round-trips every renamed field in both directions", () => {
		for (const [legacy, modern] of Object.entries(SALES_REVERSAL_RENAMES)) {
			expect(shopifyQLField(legacy, "2026-07")).toBe(modern);
			expect(shopifyQLField(modern, "2026-01")).toBe(legacy);
			expect(shopifyQLField(legacy, "2026-01")).toBe(legacy);
			expect(shopifyQLField(modern, "2026-07")).toBe(modern);
		}
	});

	it("covers every field named in the Shopify changelog", () => {
		expect(Object.keys(SALES_REVERSAL_RENAMES).sort()).toEqual(
			[
				"discounts_returned",
				"gross_returns",
				"is_return_related",
				"net_returns",
				"order_or_return",
				"quantity_returned",
				"returned_quantity_rate",
				"returns",
				"shipping_returned",
				"taxes_returned",
				"total_returns",
			].sort(),
		);
	});
});

describe("readReversalValue", () => {
	it("reads a legacy-keyed row", () => {
		expect(readReversalValue({ returns: 12 }, "returns")).toBe(12);
	});

	it("reads a new-keyed row", () => {
		expect(readReversalValue({ sales_reversals: 12 }, "returns")).toBe(12);
	});

	it("reads a new-keyed row when asked by its new name", () => {
		expect(readReversalValue({ sales_reversals: 12 }, "sales_reversals")).toBe(12);
	});

	it("prefers the new spelling when a row somehow carries both", () => {
		expect(readReversalValue({ sales_reversals: 7, returns: 3 }, "returns")).toBe(7);
	});

	it("returns null when neither spelling is present", () => {
		expect(readReversalValue({ orders: 5 }, "returns")).toBeNull();
	});

	it("falls back past a null new-spelling value", () => {
		expect(readReversalValue({ sales_reversals: null, returns: 4 }, "returns")).toBe(4);
	});

	it("reads a non-renamed column unchanged", () => {
		expect(readReversalValue({ orders: 9 }, "orders")).toBe(9);
	});
});
