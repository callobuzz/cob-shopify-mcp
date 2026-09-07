import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOREFRONT_TOKEN_TITLE, StorefrontClient } from "./storefront-client.js";

const logger = pino({ level: "silent" });

const BRAND_QUERY = `query { shop { brand { logo { image { url } } } } }`;

function makeClient(opts: { adminQuery: ReturnType<typeof vi.fn>; accessToken?: string }) {
	return new StorefrontClient({
		storeDomain: "test-store.myshopify.com",
		apiVersion: "2026-01",
		logger,
		adminQuery: opts.adminQuery,
		accessToken: opts.accessToken,
	});
}

/** An Admin client that has no tokens yet and mints one on request. */
function adminThatMints(token = "sft_minted") {
	return vi.fn(async (graphql: string) => {
		if (graphql.includes("storefrontAccessTokens")) {
			return { data: { shop: { storefrontAccessTokens: { edges: [] } } } };
		}
		return {
			data: {
				storefrontAccessTokenCreate: {
					storefrontAccessToken: { id: "gid://1", title: STOREFRONT_TOKEN_TITLE, accessToken: token },
					userErrors: [],
				},
			},
		};
	});
}

function okResponse(data: unknown) {
	return { ok: true, status: 200, json: async () => ({ data }) } as Response;
}

describe("StorefrontClient", () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, "fetch") as never;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("goes to the storefront endpoint with the storefront header", async () => {
		// The whole point of the class. Admin and Storefront are different URLs with different
		// auth, and sending an Admin token to the Storefront path fails as a bad credential.
		fetchSpy.mockResolvedValue(okResponse({ shop: { brand: null } }));
		const client = makeClient({ adminQuery: adminThatMints() });

		await client.query(BRAND_QUERY);

		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://test-store.myshopify.com/api/2026-01/graphql.json");
		const headers = init.headers as Record<string, string>;
		expect(headers["X-Shopify-Storefront-Access-Token"]).toBe("sft_minted");
		expect(headers).not.toHaveProperty("X-Shopify-Access-Token");
	});

	it("mints a token from the Admin credentials when the store has none", async () => {
		fetchSpy.mockResolvedValue(okResponse({ shop: {} }));
		const adminQuery = adminThatMints("sft_fresh");
		const client = makeClient({ adminQuery });

		await client.query(BRAND_QUERY);

		const mutation = adminQuery.mock.calls.find(([g]) => (g as string).includes("storefrontAccessTokenCreate"));
		expect(mutation).toBeDefined();
		expect(mutation?.[1]).toEqual({ title: STOREFRONT_TOKEN_TITLE });
	});

	it("reuses a token this server already minted instead of making another", async () => {
		// Shopify caps how many tokens one app may hold, and two with the same title cannot be
		// told apart afterwards — so minting on every miss quietly fills the allowance.
		const adminQuery = vi.fn(async (graphql: string) => {
			if (graphql.includes("storefrontAccessTokens")) {
				return {
					data: {
						shop: {
							storefrontAccessTokens: {
								edges: [{ node: { id: "gid://9", title: STOREFRONT_TOKEN_TITLE, accessToken: "sft_existing" } }],
							},
						},
					},
				};
			}
			throw new Error("should not mint");
		});
		fetchSpy.mockResolvedValue(okResponse({ shop: {} }));

		await makeClient({ adminQuery }).query(BRAND_QUERY);

		const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
		expect(headers["X-Shopify-Storefront-Access-Token"]).toBe("sft_existing");
	});

	it("never touches the Admin API when a token was configured", async () => {
		const adminQuery = vi.fn(async () => {
			throw new Error("should not be called");
		});
		fetchSpy.mockResolvedValue(okResponse({ shop: {} }));

		await makeClient({ adminQuery, accessToken: "sft_given" }).query(BRAND_QUERY);

		expect(adminQuery).not.toHaveBeenCalled();
		const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
		expect(headers["X-Shopify-Storefront-Access-Token"]).toBe("sft_given");
	});

	it("mints once for concurrent callers, not once each", async () => {
		const adminQuery = adminThatMints();
		fetchSpy.mockResolvedValue(okResponse({ shop: {} }));
		const client = makeClient({ adminQuery });

		await Promise.all([client.query(BRAND_QUERY), client.query(BRAND_QUERY), client.query(BRAND_QUERY)]);

		const mints = adminQuery.mock.calls.filter(([g]) => (g as string).includes("storefrontAccessTokenCreate"));
		expect(mints).toHaveLength(1);
	});

	it("blames the app's unauthenticated scopes on a 401, not the token", async () => {
		// The obvious reading of a 401 is "bad credential", and here it usually is not: the
		// minted token is real, and what it may READ comes from scopes the Admin side never
		// needed. An operator sent to re-mint would find the same 401 waiting.
		fetchSpy.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
		const client = makeClient({ adminQuery: adminThatMints() });

		await expect(client.query(BRAND_QUERY)).rejects.toThrow(/unauthenticated_\*/);
	});

	it("reports Shopify's own words when a mint is refused", async () => {
		const adminQuery = vi.fn(async (graphql: string) => {
			if (graphql.includes("storefrontAccessTokens")) {
				return { data: { shop: { storefrontAccessTokens: { edges: [] } } } };
			}
			return {
				data: {
					storefrontAccessTokenCreate: {
						storefrontAccessToken: null,
						userErrors: [{ field: ["input", "title"], message: "Access denied" }],
					},
				},
			};
		});

		await expect(makeClient({ adminQuery }).query(BRAND_QUERY)).rejects.toThrow(/Access denied/);
	});

	it("surfaces a GraphQL error rather than returning empty data", async () => {
		fetchSpy.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ errors: [{ message: "Field 'brand' doesn't exist" }] }),
		} as Response);

		await expect(makeClient({ adminQuery: adminThatMints() }).query(BRAND_QUERY)).rejects.toThrow(
			/Field 'brand' doesn't exist/,
		);
	});
});
