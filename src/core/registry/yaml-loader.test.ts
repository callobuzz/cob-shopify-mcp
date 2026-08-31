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
  query GetMetafield($owner_id: ID!, $namespace: String!, $key: String!) {
    metafield(ownerId: $owner_id, namespace: $namespace, key: $key) { id namespace key value }
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
graphql: "query T($name: String!) { test(name: $name) }"
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
graphql: "query T($count: Int!) { test(count: $count) }"
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
graphql: "query T($active: Boolean!) { test(active: $active) }"
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
graphql: "query T($status: Status!) { test(status: $status) }"
`;
		const filePath = join(testDir, "enum.yaml");
		writeFileSync(filePath, yaml);

		const tools = loadYamlTools([filePath]);
		const schema = z.object(tools[0].input);
		expect(schema.safeParse({ status: "ACTIVE" }).success).toBe(true);
		expect(schema.safeParse({ status: "INVALID" }).success).toBe(false);
	});

	it("rejects an enum declared without values", () => {
		const yaml = `
name: test_empty_enum
domain: test
description: Test
scopes: []
input:
  status:
    type: enum
    required: true
graphql: "query T($status: Status!) { test(status: $status) }"
`;
		const filePath = join(testDir, "emptyenum.yaml");
		writeFileSync(filePath, yaml);

		expect(() => loadYamlTools([filePath])).toThrow("is type enum and requires a non-empty 'enum' list");
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
graphql: "query T($limit: Int!) { test(first: $limit) }"
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
graphql: "query T($limit: Int) { test(first: $limit) }"
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

/**
 * `array` and `object`, added in 0.8.0.
 *
 * These exist because a YAML tool could not express a list at all: the switch in
 * convertInputType fell through to z.string(), so `type: array` failed at call time with
 * "Expected string, received array", and leaving the field undeclared was worse — z.object()
 * strips unknown keys, so the argument silently never reached the API. The motivating tool is a
 * partial fulfillment, where the list says which lines go in the parcel.
 */
describe("array and object input types", () => {
	function load(yaml: string) {
		const filePath = join(testDir, "arr.yaml");
		writeFileSync(filePath, yaml);
		return z.object(loadYamlTools([filePath])[0].input);
	}

	const lineItemsYaml = `
name: create_fulfillment
domain: orders
description: Fulfil selected lines
scopes: []
input:
  line_items:
    type: array
    required: false
    min: 1
    items:
      type: object
      properties:
        id:
          type: string
          required: true
        quantity:
          type: number
          required: true
graphql: "mutation M($line_items: [LineInput!]) { test(lines: $line_items) }"
`;

	it("accepts a list of objects", () => {
		const schema = load(lineItemsYaml);
		const result = schema.safeParse({
			line_items: [
				{ id: "gid://shopify/FulfillmentOrderLineItem/1", quantity: 2 },
				{ id: "gid://shopify/FulfillmentOrderLineItem/2", quantity: 1 },
			],
		});
		expect(result.success).toBe(true);
	});

	it("rejects an element missing a required property", () => {
		const schema = load(lineItemsYaml);
		const result = schema.safeParse({ line_items: [{ id: "gid://x/1" }] });
		expect(result.success).toBe(false);
		// The path names the element and the field, which is what makes a bad call fixable.
		expect(result.error?.issues[0].path).toEqual(["line_items", 0, "quantity"]);
	});

	it("rejects a scalar where a list is declared", () => {
		// The old behaviour in reverse: before 0.8.0 this schema WAS a string, so a list was the
		// thing rejected.
		const schema = load(lineItemsYaml);
		expect(schema.safeParse({ line_items: "not-a-list" }).success).toBe(false);
	});

	it("treats min/max on an array as an element count", () => {
		// An empty list must be rejectable. For a partial fulfillment an ABSENT list means
		// "everything", so silently accepting [] would ship the whole order.
		const schema = load(lineItemsYaml);
		expect(schema.safeParse({ line_items: [] }).success).toBe(false);
	});

	it("leaves an optional array absent rather than defaulting it", () => {
		const schema = load(lineItemsYaml);
		const result = schema.parse({});
		expect(result.line_items).toBeUndefined();
		expect("line_items" in result).toBe(false);
	});

	it("strips a key the object does not declare", () => {
		// The useful default for a GraphQL input object: a field the API does not declare would
		// be rejected by it anyway.
		const schema = load(lineItemsYaml);
		const parsed = schema.parse({
			line_items: [{ id: "gid://x/1", quantity: 1, sneaky: "drop me" }],
		});
		expect(parsed.line_items?.[0]).toEqual({ id: "gid://x/1", quantity: 1 });
	});

	it("requires every element, so a null cannot sit in the list", () => {
		// A GraphQL list is [X!]. An optional element schema would let [null] through.
		const schema = load(lineItemsYaml);
		expect(schema.safeParse({ line_items: [null] }).success).toBe(false);
	});

	it("supports an array of scalars", () => {
		const schema = load(
			`
name: tag_tool
domain: test
description: Test
scopes: []
input:
  tags:
    type: array
    required: true
    items:
      type: string
graphql: "mutation M($tags: [String!]!) { test(tags: $tags) }"
`,
		);
		expect(schema.safeParse({ tags: ["a", "b"] }).success).toBe(true);
		expect(schema.safeParse({ tags: [1] }).success).toBe(false);
	});

	it("rejects an array declared without items", () => {
		const filePath = join(testDir, "noitems.yaml");
		writeFileSync(
			filePath,
			`
name: bad_array
domain: test
description: Test
scopes: []
input:
  things:
    type: array
    required: true
graphql: "query T($things: [String!]!) { test(things: $things) }"
`,
		);
		expect(() => loadYamlTools([filePath])).toThrow("is type array and requires an 'items' declaration");
	});

	it("rejects an object declared without properties", () => {
		const filePath = join(testDir, "noprops.yaml");
		writeFileSync(
			filePath,
			`
name: bad_object
domain: test
description: Test
scopes: []
input:
  thing:
    type: object
    required: true
graphql: "query T($thing: ThingInput!) { test(thing: $thing) }"
`,
		);
		expect(() => loadYamlTools([filePath])).toThrow("is type object and requires a 'properties' declaration");
	});
});

/**
 * An unrecognised `type:` is refused, added in 0.9.0.
 *
 * Until 0.9.0 the switch in convertInputType ended in `default: z.string()`, so anything it did
 * not implement quietly became a string. That is the mechanism behind every symptom in the block
 * above: `type: array` was accepted by the loader and only failed when somebody called the tool,
 * with an error that blamed the caller's argument rather than the declaration.
 */
describe("unrecognised input types are refused at load, not at call time", () => {
	function write(yaml: string, file = "bad-type.yaml") {
		const filePath = join(testDir, file);
		writeFileSync(filePath, yaml);
		return filePath;
	}

	it("refuses a type the loader does not implement", () => {
		const filePath = write(`
name: bad_type
domain: test
description: Test
scopes: []
input:
  count:
    type: integer
    required: true
graphql: "query T($count: Int!) { test(count: $count) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow('input "count" has unknown type "integer"');
	});

	it("lists the types that are valid, so the fix does not need the source", () => {
		const filePath = write(`
name: bad_type_list
domain: test
description: Test
scopes: []
input:
  count:
    type: integer
    required: true
graphql: "query T($count: Int!) { test(count: $count) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow("string, number, boolean, enum, array, object");
	});

	it("refuses a field with no type at all", () => {
		const filePath = write(`
name: no_type
domain: test
description: Test
scopes: []
input:
  count:
    description: how many
    required: true
graphql: "query T($count: Int!) { test(count: $count) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow(`input "count" has no 'type'`);
	});

	it("names the tool and the file, because a load failure stops the whole server", () => {
		const filePath = write(`
name: named_tool
domain: test
description: Test
scopes: []
input:
  count:
    type: integer
graphql: "query T($count: Int) { test(count: $count) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow(`YAML tool "named_tool"`);
		expect(() => loadYamlTools([filePath])).toThrow(filePath);
	});

	it("names the path to a bad type nested in an array", () => {
		const filePath = write(`
name: nested_array
domain: test
description: Test
scopes: []
input:
  lines:
    type: array
    required: true
    items:
      type: tuple
graphql: "query T($lines: [X!]!) { test(lines: $lines) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow('input "lines.items" has unknown type "tuple"');
	});

	it("names the path to a bad type nested in an object", () => {
		const filePath = write(`
name: nested_object
domain: test
description: Test
scopes: []
input:
  line:
    type: object
    required: true
    properties:
      quantity:
        type: int
graphql: "query T($line: X!) { test(line: $line) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow('input "line.quantity" has unknown type "int"');
	});

	it("no longer accepts a numeric-looking value for a mistyped number field", () => {
		// The regression this whole describe exists for: `type: integer` used to load as a string,
		// so `{ count: 5 }` was rejected at call time and `{ count: "5" }` was accepted and sent to
		// Shopify as a string. Neither outcome is visible from the YAML.
		const filePath = write(`
name: was_a_string
domain: test
description: Test
scopes: []
input:
  count:
    type: integer
    required: true
graphql: "query T($count: Int!) { test(count: $count) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow();
	});
});

/**
 * A YAML tool's `input` and its GraphQL variables must be the same set, added in 0.9.0.
 *
 * The engine runs `shopify.query(tool.graphql, validatedInput)` and nothing else, so the declared
 * input IS the variable set. Either half of a mismatch is silent at runtime, which is why it is
 * worth failing the load over. The shipped `complete_draft_order` example carried exactly this
 * defect from 0.1.0 to 0.9.0: input `payment_pending`, mutation `$paymentPending`.
 */
describe("input and GraphQL variables must be the same set", () => {
	function write(yaml: string, file = "vars.yaml") {
		const filePath = join(testDir, file);
		writeFileSync(filePath, yaml);
		return filePath;
	}

	it("refuses a variable that no input declares", () => {
		const filePath = write(`
name: undeclared_var
domain: test
description: Test
scopes: []
input:
  id:
    type: string
    required: true
graphql: "mutation M($id: ID!, $notify: Boolean) { test(id: $id, notify: $notify) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow("$notify");
		expect(() => loadYamlTools([filePath])).toThrow("nothing can ever supply them");
	});

	it("refuses an input that the query never uses", () => {
		const filePath = write(`
name: unused_input
domain: test
description: Test
scopes: []
input:
  id:
    type: string
    required: true
  notify:
    type: boolean
graphql: "mutation M($id: ID!) { test(id: $id) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow("'input' declares notify");
		expect(() => loadYamlTools([filePath])).toThrow("validated and then dropped");
	});

	it("catches the complete_draft_order defect — one typo, both halves", () => {
		// Shipped for eight minor versions. `payment_pending: true` was validated, sent under a
		// name the mutation did not use, and $paymentPending arrived null — so a draft order the
		// caller wanted left pending was completed as paid, with no error anywhere.
		const filePath = write(`
name: complete_draft_order
domain: orders
description: Test
scopes: []
input:
  id:
    type: string
    required: true
  payment_pending:
    type: boolean
graphql: "mutation M($id: ID!, $paymentPending: Boolean) { draftOrderComplete(id: $id, paymentPending: $paymentPending) { id } }"
`);
		expect(() => loadYamlTools([filePath])).toThrow("$paymentPending");
		expect(() => loadYamlTools([filePath])).toThrow("'input' declares payment_pending");
	});

	it("accepts a tool that takes no arguments at all", () => {
		const filePath = write(`
name: no_args
domain: test
description: Test
scopes: []
input: {}
graphql: "query { shop { name } }"
`);
		expect(loadYamlTools([filePath])).toHaveLength(1);
	});

	it("does not read a $ inside a string literal as a variable", () => {
		// Shopify search syntax puts a $ in a quoted query. Treating it as a variable would refuse
		// a correct tool, which is worse than the defect being fixed.
		const filePath = write(`
name: string_dollar
domain: test
description: Test
scopes: []
input:
  first:
    type: number
    required: true
graphql: "query T($first: Int!) { products(first: $first, query: \\"price:>$100\\") { edges { node { id } } } }"
`);
		expect(loadYamlTools([filePath])).toHaveLength(1);
	});

	it("does not read a $ inside a comment as a variable", () => {
		const filePath = write(`
name: comment_dollar
domain: test
description: Test
scopes: []
input:
  first:
    type: number
    required: true
graphql: |
  # $limit was renamed to $first in 2024-10
  query T($first: Int!) {
    products(first: $first) { edges { node { id } } }
  }
`);
		expect(loadYamlTools([filePath])).toHaveLength(1);
	});

	it("does not read a $ inside a block string as a variable", () => {
		const filePath = write(`
name: block_dollar
domain: test
description: Test
scopes: []
input:
  first:
    type: number
    required: true
graphql: |
  query T($first: Int!) {
    """
    Historic note: this used to be $limit.
    """
    products(first: $first) { edges { node { id } } }
  }
`);
		expect(loadYamlTools([filePath])).toHaveLength(1);
	});

	it("names the tool and the file so the broken one is findable", () => {
		const filePath = write(`
name: findable
domain: test
description: Test
scopes: []
input:
  a:
    type: string
graphql: "query T($b: String) { test(b: $b) }"
`);
		expect(() => loadYamlTools([filePath])).toThrow(`YAML tool "findable"`);
		expect(() => loadYamlTools([filePath])).toThrow(filePath);
	});
});
