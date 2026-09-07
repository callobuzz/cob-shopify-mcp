import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CostTracker } from "../observability/cost-tracker.js";
import { ToolRegistry } from "../registry/tool-registry.js";
import { ToolEngine } from "./tool-engine.js";
import type { ExecutionContext, ToolDefinition } from "./types.js";

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
	return {
		name: "test_tool",
		domain: "products",
		tier: 1,
		description: "A test tool",
		scopes: ["read_products"],
		input: {},
		graphql: "query { products { id } }",
		...overrides,
	};
}

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
	return {
		shopify: { query: vi.fn().mockResolvedValue({ products: [] }) },
		config: {
			auth: { method: "token", store_domain: "test.myshopify.com", access_token: "tok" },
			shopify: {
				api_version: "2025-01",
				max_retries: 3,
				cache: { read_ttl: 300, search_ttl: 60, analytics_ttl: 900 },
			},
			tools: { read_only: false, disable: [], enable: [], custom_paths: [] },
			transport: { type: "stdio", port: 3000, host: "localhost" },
			storage: { backend: "json", path: "./data", encrypt_tokens: false },
			observability: { log_level: "info", audit_log: false, metrics: false },
			rate_limit: { respect_shopify_cost: true, max_concurrent: 5 },
		},
		storage: {} as any,
		logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } as any,
		costTracker: new CostTracker(),
		...overrides,
	};
}

describe("api: storefront reaches the Storefront client, not the Admin one", () => {
	it("routes a storefront tool away from the Admin API entirely", async () => {
		// `Shop.brand` exists on one schema only. Sending this to Admin does not fail as a
		// transport problem -- Admin answers "field doesn't exist", which reads as a bad query.
		const registry = new ToolRegistry();
		registry.register(makeTool({ name: "brand_tool", api: "storefront" }));
		const engine = new ToolEngine(registry);

		const storefrontQuery = vi.fn().mockResolvedValue({ shop: { brand: null } });
		const ctx = makeCtx({ storefront: { query: storefrontQuery } });

		await engine.execute("brand_tool", {}, ctx);

		expect(storefrontQuery).toHaveBeenCalledOnce();
		expect(ctx.shopify.query).not.toHaveBeenCalled();
	});

	it("still sends an undeclared tool to Admin, so nothing written before this moves", async () => {
		const registry = new ToolRegistry();
		registry.register(makeTool({ name: "plain_tool" }));
		const engine = new ToolEngine(registry);

		const storefrontQuery = vi.fn();
		const ctx = makeCtx({ storefront: { query: storefrontQuery } });

		await engine.execute("plain_tool", {}, ctx);

		expect(ctx.shopify.query).toHaveBeenCalledOnce();
		expect(storefrontQuery).not.toHaveBeenCalled();
	});

	it("says the server has no Storefront client rather than failing inside a query", async () => {
		const registry = new ToolRegistry();
		registry.register(makeTool({ name: "brand_tool", api: "storefront" }));
		const engine = new ToolEngine(registry);

		await expect(engine.execute("brand_tool", {}, makeCtx())).rejects.toThrow(/no Storefront client/);
	});
});

