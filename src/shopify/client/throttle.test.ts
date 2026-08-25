import { describe, expect, it } from "vitest";
import {
	detectThrottle,
	extractShopifyQLCost,
	extractShopifyQLCostFromErrors,
	shopifyQLThrottleMessage,
} from "./throttle.js";

/**
 * The response shapes below are the ones the live Admin API actually returns. The ShopifyQL cost
 * envelope in particular was captured from a real analytics response — it is not documented
 * alongside `extensions.cost`, and it is what distinguishes a throttle that can be waited out
 * from one that cannot.
 */

const SHOPIFYQL_COST = {
	requestedQueryCost: 3,
	maximumAvailable: 1000,
	currentlyAvailable: 0,
	windowResetAt: "2026-08-14T09:00:00+00:00",
};

describe("extractShopifyQLCost", () => {
	it("reads the ShopifyQL allowance from a live analytics response envelope", () => {
		const cost = extractShopifyQLCost({
			cost: { requestedQueryCost: 3, actualQueryCost: 3, throttleStatus: {} },
			shopifyqlCost: SHOPIFYQL_COST,
		});

		expect(cost).toEqual(SHOPIFYQL_COST);
	});

	it("returns null for a non-analytics response, which carries no ShopifyQL cost", () => {
		expect(
			extractShopifyQLCost({
				cost: { requestedQueryCost: 30, actualQueryCost: 28, throttleStatus: { currentlyAvailable: 1972 } },
			}),
		).toBeNull();
	});

	it("returns null when extensions are absent entirely", () => {
		expect(extractShopifyQLCost(undefined)).toBeNull();
	});
});

/**
 * Captured verbatim from the live store by exhausting the allowance. The budget is reported on the
 * error, and the top-level extensions carry only the ordinary leaky bucket — no `shopifyqlCost`.
 * Note the cost: one wide-range grouped query spent 259 of 1000 points.
 */
const LIVE_THROTTLED_RESPONSE = {
	errors: {
		graphQLErrors: [
			{
				message: "Rate limited. Please retry later.",
				extensions: {
					code: "THROTTLED",
					requestId: "e47fcec0-d062-4f14-80cd-09d28a2b4225-1786694977",
					cost: {
						requestedQueryCost: 259,
						maximumAvailable: 1000,
						currentlyAvailable: 0,
						windowResetAt: "2026-08-14T08:10:00+00:00",
					},
				},
			},
		],
	},
	extensions: {
		cost: {
			requestedQueryCost: 3,
			actualQueryCost: 1,
			throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1958, restoreRate: 100 },
		},
	},
};

describe("throttled ShopifyQL response from the live API", () => {
	it("is classified as a window throttle even though shopifyqlCost is absent", () => {
		// The budget is only on the error here. Reading the top level alone would call this a
		// leaky-bucket throttle and retry it with a backoff that cannot clear a window limit.
		const result = detectThrottle(LIVE_THROTTLED_RESPONSE, new Date("2026-08-14T08:09:30Z"));

		expect(result?.kind).toBe("shopifyql-window");
		expect(result?.windowResetAt).toBe("2026-08-14T08:10:00+00:00");
		expect(result?.retryAfterMs).toBe(30_000);
	});

	it("reads the spent allowance off the error", () => {
		const cost = extractShopifyQLCostFromErrors(LIVE_THROTTLED_RESPONSE.errors.graphQLErrors);

		expect(cost).toEqual({
			requestedQueryCost: 259,
			maximumAvailable: 1000,
			currentlyAvailable: 0,
			windowResetAt: "2026-08-14T08:10:00+00:00",
		});
	});

	it("does not mistake the leaky-bucket envelope for a ShopifyQL budget", () => {
		// The leaky bucket reports restoreRate and no windowResetAt; treating it as a ShopifyQL
		// budget would make ordinary throttles unretryable.
		expect(extractShopifyQLCost(LIVE_THROTTLED_RESPONSE.extensions)).toBeNull();
	});
});

