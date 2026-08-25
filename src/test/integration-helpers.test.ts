import { describe, expect, it } from "vitest";
import { detectIntegrationCredentials } from "./integration-helpers.js";

const DOMAIN = "dev-store.myshopify.com";

describe("detectIntegrationCredentials", () => {
	it("accepts client id + secret — the project's recommended auth method", () => {
		const result = detectIntegrationCredentials({
			SHOPIFY_STORE_DOMAIN: DOMAIN,
			SHOPIFY_CLIENT_ID: "abc",
			SHOPIFY_CLIENT_SECRET: "shpss_xyz",
		});

		expect(result).toEqual({
			method: "client-credentials",
			storeDomain: DOMAIN,
			clientId: "abc",
			clientSecret: "shpss_xyz",
		});
	});

	it("accepts a static access token", () => {
		const result = detectIntegrationCredentials({
			SHOPIFY_STORE_DOMAIN: DOMAIN,
			SHOPIFY_ACCESS_TOKEN: "shpat_123",
		});

		expect(result).toEqual({ method: "token", storeDomain: DOMAIN, accessToken: "shpat_123" });
	});

	it("prefers an explicit access token over client credentials, matching the config loader", () => {
		const result = detectIntegrationCredentials({
			SHOPIFY_STORE_DOMAIN: DOMAIN,
			SHOPIFY_ACCESS_TOKEN: "shpat_123",
			SHOPIFY_CLIENT_ID: "abc",
			SHOPIFY_CLIENT_SECRET: "shpss_xyz",
		});

		expect(result?.method).toBe("token");
	});

	it("returns null without a store domain, even with full credentials", () => {
		expect(detectIntegrationCredentials({ SHOPIFY_CLIENT_ID: "abc", SHOPIFY_CLIENT_SECRET: "shpss_xyz" })).toBeNull();
		expect(detectIntegrationCredentials({ SHOPIFY_ACCESS_TOKEN: "shpat_123" })).toBeNull();
	});

	it("returns null on a half-configured client-credentials pair", () => {
		expect(detectIntegrationCredentials({ SHOPIFY_STORE_DOMAIN: DOMAIN, SHOPIFY_CLIENT_ID: "abc" })).toBeNull();
		expect(
			detectIntegrationCredentials({ SHOPIFY_STORE_DOMAIN: DOMAIN, SHOPIFY_CLIENT_SECRET: "shpss_xyz" }),
		).toBeNull();
	});

	it("returns null on an empty environment", () => {
		expect(detectIntegrationCredentials({})).toBeNull();
	});

	it("treats empty-string values as absent", () => {
		expect(
			detectIntegrationCredentials({
				SHOPIFY_STORE_DOMAIN: DOMAIN,
				SHOPIFY_ACCESS_TOKEN: "",
				SHOPIFY_CLIENT_ID: "",
				SHOPIFY_CLIENT_SECRET: "",
			}),
		).toBeNull();
	});

	it("falls through to client credentials when the token is an empty string", () => {
		const result = detectIntegrationCredentials({
			SHOPIFY_STORE_DOMAIN: DOMAIN,
			SHOPIFY_ACCESS_TOKEN: "",
			SHOPIFY_CLIENT_ID: "abc",
			SHOPIFY_CLIENT_SECRET: "shpss_xyz",
		});

		expect(result?.method).toBe("client-credentials");
	});
});
