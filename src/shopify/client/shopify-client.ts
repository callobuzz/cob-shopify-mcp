import type { ShopifyCostData } from "@core/observability/types.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { QueryCache } from "./query-cache.js";
import { RateLimiter } from "./rate-limiter.js";
import { withRetry } from "./retry.js";
import {
	detectThrottle,
	extractShopifyQLCost,
	extractShopifyQLCostFromErrors,
	ShopifyQLRateLimitError,
	shopifyQLThrottleMessage,
	ThrottledError,
} from "./throttle.js";
import type { QueryType, ShopifyClientConfig, ShopifyQueryResult } from "./types.js";

/** Warn once the ShopifyQL allowance drops to this fraction of its maximum. */
const SHOPIFYQL_BUDGET_WARN_FRACTION = 0.1;

/**
 * Default ceiling on blocking a caller while the ShopifyQL window resets.
 *
 * The window is a minute, so waiting it out always terminates — but a tool call that silently
 * blocks for a minute looks like a hang to the caller and outlives most client timeouts. Absorb a
 * short wait, and past that report the reset time so the caller can decide. Overridable via
 * `rateLimit.maxShopifyQLWaitMs` for batch work that would rather wait than fail.
 */
const DEFAULT_MAX_SHOPIFYQL_WAIT_MS = 10_000;

/** Small margin so we resume just after the boundary, not exactly on it. */
const SHOPIFYQL_WAIT_BUFFER_MS = 500;

export class ShopifyClient {
	private rateLimiter: RateLimiter;
	private cache: QueryCache;
	private config: ShopifyClientConfig;
	private cachedToken: string | null = null;
	private adminClient: ReturnType<typeof createAdminApiClient> | null = null;

	constructor(config: ShopifyClientConfig) {
		this.config = config;
		this.rateLimiter = new RateLimiter(config.rateLimit);
		this.cache = new QueryCache();
	}

