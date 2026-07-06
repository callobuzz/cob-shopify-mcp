import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import mutation from "./update-article.graphql";

export const updateArticle = defineTool({
	name: "update_article",
	domain: "products",
	tier: 1,
	description: "Update an existing blog article. Only provided fields are updated.",
	scopes: ["write_content", "read_content"],
	input: {
		id: z.string().describe("Article GID (e.g. gid://shopify/Article/12345)"),
		title: z.string().optional(),
		body: z.string().describe("Article body content (HTML supported)").optional(),
		summary: z.string().optional(),
		tags: z.array(z.string()).optional(),
		is_published: z.boolean().describe("Publish/unpublish the article").optional(),
		published_at: z.string().describe("Publish date/time in ISO 8601 format").optional(),
		author_name: z.string().optional(),
	},
	handler: async (
		input: {
			id: string;
			title?: string;
			body?: string;
			summary?: string;
			tags?: string[];
			is_published?: boolean;
			published_at?: string;
			author_name?: string;
		},
		ctx: ExecutionContext,
	) => {
		const result = await ctx.shopify.query(mutation, {
			id: input.id,
			title: input.title,
			body: input.body,
			summary: input.summary,
			tags: input.tags,
			is_published: input.is_published,
			published_at: input.published_at,
			author_name: input.author_name,
		});
		const data = result.data ?? result;
		const payload = data.articleUpdate;

		if (payload.userErrors?.length > 0) {
			throw new Error(`Article update failed: ${payload.userErrors.map((e: any) => e.message).join("; ")}`);
		}

		return { article: payload.article };
	},
});
