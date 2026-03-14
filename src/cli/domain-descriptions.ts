/**
 * Hardcoded descriptions for built-in Shopify tool domains.
 *
 * Custom domains (tier 3) not listed here get an auto-generated description.
 */
export const domainDescriptions: Record<string, string> = {
	products: "Manage products, variants, collections",
	orders: "Manage orders, fulfillments, refunds",
	customers: "Manage customers and segments",
	inventory: "Track and adjust inventory",
	analytics: "Sales reports and store analytics",
};

/**
 * Returns the description for a domain, falling back to a generic one for custom domains.
 */
export function getDomainDescription(domain: string): string {
	return domainDescriptions[domain] ?? `Tools for ${domain}`;
}