	async query(graphql: string, variables?: Record<string, unknown>, queryType?: string): Promise<ShopifyQueryResult> {
		const type = (queryType ?? "read") as QueryType;

		// 1. Check cache (skip for mutations)
		if (type !== "mutation") {
			const cacheKey = QueryCache.createKey(graphql, variables, this.config.storeDomain);
			const cached = this.cache.get(cacheKey);
			if (cached !== undefined) {
				this.config.logger.debug("Cache hit for query");
				return cached as ShopifyQueryResult;
			}
		}

		// 2. Acquire rate limiter
		await this.rateLimiter.acquire();

		try {
			// 3. Get token from auth provider
			const token = await this.config.authProvider.getToken(this.config.storeDomain);

			// 4. Create or reuse admin client
			if (!this.adminClient || this.cachedToken !== token) {
				this.cachedToken = token;
				this.adminClient = createAdminApiClient({
					storeDomain: this.config.storeDomain,
					apiVersion: this.config.apiVersion,
					accessToken: token,
				});
			}

			const client = this.adminClient;

			// 5. Execute query with retry.
			// Shopify reports throttling as a GraphQL error inside an HTTP 200, so the check has to
			// happen in here — a throttle detected after withRetry() returns can never be retried.
			const response = await withRetry(async () => {
				const result = await client.request(graphql, {
					variables: variables as Record<string, any>,
				});

				const throttle = detectThrottle(result as never);
				if (throttle) {
					// Feed the limiter before backing off so the wait is informed by real headroom.
					const throttledCost = result.extensions?.cost as ShopifyCostData | undefined;
					if (throttledCost) {
						this.rateLimiter.updateFromResponse(throttledCost);
					}
					const shopifyqlCost =
						extractShopifyQLCostFromErrors(result.errors?.graphQLErrors) ??
						extractShopifyQLCost(result.extensions as Record<string, unknown>);
					if (shopifyqlCost) {
						this.rateLimiter.updateFromShopifyQLCost(shopifyqlCost);
					}

					// The ShopifyQL allowance resets at a window boundary rather than trickling back, so
					// exponential backoff is the wrong shape: the correct wait is exactly "until the
					// window turns over". That is usually seconds, so wait it out; if the reset is
					// further off than a caller should be made to block, fail with the reset time
					// instead of holding a tool call open.
					if (throttle.kind === "shopifyql-window") {
						const waitMs = throttle.retryAfterMs;
						const maxWaitMs = this.config.rateLimit?.maxShopifyQLWaitMs ?? DEFAULT_MAX_SHOPIFYQL_WAIT_MS;
						if (waitMs === undefined || waitMs > maxWaitMs) {
							throw new ShopifyQLRateLimitError(shopifyQLThrottleMessage(throttle), throttle.windowResetAt);
						}
						this.config.logger.debug(
							`ShopifyQL allowance spent; waiting ${Math.ceil(waitMs / 1000)}s for the window to reset.`,
						);
						throw new ThrottledError(throttle.message, throttle.kind, waitMs + SHOPIFYQL_WAIT_BUFFER_MS);
					}
					throw new ThrottledError(throttle.message, throttle.kind);
				}

				return result;
			});

			// 6. Check for GraphQL errors
			if (response.errors) {
				const gqlErrors = response.errors.graphQLErrors;
				if (gqlErrors && gqlErrors.length > 0) {
					const messages = gqlErrors.map((e: { message?: string }) => e.message ?? "Unknown GraphQL error").join("; ");
					// Detect scope/permission errors and give actionable message
					const isScopeError = gqlErrors.some(
						(e: { message?: string; extensions?: { code?: string } }) =>
							e.extensions?.code === "ACCESS_DENIED" ||
							e.message?.includes("Access denied") ||
							e.message?.includes("access_scope") ||
							e.message?.includes("permission"),
					);
					if (isScopeError) {
						throw new Error(
							`Access denied — your app is missing required Shopify scopes. ${messages}. ` +
								"Go to dev.shopify.com → your app → Configuration → update scopes → Release a new version. " +
								"Then reinstall the app on your store.",
						);
					}
					throw new Error(`GraphQL errors: ${messages}`);
				}
				if (response.errors.message) {
					const msg = response.errors.message;
					if (msg.includes("Access denied") || msg.includes("Forbidden")) {
						throw new Error(
							`Access denied — ${msg}. Check your app scopes at dev.shopify.com → your app → Configuration.`,
						);
					}
					throw new Error(`GraphQL error: ${msg}`);
				}
				if (response.errors.networkStatusCode) {
					const status = response.errors.networkStatusCode;
					if (status === 403) {
						throw new Error(
							"Forbidden (403) — your app lacks the required scopes for this operation. " +
								"Go to dev.shopify.com → your app → Configuration → update scopes → Release → reinstall.",
						);
					}
					throw new Error(`Network error: status ${status}`);
				}
			}

			// 7. Extract cost from extensions.cost
			const cost: ShopifyCostData | null = (response.extensions?.cost as ShopifyCostData) ?? null;

			// 8. Update rate limiter from cost
			if (cost) {
				this.rateLimiter.updateFromResponse(cost);
			}

			// 9. Report cost to costTracker
			if (cost) {
				this.config.costTracker.recordCall(cost);
			}

			// 9b. Track the separate ShopifyQL allowance, present only on analytics responses.
			// Without this the budget is invisible until it is already spent and analytics fails.
			const shopifyqlCost = extractShopifyQLCost(response.extensions as Record<string, unknown>);
			if (shopifyqlCost) {
				this.rateLimiter.updateFromShopifyQLCost(shopifyqlCost);
				const fraction = this.rateLimiter.getShopifyQLBudgetFraction();
				if (fraction !== null && fraction <= SHOPIFYQL_BUDGET_WARN_FRACTION) {
					this.config.logger.warn(
						`ShopifyQL budget low: ${shopifyqlCost.currentlyAvailable}/${shopifyqlCost.maximumAvailable} ` +
							`points remaining, refills at ${shopifyqlCost.windowResetAt}. ` +
							"Further analytics queries will fail until then.",
					);
				}
			}

			const result: ShopifyQueryResult = {
				data: response.data ?? null,
				cost,
			};

			// 10. Cache result if applicable (skip mutations)
			if (type !== "mutation") {
				const ttl = this.getTtlForQueryType(type);
				if (ttl > 0) {
					const cacheKey = QueryCache.createKey(graphql, variables, this.config.storeDomain);
					this.cache.set(cacheKey, result, ttl);
				}
			}

			return result;
		} finally {
			// 11. Release rate limiter
			this.rateLimiter.release();
		}
	}

	invalidateCache(pattern?: string): void {
		this.cache.invalidate(pattern);
	}

	private getTtlForQueryType(type: QueryType): number {
		const cacheConfig = this.config.cache;
		if (!cacheConfig) return 30; // default read TTL

		switch (type) {
			case "read":
				return cacheConfig.readTtl;
			case "search":
				return cacheConfig.searchTtl;
			case "analytics":
				return cacheConfig.analyticsTtl;
			default:
				return 0;
		}
	}
}
