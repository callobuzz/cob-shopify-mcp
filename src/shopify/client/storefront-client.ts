import type pino from "pino";

/** How long a minted token is trusted before the store is asked about it again. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** The label every token this server mints carries, so it can find its own again. */
export const STOREFRONT_TOKEN_TITLE = "cob-shopify-mcp";

/** How the Storefront client reaches the Admin API to mint itself a token. */
export type AdminQuery = (graphql: string, variables?: Record<string, unknown>, queryType?: string) => Promise<any>;

export interface StorefrontClientConfig {
	storeDomain: string;
	apiVersion: string;
	logger: pino.Logger;
	/** The Admin client, used only to obtain a Storefront token. */
	adminQuery: AdminQuery;
	/** A token supplied by the operator. When set, nothing is ever minted. */
	accessToken?: string;
	/** Milliseconds before a request is abandoned. */
	timeoutMs?: number;
}

const LIST_TOKENS = `
	query CobStorefrontTokenList {
		shop {
			storefrontAccessTokens(first: 20) {
				edges {
					node {
						id
						title
						accessToken
					}
				}
			}
		}
	}
`;

const CREATE_TOKEN = `
	mutation CobStorefrontTokenCreate($title: String!) {
		storefrontAccessTokenCreate(input: { title: $title }) {
			storefrontAccessToken {
				id
				title
				accessToken
			}
			userErrors {
				field
				message
			}
		}
	}
`;

/**
 * The Storefront API, and the token it needs, obtained without a human.
 *
 * Shopify has two GraphQL APIs and this package spoke only one. `Shop.brand` — the merchant's
 * uploaded logo, square logo, cover image and brand colours — exists on the **Storefront** schema
 * and has no Admin equivalent, so a YAML tool asking for it loaded fine, booted fine, reported
 * healthy, and then failed at call time with `Field 'brand' doesn't exist on type 'Shop'`. The
 * limit was the transport, not the query.
 *
 * The credential is the hard part, and it is why this class mints rather than asks. An app
 * installed through the Developer Dashboard with **client credentials** has no Storefront token
 * page anywhere in the Shopify admin — the "Storefront API integration" panel belongs to
 * admin-created custom apps only. So for exactly the audience this package serves there is
 * nothing an operator could click even if they wanted to. `storefrontAccessTokenCreate` is an
 * **Admin** mutation, which makes the Admin credentials we already hold the one route in.
 *
 * Existing tokens are listed and reused before anything is created. Shopify caps how many an app
 * may hold, and two tokens with the same title cannot be told apart afterwards, so a mint on
 * every miss would quietly fill the allowance with unusable duplicates.
 *
 * **What a minted token can read is decided by the app's `unauthenticated_*` scopes, not its
 * Admin ones.** An app with fifty Admin scopes and no unauthenticated ones mints a token
 * successfully and then reads nothing — so "the mint worked" is not evidence the token is useful,
 * and a Storefront query that comes back empty is more likely a missing
 * `unauthenticated_read_content` than a broken query.
 */
export class StorefrontClient {
	private token: string | null = null;
	private tokenAt = 0;
	/** In flight mint, so N concurrent tools do not mint N tokens. */
	private pending: Promise<string> | null = null;

	constructor(private readonly config: StorefrontClientConfig) {
		if (config.accessToken) {
			this.token = config.accessToken;
			this.tokenAt = Number.POSITIVE_INFINITY;
		}
	}

