import { defineTool } from "@core/helpers/define-tool.js";
import { z } from "zod";
import query from "./list-blogs.graphql";

export const listBlogs = defineTool({
	name: "list_blogs",
	domain: "products",
	tier: 1,
	description: "List all blogs on the store. Returns blog id, title, handle, article count, and timestamps.",
	scopes: ["read_content"],
	outputFields: [
		"id",
		"title",
		"handle",
		"articlesCount",
		"createdAt",
		"updatedAt",
	],
	input: {
		limit: z.number().min(1).max(250).optional(),
	},
	graphql: query,
	response: (data: any) => {
		const raw = data.data ?? data;
		const blogs = raw.blogs;
		return {
			blogs: {
				...blogs,
				edges: blogs.edges?.map((e: any) => e.node) ?? [],
			},
		};
	},
});
