import type { ShopifyQLCostData } from "@core/observability/types.js";

/**
 * Shopify reports throttling two different ways, and neither is an HTTP error.
 *
 * 1. The shared GraphQL leaky bucket (`extensions.cost.throttleStatus`) refills at `restoreRate`
 *    points per second, so a throttled request succeeds moments later.
 * 2. ShopifyQL bills against its own allowance (`extensions.shopifyqlCost`), which does not trickle
 *    back — it resets in full at `windowResetAt`, the next minute boundary. Observed live: at
 *    08:06:08Z the reported reset was 08:07:00Z. Query cost scales with the range scanned
 *    (`SINCE -7d` cost 1 point, `SINCE -90d` cost 3), so a burst of wide-range analytics queries
 *    can spend the allowance well before the window turns over.
 *
 * Both arrive as a GraphQL error inside an HTTP 200 response, so neither is visible to retry
 * logic that only inspects HTTP status codes.
 */

export type ThrottleKind = "leaky-bucket" | "shopifyql-window";

export interface ThrottleInfo {
	kind: ThrottleKind;
	message: string;
	/** Present for `shopifyql-window`: when the allowance refills. */
	windowResetAt?: string;
	/** Milliseconds until `windowResetAt`, clamped at 0. Undefined when no reset time was reported. */
	retryAfterMs?: number;
}

/** Marks an error as a throttle that is worth retrying. `status` lets withRetry() treat it as 429. */
export class ThrottledError extends Error {
	readonly status = 429;
	readonly retryable = true;
	readonly kind: ThrottleKind;
	/** Exact wait before retrying. Overrides exponential backoff when Shopify tells us the reset. */
	readonly retryAfterMs?: number;

	constructor(message: string, kind: ThrottleKind, retryAfterMs?: number) {
		super(message);
		this.name = "ThrottledError";
		this.kind = kind;
		this.retryAfterMs = retryAfterMs;
	}
}

/**
 * The ShopifyQL allowance is spent and the window will not turn over soon enough to wait for.
 * Explicitly non-retryable so a tool call fails with the reset time instead of blocking.
 */
export class ShopifyQLRateLimitError extends Error {
	readonly retryable = false;
	readonly windowResetAt?: string;

	constructor(message: string, windowResetAt?: string) {
		super(message);
		this.name = "ShopifyQLRateLimitError";
		this.windowResetAt = windowResetAt;
	}
}

interface GraphQLErrorLike {
	message?: string;
	extensions?: {
		code?: string;
		/**
		 * On a throttled ShopifyQL request the spent allowance is reported here, per error — not in
		 * the top-level extensions, which carry only the ordinary leaky bucket. Captured live.
		 */
		cost?: Partial<ShopifyQLCostData>;
	};
}

interface ResponseLike {
	errors?: {
		message?: string;
		networkStatusCode?: number;
		graphQLErrors?: GraphQLErrorLike[];
	};
	extensions?: Record<string, unknown>;
}

const THROTTLE_MESSAGE = /throttl|rate limit/i;

function messageIndicatesThrottle(message?: string): boolean {
	return typeof message === "string" && THROTTLE_MESSAGE.test(message);
}

/**
 * Normalizes a ShopifyQL cost envelope.
 *
 * `windowResetAt` is the discriminator: the ShopifyQL allowance reports a reset time, while the
 * shared leaky bucket reports a `throttleStatus.restoreRate` instead. Anything without a reset
 * time is not a ShopifyQL budget and must not be treated as one.
 */
function normalizeShopifyQLCost(raw: Partial<ShopifyQLCostData> | undefined): ShopifyQLCostData | null {
	if (
		!raw ||
		typeof raw.currentlyAvailable !== "number" ||
		typeof raw.maximumAvailable !== "number" ||
		typeof raw.windowResetAt !== "string"
	) {
		return null;
	}
	return {
		requestedQueryCost: raw.requestedQueryCost ?? 0,
		maximumAvailable: raw.maximumAvailable,
		currentlyAvailable: raw.currentlyAvailable,
		windowResetAt: raw.windowResetAt,
	};
}

