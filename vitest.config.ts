import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vitest/config";
import { defineConfig } from "vitest/config";

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
		globals: true,
		exclude: ["**/*.integration.test.ts", "node_modules", "dist"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
		},
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
