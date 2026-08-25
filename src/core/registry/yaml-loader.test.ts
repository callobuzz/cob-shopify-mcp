import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { loadYamlTools, loadYamlToolsDetailed } from "./yaml-loader.js";

const testDir = join(tmpdir(), "cob-yaml-loader-test");

beforeEach(() => {
	mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
	rmSync(testDir, { recursive: true, force: true });
});

const validYaml = `
name: get_metafield
domain: metafields
description: Get a metafield by namespace and key
scopes:
  - read_metafields
input:
  owner_id:
    type: string
    description: GID of the resource
    required: true
  namespace:
    type: string
    required: true
  key:
    type: string
    required: true
graphql: |
  query GetMetafield($ownerId: ID!) {
    metafield(ownerId: $ownerId) { id namespace key value }
  }
`;

describe("loadYamlTools", () => {
	it("loads valid YAML tool file into ToolDefinition", () => {
		const filePath = join(testDir, "get-metafield.yaml");
		writeFileSync(filePath, validYaml);

		const tools = loadYamlTools([filePath]);
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("get_metafield");
		expect(tools[0].domain).toBe("metafields");
		expect(tools[0].description).toBe("Get a metafield by namespace and key");
		expect(tools[0].scopes).toEqual(["read_metafields"]);
		expect(tools[0].graphql).toContain("query GetMetafield");
	});

	it("sets tier to 3 for YAML tools", () => {
		const filePath = join(testDir, "tool.yaml");
		writeFileSync(filePath, validYaml);

		const tools = loadYamlTools([filePath]);
		expect(tools[0].tier).toBe(3);
	});

	it("converts string input type to z.string()", () => {
		const yaml = `
name: test_str
domain: test
description: Test
scopes: []
input:
  name:
    type: string
    required: true
graphql: "query { test }"
`;
		const filePath = join(testDir, "str.yaml");
		writeFileSync(filePath, yaml);

		const tools = loadYamlTools([filePath]);
		const schema = z.object(tools[0].input);
		expect(schema.safeParse({ name: "hello" }).success).toBe(true);
		expect(schema.safeParse({ name: 123 }).success).toBe(false);
	});

	it("converts number input type to z.number()", () => {
		const yaml = `
name: test_num
domain: test
description: Test
scopes: []
input:
  count:
    type: number
    required: true
graphql: "query { test }"
`;
		const filePath = join(testDir, "num.yaml");
		writeFileSync(filePath, yaml);

		const tools = loadYamlTools([filePath]);
		const schema = z.object(tools[0].input);
		expect(schema.safeParse({ count: 5 }).success).toBe(true);
		expect(schema.safeParse({ count: "five" }).success).toBe(false);
	});

	it("converts boolean input type to z.boolean()", () => {
		const yaml = `
name: test_bool
domain: test
description: Test
scopes: []
input:
  active:
    type: boolean
    required: true
graphql: "query { test }"
`;
		const filePath = join(testDir, "bool.yaml");
		writeFileSync(filePath, yaml);

		const tools = loadYamlTools([filePath]);
		const schema = z.object(tools[0].input);
		expect(schema.safeParse({ active: true }).success).toBe(true);
		expect(schema.safeParse({ active: "yes" }).success).toBe(false);
	});

	it("converts enum input type to z.enum()", () => {
		const yaml = `
name: test_enum
domain: test
description: Test
scopes: []
input:
  status:
    type: enum
    enum:
      - ACTIVE
      - DRAFT
    required: true
graphql: "query { test }"
`;
		const filePath = join(testDir, "enum.yaml");
		writeFileSync(filePath, yaml);

		const tools = loadYamlTools([filePath]);
		const schema = z.object(tools[0].input);
		expect(schema.safeParse({ status: "ACTIVE" }).success).toBe(true);
		expect(schema.safeParse({ status: "INVALID" }).success).toBe(false);
	});

	it("applies min/max constraints to number inputs", () => {
		const yaml = `
name: test_minmax
domain: test
description: Test
scopes: []
input:
  limit:
    type: number
    min: 1
    max: 100
    required: true
graphql: "query { test }"
`;
		const filePath = join(testDir, "minmax.yaml");
		writeFileSync(filePath, yaml);

		const tools = loadYamlTools([filePath]);
		const schema = z.object(tools[0].input);
		expect(schema.safeParse({ limit: 50 }).success).toBe(true);
		expect(schema.safeParse({ limit: 0 }).success).toBe(false);
		expect(schema.safeParse({ limit: 101 }).success).toBe(false);
	});

	it("applies default values to inputs", () => {
		const yaml = `
name: test_default
domain: test
description: Test
scopes: []
input:
  limit:
    type: number
    default: 10
graphql: "query { test }"
`;
		const filePath = join(testDir, "default.yaml");
		writeFileSync(filePath, yaml);

		const tools = loadYamlTools([filePath]);
		const schema = z.object(tools[0].input);
		const result = schema.parse({});
		expect(result.limit).toBe(10);
	});

	it("rejects YAML missing name field", () => {
		const yaml = `
domain: test
description: Test
scopes: []
graphql: "query { test }"
`;
		const filePath = join(testDir, "noname.yaml");
		writeFileSync(filePath, yaml);

		expect(() => loadYamlTools([filePath])).toThrow("missing required field: name");
	});

	it("rejects YAML missing graphql field", () => {
		const yaml = `
name: test_no_gql
domain: test
description: Test
scopes: []
`;
		const filePath = join(testDir, "nogql.yaml");
		writeFileSync(filePath, yaml);

		expect(() => loadYamlTools([filePath])).toThrow("missing required field: graphql");
	});

	it("loads multiple YAML files from directory", () => {
		writeFileSync(
			join(testDir, "tool1.yaml"),
			`
name: tool_one
domain: test
description: Tool one
scopes: []
input: {}
graphql: "query { one }"
`,
		);
		writeFileSync(
			join(testDir, "tool2.yml"),
			`
name: tool_two
domain: test
description: Tool two
scopes: []
input: {}
graphql: "query { two }"
`,
		);

		const tools = loadYamlTools([testDir]);
		expect(tools).toHaveLength(2);
		const names = tools.map((t) => t.name).sort();
		expect(names).toEqual(["tool_one", "tool_two"]);
	});
});

