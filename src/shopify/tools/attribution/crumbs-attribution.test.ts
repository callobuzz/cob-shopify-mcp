import { afterEach, describe, expect, it, vi } from "vitest";
import crumbsAttribution from "./crumbs-attribution.tool.js";

const LEDGER = "https://ledger.example.com";

function fakeResponse(ok: boolean, status: number, payload: unknown) {
	return {
		ok,
		status,
		json: async () => payload,
	} as Response;
}

describe("crumbs_attribution", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.CRUMBS_LEDGER_URL;
		delete process.env.CRUMBS_MERCHANT_ID;
	});

	it("has correct metadata", () => {
		expect(crumbsAttribution.name).toBe("crumbs_attribution");
		expect(crumbsAttribution.domain).toBe("attribution");
		expect(crumbsAttribution.tier).toBe(1);
		expect(crumbsAttribution.scopes).toEqual([]);
		expect(crumbsAttribution.handler).toBeDefined();
	});

	it("fails clearly when CRUMBS_LEDGER_URL is not set", async () => {
		await expect(crumbsAttribution.handler!({}, {} as any)).rejects.toThrow(/CRUMBS_LEDGER_URL is not set/);
	});

	it("requires a merchant id when none is configured", async () => {
		process.env.CRUMBS_LEDGER_URL = LEDGER;
		await expect(crumbsAttribution.handler!({}, {} as any)).rejects.toThrow(/merchant_id is required/);
	});

	it("records a consent-gated journey and returns the referral field", async () => {
		process.env.CRUMBS_LEDGER_URL = LEDGER;
		process.env.CRUMBS_MERCHANT_ID = "m_demo123";

		const receiptPayload = {
			rid: "rct_01TEST",
			journey_id: "jrn_01TEST",
			agent_id: "ag_test",
			agent_did: null,
			exp: 1791350354,
			consent: { basis: "explicit", recorded: true, verified: "record" },
		};
		const fetchMock = vi.fn().mockResolvedValue(
			fakeResponse(true, 201, {
				...receiptPayload,
				receipt: JSON.stringify({ rid: "rct_01TEST" }),
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result: any = await crumbsAttribution.handler!({ order_id: "1234", surface: "api" }, {} as any);

		expect(result.ok).toBe(true);
		expect(result.jid).toBe("jrn_01TEST");
		expect(result.rid).toBe("rct_01TEST");
		expect(result.receipt).toEqual({ rid: "rct_01TEST" });
		expect(result.referral).toEqual({
			referral: { ref: "jrn_01TEST", provider: "crumbs" },
		});

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${LEDGER}/v1/journeys`);
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.merchant_id).toBe("m_demo123");
		expect(body.surface).toBe("api");
		expect(body.consent).toEqual({
			basis: "explicit",
			ref: "shopify:1234",
		});
	});

	it("keeps a non-JSON receipt string intact", async () => {
		process.env.CRUMBS_LEDGER_URL = LEDGER;
		const fetchMock = vi.fn().mockResolvedValue(
			fakeResponse(true, 201, {
				rid: "rct_01X",
				journey_id: "jrn_01X",
				receipt: "not-json-at-all",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result: any = await crumbsAttribution.handler!({ merchant_id: "m_x" }, {} as any);
		expect(result.receipt).toBe("not-json-at-all");
	});

	it("surfaces ledger errors with the API detail", async () => {
		process.env.CRUMBS_LEDGER_URL = LEDGER;
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				fakeResponse(false, 422, {
					detail: { code: "UNKNOWN_MERCHANT", message: "no active program" },
				}),
			),
		);

		await expect(crumbsAttribution.handler!({ merchant_id: "m_bad" }, {} as any)).rejects.toThrow(
			/422.*UNKNOWN_MERCHANT/,
		);
	});
});
