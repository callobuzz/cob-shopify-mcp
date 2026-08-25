/**
 * ShopifyQL field names that Shopify renamed in the "sales reversals" migration.
 *
 * Shopify deprecated the `returns`-family column names in Admin API **2026-04** and introduced the
 * `sales_reversals` replacements in the same version.
 *
 * Verified against the live Admin API on 2026-08-14:
 *
 * ```
 *              2026-01   2026-04   2026-07   2026-10
 *  returns        ok        ok        ok        ok     (deprecated, still served)
 *  sales_reversals  Column Not Found  ok        ok        ok
 * ```
 *
 * So the asymmetry that matters is at the *old* end, not the new one: `sales_reversals` does not
 * exist before 2026-04, while `returns` is still served well past its deprecation. Picking the
 * spelling from the configured `api_version` is what lets a store pinned to 2026-01 and a store on
 * 2026-07+ both work, with no extra request and no error-and-retry — and it keeps working on the
 * day Shopify does finally drop the legacy names.
 *
 * The rename was terminology-only — `sales_reversals` covers the same order adjustments (refunds,
 * returns, order edits, cancellations) that `returns` did. Values are unchanged.
 *
 * Source: https://shopify.dev/changelog/shopifyql-returns-fields-deprecated-and-replaced-with-sales-reversals-fields
 */

/** First Admin API version that serves the `sales_reversals` column names. */
export const SALES_REVERSALS_MIN_VERSION = "2026-04";

/**
 * Version from which the legacy `returns` names are deprecated.
 *
 * Not "removed": as of 2026-08-14 they are still served on every version through 2026-10. Shopify
 * has not announced a removal version, so nothing here should assume one.
 */
export const RETURNS_DEPRECATED_VERSION = "2026-04";

/** Legacy ShopifyQL column name -> its 2026-04+ replacement. */
export const SALES_REVERSAL_RENAMES: Readonly<Record<string, string>> = Object.freeze({
	returns: "sales_reversals",
	net_returns: "net_sales_reversals",
	gross_returns: "gross_sales_reversals",
	total_returns: "total_sales_reversals",
	discounts_returned: "discount_reversals",
	shipping_returned: "shipping_reversals",
	taxes_returned: "tax_reversals",
	quantity_returned: "reversed_quantity",
	returned_quantity_rate: "reversed_quantity_rate",
	is_return_related: "is_reversal",
	order_or_return: "order_or_sales_reversal",
});

const QUARTERLY_VERSION = /^\d{4}-(?:01|04|07|10)$/;

/**
 * Whether this API version serves the renamed `sales_reversals` columns.
 *
 * Version strings are `YYYY-MM` with a zero-padded month, so a lexicographic compare is also a
 * chronological one. A version that is not well-formed defaults to the new names: `api_version`
 * is validated before it reaches here (see `core/config/api-versions.ts`), and every version
 * released from 2026-04 onward carries them.
 */
export function usesSalesReversalNames(apiVersion: string): boolean {
	if (!QUARTERLY_VERSION.test(apiVersion)) return true;
	return apiVersion >= SALES_REVERSALS_MIN_VERSION;
}

/**
 * Resolve a ShopifyQL column name for the given API version.
 *
 * Accepts either spelling and returns whichever one that version actually serves, so callers can
 * write the name they think in and stay correct across the cutover. Unknown names pass through.
 */
export function shopifyQLField(field: string, apiVersion: string): string {
	const modern = SALES_REVERSAL_RENAMES[field] ?? field;
	if (usesSalesReversalNames(apiVersion)) return modern;

	const legacy = Object.keys(SALES_REVERSAL_RENAMES).find((k) => SALES_REVERSAL_RENAMES[k] === modern);
	return legacy ?? field;
}

/**
 * Read a value from a ShopifyQL result row under either spelling.
 *
 * The query already asks for the correct name for the configured version; this exists so a row
 * is still parsed correctly if the two ever disagree — a stale version table, or a store Shopify
 * silently served with a different schema — instead of silently reading 0.
 */
export function readReversalValue(row: Record<string, string | number | null>, field: string): string | number | null {
	const modern = SALES_REVERSAL_RENAMES[field] ?? field;
	const legacy = Object.keys(SALES_REVERSAL_RENAMES).find((k) => SALES_REVERSAL_RENAMES[k] === modern) ?? field;

	return row[modern] ?? row[legacy] ?? null;
}
