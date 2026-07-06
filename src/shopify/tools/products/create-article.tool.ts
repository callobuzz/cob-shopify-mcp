import type { ExecutionContext } from "@core/engine/types.js";
import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import mutation from "./create-article.graphql";

export const createArticle = defineTool({
	name: "create_article",
	domain: "products",
	tier: 1,
	description: "Create a new blog article. Defaults to draft (unpublished). Set is_published to true to publish immediately.",
	scopes: ["write_content", "read_content"],
	input: {
		blog_id: z.string().describe("Blog GID (e.g. gid://shopify/Blog/12345)"),
		title: z.string(),
		body: z.string().describe("Article body content (HTML supported)").optional(),
		summary: z.string().optional(),
		handle: z.string().optional(),
		tags: z.array(z.string()).optional(),
		is_published: z.boolean().describe("Publish immediately. Defaults to false (draft).").optional(),
		published_at: z.string().describe("Publish date/time in ISO 8601 format").optional(),
		author_name: z.string().optional(),
		template_suffix: z.string().optional(),
	},
	handler: async (
		input: {
			blog_id: string;
			title: string;
			body?: string;
			summary?: string;
			handle?: string;
			tags?: string[];
			is_published?: boolean;
			published_at?: string;
			author_name?: string;
			template_suffix?: string;
		},
		ctx: ExecutionContext,
	) => {
		const articleInput: Record<string, unknown> = {
			blogId: input.blog_id,
			title: input.title,
		};
		if (input.body !== undefined) articleInput.body = input.body;
		if (input.summary !== undefined) articleInput.summary = input.summary;
		if (input.handle !== undefined) articleInput.handle = input.handle;
		if (input.tags !== undefined) articleInput.tags = input.tags;
		if (input.is_published !== undefined) articleInput.isPublished = input.is_published;
		if (input.published_at !== undefined) articleInput.publishedAt = input.published_at;
		if (input.author_name !== undefined) articleInput.author = input.author_name;
		if (input.template_suffix !== undefined) articleInput.templateSuffix = input.template_suffix;

		const result = await ctx.shopify.query(mutation, { blog_id: input.blog_id, title: input.title, body: input.body, summary: input.summary, handle: input.handle, tags: input.tags, is_published: input.is_published, published_at: input.published_at, author_name: input.author_name, template_suffix: input.template_suffix });
		const data = result.data ?? result;
		const payload = data.articleCreate;

		if (payload.userErrors?.length > 0) {
			throw new Error(`Article creation failed: ${payload.userErrors.map((e: any) => e.message).join("; ")}`);
		}

		return { article: payload.article };
	},
});
