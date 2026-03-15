import { describe, expect, it, vi } from "vitest";
import { updateProductVariant } from "./update-product-variant.tool.js";

const mockCtx = {
	shopify: { query: vi.fn() },
	config: {},
	storage: {},
	logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	costTracker: { recordCall: vi.fn() },
} as any;

describe("update_product_variant", () => {
	it("has correct tool definition", () => {
		expect(updateProductVariant.name).toBe("update_product_variant");
		expect(updateProductVariant.domain).toBe("products");
		expect(updateProductVariant.tier).toBe(1);
		expect(updateProductVariant.scopes).toEqual(["write_products"]);
	});

	it("updates variant with price and sku", async () => {
		mockCtx.shopify.query.mockResolvedValue({
			data: {
				productVariantsBulkUpdate: {
					productVariants: [
						{
							id: "gid://shopify/ProductVariant/1",
							title: "Small",
							price: "34.99",
							sku: "H-SM-V2",
						},
					],
					userErrors: [],
				},
			},
		});

		const result = await updateProductVariant.handler?.(
			{
				id: "gid://shopify/ProductVariant/1",
				product_id: "gid://shopify/Product/1",
				price: "34.99",
				sku: "H-SM-V2",
			},
			mockCtx,
		);

		expect(mockCtx.shopify.query).toHaveBeenCalledWith(expect.any(String), {
			productId: "gid://shopify/Product/1",
			variants: [
				{
					id: "gid://shopify/ProductVariant/1",
					price: "34.99",
					inventoryItem: { sku: "H-SM-V2" },
				},
			],
		});
		expect(result.variant.price).toBe("34.99");
	});

	it("throws on userErrors", async () => {
		mockCtx.shopify.query.mockResolvedValue({
			data: {
				productVariantsBulkUpdate: {
					productVariants: [],
					userErrors: [{ field: ["id"], message: "Variant not found" }],
				},
			},
		});

		await expect(
			updateProductVariant.handler?.(
				{ id: "gid://shopify/ProductVariant/999", product_id: "gid://shopify/Product/1" },
				mockCtx,
			),
		).rejects.toThrow("Variant update failed");
	});
});
