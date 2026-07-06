import { describe, expect, it } from "vitest";
import { createArticle } from "./create-article.tool.js";

describe("create_article", () => {
	it("has correct tool definition", () => {
		expect(createArticle.name).toBe("create_article");
		expect(createArticle.domain).toBe("products");
		expect(createArticle.tier).toBe(1);
		expect(createArticle.scopes).toContain("write_content");
	});

	it("handler returns created article", async () => {
		const mockCtx = {
			shopify: {
				query: async () => ({
					articleCreate: {
						article: {
							id: "gid://shopify/Article/999",
							title: "New Post",
							handle: "new-post",
							isPublished: false,
						},
						userErrors: [],
					},
				}),
			},
		};

		const result = await createArticle.handler?.(
			{ blog_id: "gid://shopify/Blog/1", title: "New Post" },
			mockCtx as any,
		);
		expect(result.article.title).toBe("New Post");
	});

	it("handler throws on userErrors", async () => {
		const mockCtx = {
			shopify: {
				query: async () => ({
					articleCreate: {
						article: { id: "gid://shopify/Article/999", title: "New Post", handle: "new-post", isPublished: false },
						userErrors: [{ field: "title", message: "Title is required" }],
					},
				}),
			},
		};

		await expect(
			createArticle.handler?.({ blog_id: "gid://shopify/Blog/1", title: "New Post" }, mockCtx as any),
		).rejects.toThrow("Article creation failed");
	});
});
