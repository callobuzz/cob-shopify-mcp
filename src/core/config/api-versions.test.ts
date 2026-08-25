import { afterEach, describe, expect, it } from "vitest";
import {
	ALLOW_UNSUPPORTED_ENV_VAR,
	API_VERSION_PATTERN,
	checkApiVersion,
	KNOWN_API_VERSIONS,
	unsupportedVersionAllowed,
} from "./api-versions.js";
import { configSchema } from "./schema.js";

// Fixed clock so these assertions do not drift as the real support windows pass.
const NOW = new Date("2026-08-14T00:00:00Z");

describe("API_VERSION_PATTERN", () => {
	it("accepts the four quarterly months", () => {
		for (const v of ["2026-01", "2026-04", "2026-07", "2026-10"]) {
			expect(API_VERSION_PATTERN.test(v)).toBe(true);
		}
	});

	it("rejects non-quarterly months and malformed strings", () => {
		for (const v of ["2026-02", "2026-13", "2026-1", "26-01", "latest", "unstable", "", "2026_01"]) {
			expect(API_VERSION_PATTERN.test(v)).toBe(false);
		}
	});
});

describe("KNOWN_API_VERSIONS", () => {
	it("is sorted ascending so first/last are oldest/newest", () => {
		const versions = KNOWN_API_VERSIONS.map((v) => v.version);
		expect([...versions].sort()).toEqual(versions);
	});

	it("only contains well-formed quarterly versions", () => {
		for (const { version } of KNOWN_API_VERSIONS) {
			expect(API_VERSION_PATTERN.test(version)).toBe(true);
		}
	});

	// Deliberately checks the real clock. Validation is date-driven, so a stale table would
	// eventually start rejecting versions Shopify still supports. Failing here — months before
	// that can happen — is the reminder to add the next quarters.
	it("still has headroom: the newest known version is over 180 days from end of support", () => {
		const newest = KNOWN_API_VERSIONS[KNOWN_API_VERSIONS.length - 1];
		const daysLeft = (new Date(`${newest.supportEnds}T15:00:00Z`).getTime() - Date.now()) / 86_400_000;
		expect(
			daysLeft,
			`KNOWN_API_VERSIONS ends at ${newest.version} (support ends ${newest.supportEnds}). ` +
				"Add the next quarterly versions in src/core/config/api-versions.ts.",
		).toBeGreaterThan(180);
	});

	it("keeps the schema default within its support window", () => {
		const defaultVersion = configSchema.parse({}).shopify.api_version;
		const check = checkApiVersion(defaultVersion);
		expect(check.fatal, `Default api_version "${defaultVersion}" is no longer usable: ${check.message}`).toBe(false);
	});
});

describe("checkApiVersion", () => {
	it("flags a malformed version as fatal", () => {
		const result = checkApiVersion("2026-13", NOW);
		expect(result.status).toBe("malformed");
		expect(result.fatal).toBe(true);
	});

	it("flags a non-version string as fatal", () => {
		expect(checkApiVersion("latest", NOW).fatal).toBe(true);
		expect(checkApiVersion("", NOW).fatal).toBe(true);
	});

	it("flags an aged-out version as fatal", () => {
		const result = checkApiVersion("2025-01", NOW);
		expect(result.status).toBe("expired");
		expect(result.fatal).toBe(true);
	});

	it("names the support-end date and the supported alternatives in the expiry message", () => {
		const result = checkApiVersion("2025-04", NOW);
		expect(result.message).toContain("2026-04-16");
		expect(result.message).toContain("2026-07");
		expect(result.message).toContain(ALLOW_UNSUPPORTED_ENV_VAR);
	});

	it("explains the silent-fallback behaviour rather than just rejecting", () => {
		expect(checkApiVersion("2026-13", NOW).message).toContain("oldest supported");
	});

	it("accepts a version comfortably inside its support window", () => {
		const result = checkApiVersion("2026-07", NOW);
		expect(result.status).toBe("supported");
		expect(result.fatal).toBe(false);
	});

	it("warns without failing when support ends within 90 days", () => {
		// 2025-10 loses support 2026-10-16 — 63 days after the fixed clock.
		const result = checkApiVersion("2025-10", NOW);
		expect(result.status).toBe("expiring-soon");
		expect(result.fatal).toBe(false);
		expect(result.message).toContain("2026-10-16");
	});

	it("treats a version newer than the table as usable but warns", () => {
		const result = checkApiVersion("2028-04", NOW);
		expect(result.status).toBe("newer-than-known");
		expect(result.fatal).toBe(false);
	});

	it("treats a well-formed version older than the table as fatal", () => {
		const result = checkApiVersion("2019-04", NOW);
		expect(result.status).toBe("older-than-known");
		expect(result.fatal).toBe(true);
	});

	it("expires exactly at the documented cutoff, not before", () => {
		const justBefore = new Date("2027-01-16T14:59:00Z");
		const justAfter = new Date("2027-01-16T15:01:00Z");
		expect(checkApiVersion("2026-01", justBefore).fatal).toBe(false);
		expect(checkApiVersion("2026-01", justAfter).status).toBe("expired");
	});

	it("defaults the clock to now when none is given", () => {
		expect(() => checkApiVersion("2026-07")).not.toThrow();
	});
});

describe("unsupportedVersionAllowed", () => {
	it("is false when unset", () => {
		expect(unsupportedVersionAllowed({})).toBe(false);
	});

	it("accepts true and 1, case-insensitively", () => {
		expect(unsupportedVersionAllowed({ [ALLOW_UNSUPPORTED_ENV_VAR]: "true" })).toBe(true);
		expect(unsupportedVersionAllowed({ [ALLOW_UNSUPPORTED_ENV_VAR]: "TRUE" })).toBe(true);
		expect(unsupportedVersionAllowed({ [ALLOW_UNSUPPORTED_ENV_VAR]: "1" })).toBe(true);
	});

	it("rejects other values", () => {
		expect(unsupportedVersionAllowed({ [ALLOW_UNSUPPORTED_ENV_VAR]: "false" })).toBe(false);
		expect(unsupportedVersionAllowed({ [ALLOW_UNSUPPORTED_ENV_VAR]: "yes" })).toBe(false);
	});
});

describe("configSchema api_version integration", () => {
	afterEach(() => {
		delete process.env[ALLOW_UNSUPPORTED_ENV_VAR];
	});

	it("still applies the default when api_version is omitted", () => {
		expect(configSchema.parse({}).shopify.api_version).toBe("2026-01");
	});

	it("rejects a typo instead of silently accepting it", () => {
		const result = configSchema.safeParse({ shopify: { api_version: "2026-13" } });
		expect(result.success).toBe(false);
	});

	it("rejects an aged-out version", () => {
		expect(configSchema.safeParse({ shopify: { api_version: "2025-01" } }).success).toBe(false);
	});

	it("lets the escape hatch override an aged-out version", () => {
		process.env[ALLOW_UNSUPPORTED_ENV_VAR] = "true";
		const result = configSchema.safeParse({ shopify: { api_version: "2025-01" } });
		expect(result.success).toBe(true);
	});

	it("accepts a version newer than this build knows about", () => {
		expect(configSchema.safeParse({ shopify: { api_version: "2028-04" } }).success).toBe(true);
	});
});