/** Reads `extensions.shopifyqlCost` from a successful ShopifyQL response. */
export function extractShopifyQLCost(extensions?: Record<string, unknown>): ShopifyQLCostData | null {
	return normalizeShopifyQLCost(extensions?.shopifyqlCost as Partial<ShopifyQLCostData> | undefined);
}

/**
 * Reads the ShopifyQL allowance off a throttled response.
 *
 * A refused request reports the spent budget on the GraphQL error itself
 * (`errors[].extensions.cost`), and omits the top-level `shopifyqlCost` it would normally carry.
 * Looking only at the top level therefore misclassifies every ShopifyQL throttle as a leaky-bucket
 * throttle, and retries it with a backoff that cannot help.
 */
export function extractShopifyQLCostFromErrors(errors?: GraphQLErrorLike[]): ShopifyQLCostData | null {
	for (const error of errors ?? []) {
		const cost = normalizeShopifyQLCost(error.extensions?.cost);
		if (cost) return cost;
	}
	return null;
}

/**
 * Classifies a response as throttled, or null if it is not.
 *
 * A ShopifyQL cost envelope on the response means the request was billed against the ShopifyQL
 * window, so a throttle here cannot be waited out by a short backoff.
 */
export function detectThrottle(response: ResponseLike, now: Date = new Date()): ThrottleInfo | null {
	const errors = response.errors;
	if (!errors) return null;

	const gqlErrors = errors.graphQLErrors ?? [];
	const throttled =
		errors.networkStatusCode === 429 ||
		messageIndicatesThrottle(errors.message) ||
		gqlErrors.some((e) => e.extensions?.code === "THROTTLED" || messageIndicatesThrottle(e.message));

	if (!throttled) return null;

	const message = gqlErrors.map((e) => e.message).find(messageIndicatesThrottle) ?? errors.message ?? "Throttled";

	// A throttled request reports its budget on the error; a successful one reports it at the top
	// level. Check the error first — that is the case we are in whenever we get here.
	const shopifyqlCost = extractShopifyQLCostFromErrors(gqlErrors) ?? extractShopifyQLCost(response.extensions);
	if (shopifyqlCost) {
		return {
			kind: "shopifyql-window",
			message,
			windowResetAt: shopifyqlCost.windowResetAt || undefined,
			retryAfterMs: millisUntil(shopifyqlCost.windowResetAt, now),
		};
	}

	return { kind: "leaky-bucket", message };
}

/** Milliseconds until an ISO timestamp, clamped at 0. Undefined if absent or unparseable. */
export function millisUntil(timestamp: string | undefined, now: Date = new Date()): number | undefined {
	if (!timestamp) return undefined;
	const target = new Date(timestamp);
	if (Number.isNaN(target.getTime())) return undefined;
	return Math.max(0, target.getTime() - now.getTime());
}

/** Builds the message a caller sees when the ShopifyQL allowance is spent. */
export function shopifyQLThrottleMessage(info: ThrottleInfo, now: Date = new Date()): string {
	// Shopify's own message usually ends in a period; don't add a second one.
	const reported = info.message.replace(/\.\s*$/, "");
	const base =
		`ShopifyQL rate limit reached: ${reported}. Analytics queries are billed against a ` +
		"separate ShopifyQL allowance that resets in full at a window boundary rather than trickling " +
		"back, so an immediate retry will not succeed. Query cost grows with the date range scanned — " +
		"narrowing the range, or spacing analytics calls out, avoids this.";

	if (!info.windowResetAt) return base;

	const resetAt = new Date(info.windowResetAt);
	if (Number.isNaN(resetAt.getTime())) return base;

	const seconds = Math.max(0, Math.round((resetAt.getTime() - now.getTime()) / 1000));
	const minutes = Math.ceil(seconds / 60);
	const when = seconds < 60 ? `${seconds}s` : `${minutes}m`;
	return `${base} The allowance refills at ${info.windowResetAt} (in about ${when}).`;
}