describe("loadYamlToolsDetailed — skipped paths are reported, never silent", () => {
	function makeLogger() {
		const warnings: { obj: Record<string, unknown>; msg: string }[] = [];
		return {
			warnings,
			logger: { warn: (obj: Record<string, unknown>, msg: string) => warnings.push({ obj, msg }) },
		};
	}

	it("reports a missing path instead of skipping it silently", () => {
		const missing = join(testDir, "does-not-exist");
		const result = loadYamlToolsDetailed([missing]);

		expect(result.tools).toHaveLength(0);
		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0].reason).toBe("path does not exist");
	});

	it("still boots — a missing path does not throw", () => {
		expect(() => loadYamlToolsDetailed([join(testDir, "nope")])).not.toThrow();
	});

	it("warns once per skipped path with the resolved absolute path", () => {
		const { logger, warnings } = makeLogger();
		const missingA = join(testDir, "gone-a");
		const missingB = join(testDir, "gone-b");

		loadYamlToolsDetailed([missingA, missingB], logger);

		expect(warnings).toHaveLength(2);
		expect(warnings[0].msg).toContain(resolve(missingA));
		expect(warnings[0].msg).toContain("No tools were loaded from it");
		expect(warnings[1].msg).toContain(resolve(missingB));
	});

	it("resolves relative paths to absolute in the report", () => {
		const result = loadYamlToolsDetailed(["./definitely-not-here"]);
		expect(result.skipped[0].path).toBe("./definitely-not-here");
		expect(isAbsolute(result.skipped[0].resolvedPath)).toBe(true);
	});

	it("reports an existing but empty directory as skipped", () => {
		const emptyDir = join(testDir, "empty");
		mkdirSync(emptyDir, { recursive: true });

		const result = loadYamlToolsDetailed([emptyDir]);

		expect(result.tools).toHaveLength(0);
		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0].reason).toBe("directory contains no .yaml or .yml files");
	});

	it("ignores non-YAML files when deciding a directory is empty", () => {
		const dir = join(testDir, "readme-only");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "README.md"), "# not a tool");

		expect(loadYamlToolsDetailed([dir]).skipped).toHaveLength(1);
	});

	it("records per-path load counts for paths that worked", () => {
		writeFileSync(
			join(testDir, "counted.yaml"),
			`
name: counted_tool
domain: test
description: Counted
scopes: []
input: {}
graphql: "query { counted }"
`,
		);

		const result = loadYamlToolsDetailed([testDir]);

		expect(result.loaded).toHaveLength(1);
		expect(result.loaded[0].count).toBe(1);
		expect(isAbsolute(result.loaded[0].resolvedPath)).toBe(true);
		expect(result.skipped).toHaveLength(0);
	});

	it("loads the good paths and reports the bad ones in the same call", () => {
		writeFileSync(
			join(testDir, "mixed.yaml"),
			`
name: mixed_tool
domain: test
description: Mixed
scopes: []
input: {}
graphql: "query { mixed }"
`,
		);
		const { logger, warnings } = makeLogger();

		const result = loadYamlToolsDetailed([testDir, join(testDir, "absent")], logger);

		expect(result.tools).toHaveLength(1);
		expect(result.loaded).toHaveLength(1);
		expect(result.skipped).toHaveLength(1);
		expect(warnings).toHaveLength(1);
	});

	it("emits no warnings when every path loads", () => {
		writeFileSync(
			join(testDir, "clean.yaml"),
			`
name: clean_tool
domain: test
description: Clean
scopes: []
input: {}
graphql: "query { clean }"
`,
		);
		const { logger, warnings } = makeLogger();

		loadYamlToolsDetailed([testDir], logger);

		expect(warnings).toHaveLength(0);
	});

	it("still throws on a malformed YAML tool rather than skipping it", () => {
		writeFileSync(join(testDir, "broken.yaml"), "name: broken\ndomain: test\ndescription: Broken\n");
		expect(() => loadYamlToolsDetailed([testDir])).toThrow("missing required field: graphql");
	});

	it("keeps loadYamlTools returning a bare tool array", () => {
		writeFileSync(
			join(testDir, "compat.yaml"),
			`
name: compat_tool
domain: test
description: Compat
scopes: []
input: {}
graphql: "query { compat }"
`,
		);

		const tools = loadYamlTools([testDir, join(testDir, "missing")]);
		expect(Array.isArray(tools)).toBe(true);
		expect(tools).toHaveLength(1);
	});
});
