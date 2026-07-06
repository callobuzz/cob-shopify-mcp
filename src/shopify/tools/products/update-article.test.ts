import { describe, expect, it } from "vitest";
import { updateArticle } from "./update-article.tool.js";

describe("update_article", () => {
	it("has correct tool definition", () => {
		expect(updateArticle.name).toBe("update_article");
		expect(updateArticle.domain).toBe("products");
		expect(updateArticle.tier).toBe(1);
		expect(updateArticle.scopes).toContain("write_content");
	});

	it("handler returns updated article", async () => {
		const mockCtx = {
			shopify: {
				query: async () => ({
					articleUpdate: {
						article: {
							id: "gid://shopify/Article/1",
							title: "Updated Title",
							handle: "updated-title",
							isPublished: true,
						},
						userErrors: [],
					},
				}),
			},
		};

		const result = await updateArticle.handler?.(
			{ id: "gid://shopify/Article/1", title: "Updated Title" },
			mockCtx as any,
		);
		expect(result.article.title).toBe("Updated Title");
	});

	it("handler throws on userErrors", async () => {
		const mockCtx = {
			shopify: {
				query: async () => ({
					articleUpdate: {
						article: { id: "gid://shopify/Article/1", title: "Updated", handle: "updated", isPublished: true },
						userErrors: [{ field: "title", message: "Duplicate title" }],
					},
				}),
			},
		};

		await expect(
			updateArticle.handler?.({ id: "gid://shopify/Article/1", title: "Updated" }, mockCtx as any),
		).rejects.toThrow("Article update failed");
	});
});
