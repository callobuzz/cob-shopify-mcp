import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import query from "./get-article.graphql";

export const getArticle = defineTool({
	name: "get_article",
	domain: "products",
	tier: 1,
	description: "Get full details of a single blog article including body content. Requires article GID.",
	scopes: ["read_content"],
	outputFields: [
		"id",
		"title",
		"handle",
		"body",
		"summary",
		"tags",
		"isPublished",
		"publishedAt",
		"createdAt",
		"updatedAt",
		"templateSuffix",
		"author",
		"blog",
		"image",
	],
	input: {
		id: z.string().describe("Article GID (e.g. gid://shopify/Article/12345)"),
	},
	graphql: query,
	response: (data: any) => {
		const raw = data.data ?? data;
		return { article: raw.article ?? null };
	},
});
