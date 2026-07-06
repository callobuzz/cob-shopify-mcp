import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import query from "./list-articles.graphql";

export const listArticles = defineTool({
	name: "list_articles",
	domain: "products",
	tier: 1,
	description: "List articles across blogs. Filter by query string or publication status. Returns article summaries with title, handle, author, publishedAt, and tags.",
	scopes: ["read_content"],
	outputFields: [
		"id",
		"title",
		"handle",
		"author",
		"publishedAt",
		"tags",
		"summary",
		"isPublished",
		"blog",
	],
	input: {
		query: z.string().optional(),
		limit: z.number().min(1).max(250).optional(),
	},
	graphql: query,
	response: (data: any) => {
		const raw = data.data ?? data;
		const articles = raw.articles;
		return {
			articles: {
				...articles,
				edges: articles.edges?.map((e: any) => e.node) ?? [],
			},
		};
	},
});
