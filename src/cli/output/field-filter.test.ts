import { describe, expect, it } from "vitest";
import { filterFields } from "./field-filter.js";

describe("filterFields", () => {
	it("extracts specified keys from a plain object", () => {
		const data = { id: "1", title: "Shirt", price: "29.99", vendor: "Acme" };
		const result = filterFields(data, ["id", "title"]);
		expect(result).toEqual({ id: "1", title: "Shirt" });
	});

	it("ignores keys that do not exist", () => {
		const data = { id: "1", title: "Shirt" };
		const result = filterFields(data, ["id", "missing"]);
		expect(result).toEqual({ id: "1" });
	});

	it("filters fields on each element of an array", () => {
		const data = [
			{ id: "1", title: "Shirt", price: "29.99" },
			{ id: "2", title: "Pants", price: "49.99" },
		];
		const result = filterFields(data, ["id", "title"]);
		expect(result).toEqual([
			{ id: "1", title: "Shirt" },
			{ id: "2", title: "Pants" },
		]);
	});

	it("detects nested array in object and filters its elements", () => {
		const data = {
			products: [
				{ id: "1", title: "Shirt", price: "29.99" },
				{ id: "2", title: "Pants", price: "49.99" },
			],
			pageInfo: { hasNextPage: true },
		};
		const result = filterFields(data, ["id", "title"]);
		expect(result).toEqual([
			{ id: "1", title: "Shirt" },
			{ id: "2", title: "Pants" },
		]);
	});

	it("returns empty object when no fields match", () => {
		const data = { id: "1", title: "Shirt" };
		const result = filterFields(data, ["nope"]);
		expect(result).toEqual({});
	});

	it("returns null/undefined as-is", () => {
		expect(filterFields(null, ["id"])).toBeNull();
		expect(filterFields(undefined, ["id"])).toBeUndefined();
	});

	it("returns primitives as-is", () => {
		expect(filterFields("hello", ["id"])).toBe("hello");
		expect(filterFields(42, ["id"])).toBe(42);
	});

	it("returns empty array when filtering empty array", () => {
		expect(filterFields([], ["id"])).toEqual([]);
	});

	it("unwraps single-key wrapper object and filters inner fields", () => {
		const data = {
			product: {
				id: "gid://shopify/Product/123",
				title: "Widget",
				handle: "widget",
				status: "ACTIVE",
				vendor: "Acme",
			},
		};
		const result = filterFields(data, ["id", "title", "status"]);
		expect(result).toEqual({
			id: "gid://shopify/Product/123",
			title: "Widget",
			status: "ACTIVE",
		});
	});

	it("does not unwrap single-key object when fields match outer level", () => {
		const data = { product: { id: "1", title: "Widget" } };
		const result = filterFields(data, ["product"]);
		expect(result).toEqual({ product: { id: "1", title: "Widget" } });
	});

	it("unwraps single-key wrapper for order responses", () => {
		const data = {
			order: {
				id: "gid://shopify/Order/456",
				name: "#1001",
				displayFinancialStatus: "PAID",
				displayFulfillmentStatus: "UNFULFILLED",
			},
		};
		const result = filterFields(data, ["id", "name"]);
		expect(result).toEqual({
			id: "gid://shopify/Order/456",
			name: "#1001",
		});
	});
});
