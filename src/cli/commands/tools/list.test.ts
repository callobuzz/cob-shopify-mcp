import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadConfig = vi.fn().mockResolvedValue({
	auth: { method: "token", store_domain: "", access_token: undefined },
	shopify: {
		api_version: "2026-01",
		max_retries: 3,
		cache: { read_ttl: 30, search_ttl: 10, analytics_ttl: 300 },
	},
	tools: { read_only: false, disable: [], enable: [], custom_paths: [] },
	transport: { type: "stdio", port: 3000, host: "0.0.0.0" },
	storage: { backend: "json", path: "/tmp/test", encrypt_tokens: false },
	observability: { log_level: "info", audit_log: true, metrics: false },
	rate_limit: { respect_shopify_cost: true, max_concurrent: 10 },
});

vi.mock("../../../core/config/loader.js", () => ({
	loadConfig: mockLoadConfig,
	_resetConfig: vi.fn(),
}));

const mockGetAllTools = vi.fn().mockReturnValue([
	{
		name: "list-products",
		domain: "products",
		tier: 1,
		description: "List products",
		scopes: ["read_products"],
		input: {},
	},
	{
		name: "get-order",
		domain: "orders",
		tier: 1,
		description: "Get an order",
		scopes: ["read_orders"],
		input: {},
	},
	{
		name: "create-product",
		domain: "products",
		tier: 2,
		description: "Create a product",
		scopes: ["write_products"],
		input: {},
	},
]);

vi.mock("../../../server/get-all-tools.js", () => ({
	getAllTools: mockGetAllTools,
}));

describe("tools list command", () => {
	let stderrOutput: string;
	const originalWrite = process.stderr.write;

	beforeEach(() => {
		vi.clearAllMocks();
		stderrOutput = "";
		process.stderr.write = ((chunk: string) => {
			stderrOutput += chunk;
			return true;
		}) as any;
	});

	afterEach(() => {
		process.stderr.write = originalWrite;
	});

	it("lists all tools in a table", async () => {
		const { default: listCmd } = await import("./list.js");

		await listCmd.run?.({
			args: { domain: undefined, tier: undefined },
			rawArgs: [],
			cmd: listCmd,
		} as any);

		expect(stderrOutput).toContain("list-products");
		expect(stderrOutput).toContain("get-order");
		expect(stderrOutput).toContain("create-product");
		expect(stderrOutput).toContain("Name");
		expect(stderrOutput).toContain("Domain");
	});

	it("filters by --domain", async () => {
		const { default: listCmd } = await import("./list.js");

		await listCmd.run?.({
			args: { domain: "products", tier: undefined },
			rawArgs: [],
			cmd: listCmd,
		} as any);

		expect(stderrOutput).toContain("list-products");
		expect(stderrOutput).toContain("create-product");
		expect(stderrOutput).not.toContain("get-order");
	});

	it("filters by --tier", async () => {
		const { default: listCmd } = await import("./list.js");

		await listCmd.run?.({
			args: { domain: undefined, tier: "2" },
			rawArgs: [],
			cmd: listCmd,
		} as any);

		expect(stderrOutput).toContain("create-product");
		expect(stderrOutput).not.toContain("list-products");
		expect(stderrOutput).not.toContain("get-order");
	});

	it("shows enabled/disabled status", async () => {
		const { default: listCmd } = await import("./list.js");

		await listCmd.run?.({
			args: { domain: undefined, tier: undefined },
			rawArgs: [],
			cmd: listCmd,
		} as any);

		// Tier 1 tools should be enabled, tier 2 should be disabled by default
		expect(stderrOutput).toContain("enabled");
		expect(stderrOutput).toContain("disabled");
	});
});
