import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("cob-shopify-mcp scaffold", () => {
	it("exports package entry point", async () => {
		const mod = await import("./index.js");
		expect(mod).toBeDefined();
		expect(typeof mod.VERSION).toBe("string");
	});

	// `VERSION` is what `cob-shopify --version` prints. Asserting it against a
	// literal only restates whatever the constant happens to say, so the two
	// drifted apart for six releases (the CLI reported 0.6.0 at package version
	// 0.6.6). Compare against package.json instead — that is the actual invariant.
	it("VERSION matches the version in package.json", async () => {
		const { VERSION } = await import("./index.js");
		const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8"));
		expect(VERSION).toBe(pkg.version);
	});
});