describe("ToolEngine", () => {
	it("execute calls handler with validated input and context", async () => {
		const handler = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "handler_tool",
				input: { limit: z.number() },
				handler,
				graphql: undefined,
			}),
		);

		const engine = new ToolEngine(registry);
		const ctx = makeCtx();
		const result = await engine.execute("handler_tool", { limit: 5 }, ctx);

		expect(handler).toHaveBeenCalledWith({ limit: 5 }, ctx);
		expect(result.data).toEqual({ items: [1, 2, 3] });
	});

	it("execute calls shopify.query when tool has graphql (no handler)", async () => {
		const queryFn = vi.fn().mockResolvedValue({ products: [{ id: "1" }] });
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "gql_tool",
				input: { first: z.number() },
				graphql: "query ListProducts($first: Int!) { products(first: $first) { id } }",
			}),
		);

		const engine = new ToolEngine(registry);
		const ctx = makeCtx({ shopify: { query: queryFn } });
		const result = await engine.execute("gql_tool", { first: 10 }, ctx);

		expect(queryFn).toHaveBeenCalledWith("query ListProducts($first: Int!) { products(first: $first) { id } }", {
			first: 10,
		});
		expect(result.data).toEqual({ products: [{ id: "1" }] });
	});

	it("execute applies response mapper to graphql result", async () => {
		const queryFn = vi.fn().mockResolvedValue({
			products: { edges: [{ node: { id: "1" } }] },
		});
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "mapped_tool",
				input: {},
				graphql: "query { products { edges { node { id } } } }",
				response: (data) => data.products.edges.map((e: any) => e.node),
			}),
		);

		const engine = new ToolEngine(registry);
		const ctx = makeCtx({ shopify: { query: queryFn } });
		const result = await engine.execute("mapped_tool", {}, ctx);

		expect(result.data).toEqual([{ id: "1" }]);
	});

	it("execute returns ToolResult with data", async () => {
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "simple_tool",
				input: {},
				handler: async () => ({ count: 42 }),
				graphql: undefined,
			}),
		);

		const engine = new ToolEngine(registry);
		const result = await engine.execute("simple_tool", {}, makeCtx());

		expect(result).toHaveProperty("data");
		expect(result.data).toEqual({ count: 42 });
	});

	it("execute validates input — rejects missing required field", async () => {
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "required_tool",
				input: { id: z.string() },
				graphql: "query { test }",
			}),
		);

		const engine = new ToolEngine(registry);
		const result = await engine.execute("required_tool", {}, makeCtx());

		expect((result.data as any).error).toBe(true);
		expect((result.data as any).message).toContain("Validation failed");
	});

	it("execute validates input — rejects wrong type", async () => {
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "typed_tool",
				input: { count: z.number() },
				graphql: "query { test }",
			}),
		);

		const engine = new ToolEngine(registry);
		const result = await engine.execute("typed_tool", { count: "not-a-number" }, makeCtx());

		expect((result.data as any).error).toBe(true);
		expect((result.data as any).message).toContain("Validation failed");
	});

	it("execute returns friendly error message on validation failure", async () => {
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "friendly_tool",
				input: {
					name: z.string(),
					age: z.number().min(0),
				},
				graphql: "query { test }",
			}),
		);

		const engine = new ToolEngine(registry);
		const result = await engine.execute("friendly_tool", { age: -1 }, makeCtx());

		expect((result.data as any).error).toBe(true);
		expect((result.data as any).message).toContain('tool "friendly_tool"');
	});

	it("execute throws when tool not found in registry", async () => {
		const registry = new ToolRegistry();
		const engine = new ToolEngine(registry);

		await expect(engine.execute("nonexistent_tool", {}, makeCtx())).rejects.toThrow('"nonexistent_tool" not found');
	});

	it("execute calls handler (not graphql) when both are defined", async () => {
		const handler = vi.fn().mockResolvedValue({ from: "handler" });
		const queryFn = vi.fn().mockResolvedValue({ from: "graphql" });
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "both_tool",
				input: {},
				graphql: "query { test }",
				handler,
			}),
		);

		const engine = new ToolEngine(registry);
		const ctx = makeCtx({ shopify: { query: queryFn } });
		const result = await engine.execute("both_tool", {}, ctx);

		expect(handler).toHaveBeenCalled();
		expect(queryFn).not.toHaveBeenCalled();
		expect(result.data).toEqual({ from: "handler" });
	});

	it("execute wraps handler errors with tool context", async () => {
		const registry = new ToolRegistry();
		registry.register(
			makeTool({
				name: "error_tool",
				input: {},
				handler: async () => {
					throw new Error("Shopify rate limited");
				},
				graphql: undefined,
			}),
		);

		const engine = new ToolEngine(registry);

		await expect(engine.execute("error_tool", {}, makeCtx())).rejects.toThrow(
			'"error_tool" execution failed: Shopify rate limited',
		);
	});
});
