import { z } from "zod";
import type { ToolRegistry } from "../registry/tool-registry.js";
import type { ExecutionContext, ToolResult } from "./types.js";

export class ToolEngine {
	constructor(private registry: ToolRegistry) {}

	async execute(toolName: string, input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
		const tool = this.registry.get(toolName);
		if (!tool) {
			throw new Error(`Tool "${toolName}" not found in registry`);
		}

		// Build Zod object schema from tool's input record
		const schema = z.object(tool.input);

		// Validate input
		const parseResult = schema.safeParse(input);
		if (!parseResult.success) {
			const issues = parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
			return {
				data: {
					error: true,
					message: `Validation failed for tool "${toolName}": ${issues}`,
				},
			};
		}

		const validatedInput = parseResult.data;

		try {
			let data: unknown;

			if (tool.handler) {
				data = await tool.handler(validatedInput, ctx);
			} else if (tool.graphql) {
				if (tool.api === "storefront") {
					// Named, not silently skipped. A tool that reaches the wrong API fails with
					// "field doesn't exist", which sends the author to rewrite a query that was
					// never the problem.
					if (!ctx.storefront) {
						throw new Error(
							`Tool "${toolName}" is declared api: storefront, but this server has no Storefront client. ` +
								`That happens when the store domain or API version is missing from the config.`,
						);
					}
					data = await ctx.storefront.query(tool.graphql, validatedInput);
				} else {
					data = await ctx.shopify.query(tool.graphql, validatedInput);
				}
				if (tool.response) {
					data = tool.response(data);
				}
			}

			return { data };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Tool "${toolName}" execution failed: ${message}`);
		}
	}
}
