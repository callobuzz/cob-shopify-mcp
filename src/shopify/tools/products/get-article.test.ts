import { describe, expect, it } from "vitest";
import { getArticle } from "./get-article.tool.js";

describe("get_article", () => {
	it("has correct tool definition", () => {
		expect(getArticle.name).toBe("get_article");
		expect(getArticle.domain).toBe("products");
		expect(getArticle.tier).toBe(1);
		expect(getArticle.scopes).toEqual(["read_content"]);
		expect(getArticle.graphql).toBeTruthy();
	});

	it("response mapper returns article data", () => {
		const data = {
			article: {
				id: "gid://shopify/Article/1",
				title: "Test Article",
				handle: "test-article",
				body: "<p>Hello</p>",
				isPublished: true,
				tags: ["news", "featured"],
			},
		};

		const result = getArticle.response?.(data);
		expect(result.article.title).toBe("Test Article");
		expect(result.article.handle).toBe("test-article");
	});

	it("response mapper handles missing article", () => {
		const result = getArticle.response?.({ article: null });
		expect(result.article).toBeNull();
	});
});
