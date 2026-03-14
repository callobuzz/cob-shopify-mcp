import { deriveActionName } from "./converter/derive-action-name.js";

/**
 * Build the new CLI command equivalent from a tool name and domain.
 * e.g., "list_products" in domain "products" → "cob-shopify products list"
 */
export function getNewCommand(toolName: string, domain: string): string {
	const action = deriveActionName(toolName, domain);
	return `cob-shopify ${domain} ${action}`;
}

/**
 * Print a deprecation warning to stderr.
 */
export function printDeprecationWarning(oldCmd: string, newCmd: string): void {
	process.stderr.write(`⚠ Deprecated: '${oldCmd}' → use '${newCmd}' instead\n`);
}