	/** Run a Storefront GraphQL document. Throws with Shopify's own words on failure. */
	async query(graphql: string, variables?: Record<string, unknown>): Promise<any> {
		const token = await this.getToken();
		const url = `https://${this.config.storeDomain}/api/${this.config.apiVersion}/graphql.json`;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15_000);
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// The PUBLIC token header. A private/headless token uses
					// `Shopify-Storefront-Private-Token` and is a different credential entirely.
					"X-Shopify-Storefront-Access-Token": token,
				},
				body: JSON.stringify({ query: graphql, variables: variables ?? {} }),
				signal: controller.signal,
			});

			if (!response.ok) {
				// A 401/403 here is nearly always the app's unauthenticated scopes, not the token
				// being wrong — say so, because the obvious reading is the other one.
				if (response.status === 401 || response.status === 403) {
					this.token = null;
					throw new Error(
						`Storefront API refused the request (HTTP ${response.status}). The token exists but was rejected — ` +
							`check that the app's release declares the unauthenticated_* scopes this query needs ` +
							`(shop-level content usually needs unauthenticated_read_content) and that the app has been ` +
							`re-installed since those scopes were added.`,
					);
				}
				throw new Error(`Storefront API request failed: HTTP ${response.status}`);
			}

			const body = (await response.json()) as {
				data?: unknown;
				errors?: { message: string }[];
			};
			if (body.errors?.length) {
				throw new Error(`Storefront API error: ${body.errors.map((e) => e.message).join("; ")}`);
			}
			return body.data;
		} finally {
			clearTimeout(timer);
		}
	}

	/** The token, reusing an existing one and minting only when there is none. */
	private async getToken(): Promise<string> {
		if (this.token && Date.now() - this.tokenAt < TOKEN_TTL_MS) return this.token;
		// Collapse concurrent callers onto one mint. Without this, a client that fires several
		// Storefront tools at once mints several tokens against a capped allowance.
		this.pending ??= this.obtainToken().finally(() => {
			this.pending = null;
		});
		return this.pending;
	}

	private async obtainToken(): Promise<string> {
		const existing = await this.findExistingToken();
		if (existing) {
			this.config.logger.debug({ title: STOREFRONT_TOKEN_TITLE }, "Reusing an existing Storefront access token");
			this.token = existing;
			this.tokenAt = Date.now();
			return existing;
		}

		const minted = await this.mintToken();
		this.config.logger.info(
			{ title: STOREFRONT_TOKEN_TITLE, storeDomain: this.config.storeDomain },
			"Minted a Storefront access token from the Admin credentials. What it can READ is set by the app's " +
				"unauthenticated_* scopes, which are separate from its Admin ones.",
		);
		this.token = minted;
		this.tokenAt = Date.now();
		return minted;
	}

	private async findExistingToken(): Promise<string | null> {
		try {
			const data = await this.config.adminQuery(LIST_TOKENS, {}, "read");
			const edges = data?.data?.shop?.storefrontAccessTokens?.edges ?? data?.shop?.storefrontAccessTokens?.edges;
			if (!Array.isArray(edges)) return null;
			const ours = edges.find((e: any) => e?.node?.title === STOREFRONT_TOKEN_TITLE);
			// Any token is better than minting against a capped allowance; prefer our own.
			const node = ours?.node ?? edges[0]?.node;
			return typeof node?.accessToken === "string" ? node.accessToken : null;
		} catch (error) {
			// Listing may be refused where creating is not, or the other way round. Neither is
			// fatal on its own — fall through to the mint, which reports its own failure.
			this.config.logger.debug(
				{ err: error instanceof Error ? error.message : String(error) },
				"Could not list existing Storefront access tokens",
			);
			return null;
		}
	}

	private async mintToken(): Promise<string> {
		const data = await this.config.adminQuery(CREATE_TOKEN, { title: STOREFRONT_TOKEN_TITLE }, "mutation");
		const payload = data?.data?.storefrontAccessTokenCreate ?? data?.storefrontAccessTokenCreate;

		const userErrors = payload?.userErrors ?? [];
		if (userErrors.length > 0) {
			throw new Error(
				`Could not mint a Storefront access token: ${userErrors
					.map((e: any) => `${(e.field ?? []).join(".")} ${e.message}`.trim())
					.join("; ")}`,
			);
		}

		const token = payload?.storefrontAccessToken?.accessToken;
		if (typeof token !== "string" || token.length === 0) {
			throw new Error(
				"Could not mint a Storefront access token: Shopify accepted the mutation but returned no token. " +
					"The likeliest cause is that the app is not authorised for storefrontAccessTokenCreate — " +
					"supply auth.storefront_access_token in the config instead.",
			);
		}
		return token;
	}
}
