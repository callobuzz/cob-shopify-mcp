/**
 * Shopify Admin API version support windows.
 *
 * Shopify ships a new Admin API version every quarter (January, April, July, October) and
 * supports each one for at least 12 months. When a request names a version Shopify does not
 * recognize — a typo, or a version that has aged out — Shopify does NOT return an error. It
 * silently serves the request against the oldest version it still supports. A stale or
 * misspelled `api_version` therefore keeps working for months and then starts returning
 * different data with no config change and no error naming the cause.
 *
 * This module exists to turn that silent drift into a loud, dated failure.
 *
 * Support-end dates come from https://shopify.dev/docs/api/usage/versioning and are the date
 * Shopify stops serving the version (15:00 UTC on the 16th of the release-anniversary month).
 * Keep this table current when releasing; versions newer than the newest entry are allowed
 * with a warning so a published build never blocks a freshly released Shopify version.
 */

export const API_VERSION_PATTERN = /^\d{4}-(?:01|04|07|10)$/;

export interface KnownApiVersion {
	version: string;
	/** Date Shopify stops serving this version (ISO date, UTC). */
	supportEnds: string;
}

export const KNOWN_API_VERSIONS: readonly KnownApiVersion[] = [
	{ version: "2025-01", supportEnds: "2026-01-16" },
	{ version: "2025-04", supportEnds: "2026-04-16" },
	{ version: "2025-07", supportEnds: "2026-07-16" },
	{ version: "2025-10", supportEnds: "2026-10-16" },
	{ version: "2026-01", supportEnds: "2027-01-16" },
	{ version: "2026-04", supportEnds: "2027-04-16" },
	{ version: "2026-07", supportEnds: "2027-07-16" },
	{ version: "2026-10", supportEnds: "2027-10-16" },
	{ version: "2027-01", supportEnds: "2028-01-16" },
];

/** Env escape hatch: keeps an aged-out version usable instead of failing startup. */
export const ALLOW_UNSUPPORTED_ENV_VAR = "COB_SHOPIFY_ALLOW_UNSUPPORTED_API_VERSION";

/** Warn this many days ahead of a version's support-end date. */
const EXPIRY_WARNING_DAYS = 90;

export type ApiVersionStatus =
	| "malformed"
	| "expired"
	| "expiring-soon"
	| "supported"
	| "older-than-known"
	| "newer-than-known";

export interface ApiVersionCheck {
	status: ApiVersionStatus;
	/** True when the version must not be used — startup should fail. */
	fatal: boolean;
	message: string;
}

function newestKnown(): KnownApiVersion {
	return KNOWN_API_VERSIONS[KNOWN_API_VERSIONS.length - 1];
}

function oldestKnown(): KnownApiVersion {
	return KNOWN_API_VERSIONS[0];
}

function supportedList(now: Date): string[] {
	return KNOWN_API_VERSIONS.filter((v) => new Date(`${v.supportEnds}T15:00:00Z`) > now).map((v) => v.version);
}

/**
 * Classify an `api_version` string against the known support windows.
 *
 * Never throws — callers decide how to react to `fatal`.
 */
export function checkApiVersion(version: string, now: Date = new Date()): ApiVersionCheck {
	if (!API_VERSION_PATTERN.test(version)) {
		return {
			status: "malformed",
			fatal: true,
			message:
				`Invalid Shopify api_version "${version}". Expected a quarterly version like "YYYY-01", "YYYY-04", ` +
				`"YYYY-07" or "YYYY-10". Shopify silently serves unrecognized versions with its oldest supported ` +
				`schema, so this would not fail at request time. Currently supported: ${supportedList(now).join(", ")}.`,
		};
	}

	const known = KNOWN_API_VERSIONS.find((v) => v.version === version);

	if (!known) {
		// Well-formed but outside the table: either predates it or was released after this build.
		if (version < oldestKnown().version) {
			return {
				status: "older-than-known",
				fatal: true,
				message:
					`Shopify api_version "${version}" is long past end of support. Shopify will silently serve ` +
					`requests with its oldest supported schema instead. Currently supported: ${supportedList(now).join(", ")}.`,
			};
		}
		return {
			status: "newer-than-known",
			fatal: false,
			message:
				`Shopify api_version "${version}" is newer than the newest version known to this build ` +
				`(${newestKnown().version}). It is being used as-is. If it is not a real Shopify version, Shopify will ` +
				`silently serve the oldest supported schema instead — verify it at https://shopify.dev/docs/api/usage/versioning.`,
		};
	}

	const supportEnds = new Date(`${known.supportEnds}T15:00:00Z`);

	if (supportEnds <= now) {
		return {
			status: "expired",
			fatal: true,
			message:
				`Shopify api_version "${version}" stopped being supported on ${known.supportEnds}. Shopify now silently ` +
				`serves requests with its oldest supported schema, which can change field availability without any ` +
				`error. Upgrade to one of: ${supportedList(now).join(", ")}. ` +
				`Set ${ALLOW_UNSUPPORTED_ENV_VAR}=true to proceed anyway.`,
		};
	}

	const daysLeft = Math.ceil((supportEnds.getTime() - now.getTime()) / 86_400_000);
	if (daysLeft <= EXPIRY_WARNING_DAYS) {
		return {
			status: "expiring-soon",
			fatal: false,
			message:
				`Shopify api_version "${version}" loses support in ${daysLeft} day(s), on ${known.supportEnds}. ` +
				`After that Shopify silently falls back to its oldest supported schema. Plan an upgrade.`,
		};
	}

	return {
		status: "supported",
		fatal: false,
		message: `Shopify api_version "${version}" is supported until ${known.supportEnds}.`,
	};
}

/** True when the operator has opted into using an unsupported version. */
export function unsupportedVersionAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
	const raw = env[ALLOW_UNSUPPORTED_ENV_VAR];
	if (!raw) return false;
	const val = raw.toLowerCase();
	return val === "true" || val === "1";
}
