import { describe, expect, it } from "vitest";
import { listBlogs } from "./list-blogs.tool.js";

describe("list_blogs", () => {
	it("has correct tool definition", () => {
		expect(listBlogs.name).toBe("list_blogs");
		expect(listBlogs.domain).toBe("products");
		expect(listBlogs.tier).toBe(1);
		expect(listBlogs.scopes).toEqual(["read_content"]);
		expect(listBlogs.graphql).toBeTruthy();
	});

	it("response mapper flattens edges", () => {
		const data = {
			blogs: {
				edges: [
					{ node: { id: "gid://shopify/Blog/1", title: "News", handle: "news" } },
					{ node: { id: "gid://shopify/Blog/2", title: "Journal", handle: "journal" } },
				],
				pageInfo: { hasNextPage: false },
			},
		};

		const result = listBlogs.response?.(data);
		expect(result.blogs.edges).toHaveLength(2);
		expect(result.blogs.edges[0].title).toBe("News");
		expect(result.blogs.pageInfo.hasNextPage).toBe(false);
	});

	it("response mapper handles empty blogs", () => {
		const result = listBlogs.response?.({ blogs: { edges: [], pageInfo: { hasNextPage: false } } });
		expect(result.blogs.edges).toEqual([]);
	});
});
