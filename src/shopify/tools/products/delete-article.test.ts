import { describe, expect, it } from "vitest";
import { deleteArticle } from "./delete-article.tool.js";

describe("delete_article", () => {
	it("has correct tool definition", () => {
		expect(deleteArticle.name).toBe("delete_article");
		expect(deleteArticle.domain).toBe("products");
		expect(deleteArticle.tier).toBe(1);
		expect(deleteArticle.scopes).toContain("write_content");
	});

	it("handler returns deleted article info", async () => {
		const mockCtx = {
			shopify: {
				query: async () => ({
					articleDelete: {
						article: {
							id: "gid://shopify/Article/1",
							title: "Deleted",
							handle: "deleted",
						},
						userErrors: [],
					},
				}),
			},
		};

		const result = await deleteArticle.handler?.(
			{ id: "gid://shopify/Article/1" },
			mockCtx as any,
		);
		expect(result.article.title).toBe("Deleted");
	});

	it("handler throws on userErrors", async () => {
		const mockCtx = {
			shopify: {
				query: async () => ({
					articleDelete: {
						article: { id: "gid://shopify/Article/1", title: "Deleted", handle: "deleted" },
						userErrors: [{ field: "id", message: "Article not found" }],
					},
				}),
			},
		};

		await expect(
			deleteArticle.handler?.({ id: "gid://shopify/Article/1" }, mockCtx as any),
		).rejects.toThrow("Article deletion failed");
	});
});
