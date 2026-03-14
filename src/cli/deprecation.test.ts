import { describe, expect, it, vi } from "vitest";
import { getNewCommand, printDeprecationWarning } from "./deprecation.js";

describe("getNewCommand", () => {
	it("converts list_products to 'cob-shopify products list'", () => {
		expect(getNewCommand("list_products", "products")).toBe("cob-shopify products list");
	});

	it("converts get_order_by_name to 'cob-shopify orders get-by-name'", () => {
		expect(getNewCommand("get_order_by_name", "orders")).toBe("cob-shopify orders get-by-name");
	});

	it("converts sales_summary to 'cob-shopify analytics sales-summary'", () => {
		expect(getNewCommand("sales_summary", "analytics")).toBe("cob-shopify analytics sales-summary");
	});
});

describe("printDeprecationWarning", () => {
	it("writes deprecation message to stderr", () => {
		const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

		printDeprecationWarning("tools run list_products", "cob-shopify products list");

		expect(spy).toHaveBeenCalledWith(
			"⚠ Deprecated: 'tools run list_products' → use 'cob-shopify products list' instead\n",
		);

		spy.mockRestore();
	});
});
