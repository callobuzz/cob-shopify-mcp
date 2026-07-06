import { describe, expect, it } from "vitest";
import { listArticles } from "./list-articles.tool.js";

describe("list_articles", () => {
	it("has correct tool definition", () => {
		expect(listArticles.name).toBe("list_articles");
		expect(listArticles.domain).toBe("products");
		expect(listArticles.tier).toBe(1);
		expect(listArticles.scopes).toEqual(["read_content"]);
		expect(listArticles.graphql).toBeTruthy();
	});

	it("response mapper flattens edges", () => {
		const data = {
			articles: {
				edges: [
					{ node: { id: "gid://shopify/Article/1", title: "First", handle: "first", isPublished: true } },
					{ node: { id: "gid://shopify/Article/2", title: "Second", handle: "second", isPublished: false } },
				],
				pageInfo: { hasNextPage: false },
			},
		};

		const result = listArticles.response?.(data);
		expect(result.articles.edges).toHaveLength(2);
		expect(result.articles.edges[0].title).toBe("First");
	});

	it("response mapper handles empty articles", () => {
		const result = listArticles.response?.({ articles: { edges: [], pageInfo: { hasNextPage: false } } });
		expect(result.articles.edges).toEqual([]);
	});
});
