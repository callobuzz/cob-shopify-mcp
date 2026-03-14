import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CobConfig } from "../config/types.js";
import type { ToolRegistry } from "../registry/tool-registry.js";
import type { ToolEngine } from "./tool-engine.js";
import type { ExecutionContext, ToolDefinition } from "./types.js";

/**
 * Build the activate_tools description from the registry.
 * Groups enabled tools by domain, generates one line per domain.
 */
export function buildAdvertisementDescription(registry: ToolRegistry, config: CobConfig): string {
	const enabledTools = registry.filter(config);
	const domainMap = new Map<string, ToolDefinition[]>();

	for (const tool of enabledTools) {
		const list = domainMap.get(tool.domain) ?? [];
		list.push(tool);
		domainMap.set(tool.domain, list);
	}

	const lines: string[] = [
		"Activate tool domains to use them. Call this before using any Shopify tools.",
		"",
		"Available domains:",
	];

	for (const [domain, tools] of domainMap) {
		const count = tools.length;
		const noun = count === 1 ? "tool" : "tools";
		const names = tools.map((t) => t.name).join(", ");
		lines.push(`- ${domain} (${count} ${noun}): ${names}`);
	}

	lines.push("");
	lines.push('Pass one domain: activate_tools("analytics")');
	lines.push('Or multiple: activate_tools(["analytics", "inventory"])');

	return lines.join("\n");
}

/**
 * Create the activate_tools handler function.
 * Returns a handler that dynamically registers domain tools on demand.
 */
export function createActivateHandler(
	server: McpServer,
	registry: ToolRegistry,
	config: CobConfig,
	engine: ToolEngine,
	ctx: ExecutionContext,
) {
	const activatedDomains = new Set<string>();

	// Pre-compute enabled tools grouped by domain
	const enabledTools = registry.filter(config);
	const domainMap = new Map<string, ToolDefinition[]>();
	for (const tool of enabledTools) {
		const list = domainMap.get(tool.domain) ?? [];
		list.push(tool);
		domainMap.set(tool.domain, list);
	}

	return async (input: { domains: string | string[] }) => {
		const domains = typeof input.domains === "string" ? [input.domains] : input.domains;

		const activated: string[] = [];
		const already_active: string[] = [];
		const tools: string[] = [];
		const errors: string[] = [];

		for (const domain of domains) {
			if (!domainMap.has(domain)) {
				const available = [...domainMap.keys()].join(", ");
				errors.push(`Unknown domain '${domain}'. Available: ${available}`);
				continue;
			}

			const domainTools = domainMap.get(domain) ?? [];

			if (activatedDomains.has(domain)) {
				already_active.push(domain);
				tools.push(...domainTools.map((t) => t.name));
				continue;
			}

			// Register each tool with the MCP server
			for (const tool of domainTools) {
				server.tool(tool.name, tool.description, tool.input, async (toolInput, _extra) => {
					const result = await engine.execute(tool.name, toolInput, ctx);
					return {
						content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
						isError: false,
						_meta: { _cost: result._cost, _session: result._session },
					};
				});
			}

			activatedDomains.add(domain);
			activated.push(domain);
			tools.push(...domainTools.map((t) => `${t.name} — ${t.description}`));
		}

		// Build response
		const response: Record<string, unknown> = {};
		if (activated.length > 0) response.activated = activated;
		if (already_active.length > 0) response.already_active = already_active;
		if (tools.length > 0) response.tools = tools;
		if (errors.length > 0) response.error = errors.join("; ");

		return response;
	};
}

/**
 * Register the advertiser meta-tool instead of individual tools.
 * Called when config.tools.advertise_and_activate is true.
 */
export function registerAdvertiser(
	server: McpServer,
	registry: ToolRegistry,
	engine: ToolEngine,
	config: CobConfig,
	ctx: ExecutionContext,
): void {
	const description = buildAdvertisementDescription(registry, config);
	const handler = createActivateHandler(server, registry, config, engine, ctx);

	server.tool(
		"activate_tools",
		description,
		{
			domains: z
				.union([z.string(), z.array(z.string())])
				.describe("Domain name(s) to activate. Available domains listed in tool description."),
		},
		async (input, _extra) => {
			const result = await handler(input as { domains: string | string[] });
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
				isError: !!result.error && !result.activated,
			};
		},
	);
}
