import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ToolDefinition } from "../core/engine/types.js";
import { buildDomainCommands } from "./domain-commands.js";
import { domainDescriptions, getDomainDescription } from "./domain-descriptions.js";

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
	return {
		name: "list_products",
		domain: "products",
		tier: 1,
		description: "List products from the store",
		scopes: ["read_products"],
		input: {
			limit: z.number().describe("Max items to return").default(10),
		},
		handler: async (input) => ({ products: [], count: 0, limit: input.limit }),
		...overrides,
	};
}

describe("domainDescriptions", () => {
	it("has descriptions for all built-in domains", () => {
		expect(domainDescriptions.products).toBeDefined();
		expect(domainDescriptions.orders).toBeDefined();
		expect(domainDescriptions.customers).toBeDefined();
		expect(domainDescriptions.inventory).toBeDefined();
		expect(domainDescriptions.analytics).toBeDefined();
	});
});

describe("getDomainDescription", () => {
	it("returns hardcoded description for known domains", () => {
		expect(getDomainDescription("products")).toBe("Manage products, variants, collections");
	});

	it("returns auto-generated description for unknown domains", () => {
		expect(getDomainDescription("shipping")).toBe("Tools for shipping");
	});
});

describe("buildDomainCommands", () => {
	it("groups tools by domain into parent commands", () => {
		const tools = [
			makeTool({ name: "list_products", domain: "products" }),
			makeTool({ name: "get_product", domain: "products" }),
			makeTool({ name: "list_orders", domain: "orders" }),
		];

		const commands = buildDomainCommands(tools);

		expect(Object.keys(commands)).toHaveLength(2);
		expect(commands.products).toBeDefined();
		expect(commands.orders).toBeDefined();
	});

	it("creates correct subcommands per domain", () => {
		const tools = [
			makeTool({ name: "list_products", domain: "products" }),
			makeTool({ name: "get_product", domain: "products" }),
		];

		const commands = buildDomainCommands(tools);
		const subCmds = commands.products.subCommands as Record<string, unknown>;

		expect(subCmds).toBeDefined();
		expect(Object.keys(subCmds)).toContain("list");
		expect(Object.keys(subCmds)).toContain("get");
	});

	it("applies domain description from domainDescriptions", () => {
		const tools = [makeTool({ name: "list_products", domain: "products" })];

		const commands = buildDomainCommands(tools);

		expect(commands.products.meta?.description).toBe("Manage products, variants, collections");
	});

	it("auto-generates description for custom domains", () => {
		const tools = [makeTool({ name: "list_shipping_zones", domain: "shipping", tier: 3 })];

		const commands = buildDomainCommands(tools);

		expect(commands.shipping.meta?.description).toBe("Tools for shipping");
	});

	it("sets domain name as meta.name", () => {
		const tools = [makeTool({ name: "list_orders", domain: "orders" })];

		const commands = buildDomainCommands(tools);

		expect(commands.orders.meta?.name).toBe("orders");
	});

	it("derives action names correctly from tool names", () => {
		const tools = [
			makeTool({ name: "create_product", domain: "products" }),
			makeTool({ name: "update_product_variant", domain: "products" }),
		];

		const commands = buildDomainCommands(tools);
		const subCmds = commands.products.subCommands as Record<string, unknown>;

		expect(Object.keys(subCmds)).toContain("create");
		expect(Object.keys(subCmds)).toContain("update-variant");
	});

	it("returns empty record for empty tools array", () => {
		const commands = buildDomainCommands([]);
		expect(Object.keys(commands)).toHaveLength(0);
	});

	it("handles tools with multiple domains correctly", () => {
		const tools = [
			makeTool({ name: "list_products", domain: "products" }),
			makeTool({ name: "list_orders", domain: "orders" }),
			makeTool({ name: "list_customers", domain: "customers" }),
			makeTool({ name: "adjust_inventory", domain: "inventory" }),
		];

		const commands = buildDomainCommands(tools);

		expect(Object.keys(commands).sort()).toEqual(["customers", "inventory", "orders", "products"]);
	});
});
