import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import mutation from "./update-product-variant.graphql";

export const updateProductVariant = defineTool({
	name: "update_product_variant",
	domain: "products",
	tier: 1,
	description: "Update variant fields such as price and SKU.",
	scopes: ["write_products"],
	input: {
		id: z.string(),
		product_id: z.string(),
		price: z.string().optional(),
		sku: z.string().optional(),
		barcode: z.string().optional(),
	},
	handler: async (
		input: {
			id: string;
			product_id: string;
			price?: string;
			sku?: string;
			barcode?: string;
		},
		ctx: ExecutionContext,
	) => {
		const variantInput: Record<string, unknown> = {
			id: input.id,
		};
		if (input.price !== undefined) variantInput.price = input.price;
		if (input.sku !== undefined) variantInput.inventoryItem = { sku: input.sku };
		if (input.barcode !== undefined) variantInput.barcode = input.barcode;

		const result = await ctx.shopify.query(mutation, {
			productId: input.product_id,
			variants: [variantInput],
		});
		const data = result.data ?? result;
		const payload = data.productVariantsBulkUpdate;

		if (payload.userErrors?.length > 0) {
			throw new Error(`Variant update failed: ${payload.userErrors.map((e: any) => e.message).join("; ")}`);
		}

		return { variant: payload.productVariants[0] };
	},
});