describe("detectThrottle", () => {
	it("returns null for a successful response", () => {
		expect(detectThrottle({ extensions: { shopifyqlCost: SHOPIFYQL_COST } })).toBeNull();
	});

	it("returns null for an unrelated GraphQL error", () => {
		const result = detectThrottle({
			errors: { graphQLErrors: [{ message: "Field 'bogus' doesn't exist on type 'Shop'" }] },
		});

		expect(result).toBeNull();
	});

	it("classifies the live ShopifyQL rate-limit error as a window throttle, not a leaky bucket", () => {
		// This is the exact message the live store returned once the allowance was spent.
		const result = detectThrottle({
			errors: { graphQLErrors: [{ message: "Rate limited. Please retry later." }] },
			extensions: { shopifyqlCost: SHOPIFYQL_COST },
		});

		expect(result?.kind).toBe("shopifyql-window");
		expect(result?.windowResetAt).toBe(SHOPIFYQL_COST.windowResetAt);
	});

	it("reports the exact wait until the window resets", () => {
		const result = detectThrottle(
			{
				errors: { graphQLErrors: [{ message: "Rate limited. Please retry later." }] },
				extensions: { shopifyqlCost: SHOPIFYQL_COST },
			},
			new Date("2026-08-14T08:59:20Z"),
		);

		// The window is a minute boundary, so the wait is bounded and short — 40s here.
		expect(result?.retryAfterMs).toBe(40_000);
	});

	it("never reports a negative wait once the window has already passed", () => {
		const result = detectThrottle(
			{
				errors: { graphQLErrors: [{ message: "Rate limited." }] },
				extensions: { shopifyqlCost: SHOPIFYQL_COST },
			},
			new Date("2026-08-14T09:05:00Z"),
		);

		expect(result?.retryAfterMs).toBe(0);
	});

	it("classifies a standard THROTTLED extension code as a leaky bucket", () => {
		const result = detectThrottle({
			errors: { graphQLErrors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] },
		});

		expect(result?.kind).toBe("leaky-bucket");
	});

	it("detects a throttle reported only as an HTTP 429 network status", () => {
		expect(detectThrottle({ errors: { networkStatusCode: 429 } })?.kind).toBe("leaky-bucket");
	});

	it("detects a throttle reported on the top-level error message", () => {
		expect(detectThrottle({ errors: { message: "Rate limited. Please retry later." } })?.kind).toBe("leaky-bucket");
	});
});

describe("shopifyQLThrottleMessage", () => {
	const now = new Date("2026-08-14T08:30:00Z");

	it("names the reset time and the wait in minutes", () => {
		const info = {
			kind: "shopifyql-window" as const,
			message: "Rate limited. Please retry later.",
			windowResetAt: "2026-08-14T09:00:00+00:00",
		};

		const message = shopifyQLThrottleMessage(info, now);

		expect(message).toContain("2026-08-14T09:00:00+00:00");
		expect(message).toContain("30m");
		// The caller must understand why an immediate retry is pointless, and what to do instead.
		expect(message).toContain("separate ShopifyQL allowance");
		expect(message).toContain("date range");
	});

	it("reports a sub-minute wait in seconds", () => {
		const message = shopifyQLThrottleMessage(
			{ kind: "shopifyql-window", message: "Rate limited.", windowResetAt: "2026-08-14T08:30:45+00:00" },
			now,
		);

		expect(message).toContain("45s");
	});

	it("still explains the cause when no reset time is reported", () => {
		const message = shopifyQLThrottleMessage({ kind: "shopifyql-window", message: "Rate limited." }, now);

		expect(message).toContain("ShopifyQL rate limit reached");
		expect(message).not.toContain("refills at");
	});

	it("does not claim a negative wait when the window has already reset", () => {
		const message = shopifyQLThrottleMessage(
			{ kind: "shopifyql-window", message: "Rate limited.", windowResetAt: "2026-08-14T08:00:00+00:00" },
			now,
		);

		expect(message).toContain("in about 0s");
		// The wait must never be reported as negative; the ISO timestamp's own hyphens are fine.
		expect(message).not.toMatch(/in about -/);
	});

	it("does not double the sentence-ending period when Shopify's message already has one", () => {
		const message = shopifyQLThrottleMessage({ kind: "shopifyql-window", message: "Rate limited." }, now);

		expect(message).not.toContain("..");
	});
});
