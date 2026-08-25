/**
 * Build-time script: pre-computes action names for all built-in tools.
 *
 * Scans tool source files for `name:` declarations and uses
 * deriveActionName() to compute CLI action names. Writes a JSON map
 * to src/cli/generated/action-names.json.
 *
 * This avoids importing tool files (which pull in .graphql loaders)
 * and avoids running deriveActionName() for 49+ tools at CLI startup.
 *
 * Usage: npx tsx scripts/generate-cli-commands.ts
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveActionName } from "../src/cli/converter/derive-action-name.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = resolve(__dirname, "../src/shopify/tools");
const outDir = resolve(__dirname, "../src/cli/generated");
const outFile = resolve(outDir, "action-names.json");

const map: Record<string, string> = {};

// Scan each domain directory for .tool.ts files
const domains = readdirSync(toolsDir, { withFileTypes: true })
	.filter((d) => d.isDirectory() && !d.name.startsWith("_"))
	.map((d) => d.name);

for (const domain of domains) {
	const domainDir = join(toolsDir, domain);
	const toolFiles = readdirSync(domainDir).filter((f) => f.endsWith(".tool.ts"));

	for (const file of toolFiles) {
		const content = readFileSync(join(domainDir, file), "utf-8");
		// Extract tool name from `name: "tool_name"` in the defineTool call
		const match = content.match(/name:\s*["']([^"']+)["']/);
		if (match) {
			const toolName = match[1];
			// An explicit cliAction wins over the derived name — see ToolDefinition.cliAction.
			const override = content.match(/cliAction:\s*["']([^"']+)["']/);
			map[toolName] = override ? override[1] : deriveActionName(toolName, domain);
		}
	}
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(map, null, "\t")}\n`);

console.log(`Generated ${outFile} with ${Object.keys(map).length} action name mappings`);
