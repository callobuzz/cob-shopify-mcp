import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import mutation from "./delete-article.graphql";

export const deleteArticle = defineTool({
	name: "delete_article",
	domain: "products",
	tier: 1,
	description: "Delete a blog article. This action is irreversible.",
	scopes: ["write_content"],
	input: {
		id: z.string().describe("Article GID to delete (e.g. gid://shopify/Article/12345)"),
	},
	handler: async (
		input: { id: string },
		ctx: ExecutionContext,
	) => {
		const result = await ctx.shopify.query(mutation, { id: input.id });
		const data = result.data ?? result;
		const payload = data.articleDelete;

		if (payload.userErrors?.length > 0) {
			throw new Error(`Article deletion failed: ${payload.userErrors.map((e: any) => e.message).join("; ")}`);
		}

		return { article: payload.article };
	},
});
