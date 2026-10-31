import { configSchema } from "@core/config/schema.js";
import type { CobConfig } from "@core/config/types.js";
import { ToolEngine } from "@core/engine/tool-engine.js";
import type { ExecutionContext } from "@core/engine/types.js";
import { ToolRegistry } from "@core/registry/tool-registry.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAllTools } from "./get-all-tools.js";
import { registerTools } from "./register-tools.js";

/**
 * Lists every built-in tool through a real MCP client, the way Claude sees it.
 * The SDK turns each tool's Zod input into JSON Schema, so this catches a Zod
 * or SDK upgrade that changes what the AI is told about a tool's inputs.
 */
describe("MCP tool schemas (real SDK client)", () => {
	const config = configSchema.parse({}) as CobConfig;
	const registry = new ToolRegistry();
	for (const tool of getAllTools()) registry.register(tool);
	const server = new McpServer({ name: "cob-shopify-mcp", version: "test" });
	const client = new Client({ name: "schema-test", version: "test" });

	beforeAll(async () => {
		// No call in this file reaches a tool handler, so the context is never read.
		registerTools(server, registry, new ToolEngine(registry), config, {} as ExecutionContext);
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
	});

	afterAll(async () => {
		await client.close();
	});

	it("advertises every enabled tool with an object input schema", async () => {
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name).sort()).toEqual(
			registry
				.filter(config)
				.map((t) => t.name)
				.sort(),
		);
		for (const tool of tools) {
			expect(tool.inputSchema.type, tool.name).toBe("object");
		}
	});

	it("carries bounds, defaults and enums into the JSON Schema", async () => {
		const { tools } = await client.listTools();
		const listProducts = tools.find((t) => t.name === "list_products");
		const props = listProducts?.inputSchema.properties as Record<string, Record<string, unknown>>;
		expect(props.limit).toMatchObject({ type: "number", minimum: 1, maximum: 250, default: 10 });
		expect(props.status).toMatchObject({ type: "string", enum: ["ACTIVE", "DRAFT", "ARCHIVED"] });
		expect(listProducts?.inputSchema.required ?? []).not.toContain("limit");
	});

	it("rejects out-of-range input before the tool runs", async () => {
		const result = await client.callTool({ name: "list_products", arguments: { limit: 999 } });
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toMatch(/limit/);
	});
});
