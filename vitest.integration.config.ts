import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import type { Plugin } from "vitest/config";
import { defineConfig } from "vitest/config";

config();

function graphqlRawPlugin(): Plugin {
	return {
		name: "graphql-raw",
		transform(_code: string, id: string) {
			if (id.endsWith(".graphql")) {
				const content = readFileSync(id, "utf-8");
				return { code: `export default ${JSON.stringify(content)};`, map: null };
			}
		},
	};
}

export default defineConfig({
	plugins: [graphqlRawPlugin()],
	test: {
		// All test files, not just *.integration.test.ts. Live tests gated on skipIfNoCredentials()
		// also live in plain *.test.ts files (every analytics tool, plus the ShopifyQL client) — and
		// the default vitest config never loads .env, so those could not run under either command.
		// This config loads .env above, so gated tests execute here and unit tests come along free.
		include: ["src/**/*.test.ts"],
		// Generous because a live analytics test may wait out a ShopifyQL allowance window (~1 min)
		// rather than failing. A real hang still trips this; a spent budget no longer does.
		testTimeout: 120000,
		hookTimeout: 60000,
		pool: "forks",
		singleFork: true,
		// Run one file at a time. `singleFork` alone still lets vitest run test files in parallel
		// workers, and each worker has its own client and rate limiter, so nothing coordinates them
		// — they exhausted the per-store ShopifyQL allowance against each other. The allowance is
		// per store, not per process, so the live suite has to be serial.
		fileParallelism: false,
	},
	resolve: {
		alias: [
			{ find: "@core", replacement: resolve(import.meta.dirname, "src/core") },
			{
				find: /^@shopify\/(?!admin-api-client|shopify-api|graphql-client)/,
				replacement: `${resolve(import.meta.dirname, "src/shopify")}/`,
			},
		],
	},
});
