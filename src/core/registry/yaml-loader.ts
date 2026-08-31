import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { type ZodType, z } from "zod";
import type { ToolDefinition } from "../engine/types.js";

/** Minimal logger surface so this module does not depend on pino. */
export interface YamlLoaderLogger {
	warn: (obj: Record<string, unknown>, msg: string) => void;
}

/** Every `type:` a YAML tool may declare. Anything else is a typo, and is refused. */
export const YAML_INPUT_TYPES = ["string", "number", "boolean", "enum", "array", "object"] as const;

interface YamlInputField {
	type: string;
	description?: string;
	required?: boolean;
	/** For `number`, the value bounds. For `array`, the element count. */
	min?: number;
	max?: number;
	default?: unknown;
	enum?: string[];
	/** `type: array` — the declaration every element is validated against. */
	items?: YamlInputField;
	/** `type: object` — the declaration for each property. */
	properties?: Record<string, YamlInputField>;
}

interface YamlToolDef {
	name?: string;
	domain?: string;
	description?: string;
	scopes?: string[];
	input?: Record<string, YamlInputField>;
	graphql?: string;
	response?: { mapping?: string };
}

/**
 * Turn one YAML input declaration into a zod schema.
 *
 * This switch is the whole of what a YAML tool can express, and it is strictly narrower than
 * what the engine can run: a built-in declares zod directly and may take any shape at all, so a
 * type missing from here is a limit of the AUTHORING FORMAT, not of the tool system.
 *
 * Until 0.9.0 an unrecognised type fell through to `z.string()`. That single line is why `array`
 * looked supported before it was: `type: array` loaded without complaint and then failed at call
 * time with "Expected string, received array", pointing at the caller rather than at the
 * declaration. A typo behaved the same way — `type: integer` silently became a string, and the
 * only symptom was Shopify rejecting the value much later. There is now no way to write a type
 * this loader does not implement and be told about it at call time instead of at load time.
 *
 * `where` is the path to the field being converted (`line_items.items.quantity`), so a nested
 * declaration is named in the error rather than leaving the author to find it.
 */
function convertInputType(field: YamlInputField, where: string): ZodType {
	let schema: ZodType;

	switch (field.type) {
		case "string":
			schema = z.string();
			break;
		case "number": {
			let numSchema = z.number();
			if (field.min !== undefined) numSchema = numSchema.min(field.min);
			if (field.max !== undefined) numSchema = numSchema.max(field.max);
			schema = numSchema;
			break;
		}
		case "boolean":
			schema = z.boolean();
			break;
		case "enum":
			if (!field.enum || field.enum.length === 0) {
				throw new Error(`input "${where}" is type enum and requires a non-empty 'enum' list`);
			}
			schema = z.enum(field.enum as [string, ...string[]]);
			break;
		case "array": {
			if (!field.items) {
				throw new Error(`input "${where}" is type array and requires an 'items' declaration`);
			}
			// Elements are always required. A GraphQL list is `[X!]`, so an optional element
			// schema would let `[null]` through to the API as a valid entry.
			let arraySchema = z.array(convertInputType({ ...field.items, required: true }, `${where}.items`));
			if (field.min !== undefined) arraySchema = arraySchema.min(field.min);
			if (field.max !== undefined) arraySchema = arraySchema.max(field.max);
			schema = arraySchema;
			break;
		}
		case "object": {
			if (!field.properties) {
				throw new Error(`input "${where}" is type object and requires a 'properties' declaration`);
			}
			const shape: Record<string, ZodType> = {};
			for (const [key, prop] of Object.entries(field.properties)) {
				shape[key] = convertInputType(prop, `${where}.${key}`);
			}
			// Unknown keys are stripped, which is the useful default for a GraphQL input object:
			// a field the API does not declare would be rejected by it anyway.
			schema = z.object(shape);
			break;
		}
		default:
			throw new Error(
				field.type === undefined
					? `input "${where}" has no 'type'. Declare one of: ${YAML_INPUT_TYPES.join(", ")}`
					: `input "${where}" has unknown type "${field.type}". Valid types: ${YAML_INPUT_TYPES.join(", ")}`,
			);
	}

	if (!field.required && field.default === undefined) {
		schema = schema.optional() as unknown as ZodType;
	}

	if (field.default !== undefined) {
		schema = schema.default(field.default) as unknown as ZodType;
	}

	return schema;
}

/**
 * Remove string literals and comments from a GraphQL document.
 *
 * Only so `$` inside prose is not mistaken for a variable: `search(query: "price:>$100")` and
 * `# defaults to $shop` both contain a `$name` that is not a variable reference.
 */
function stripStringsAndComments(src: string): string {
	let out = "";
	let i = 0;

	while (i < src.length) {
		if (src[i] === "#") {
			while (i < src.length && src[i] !== "\n") i++;
			continue;
		}
		if (src.startsWith('"""', i)) {
			const end = src.indexOf('"""', i + 3);
			i = end === -1 ? src.length : end + 3;
			continue;
		}
		if (src[i] === '"') {
			i++;
			while (i < src.length && src[i] !== '"') {
				if (src[i] === "\\") i++;
				i++;
			}
			i++;
			continue;
		}
		out += src[i];
		i++;
	}

	return out;
}

/**
 * Refuse a tool whose `input` and GraphQL variables disagree.
 *
 * A YAML tool has no handler: the engine calls `shopify.query(tool.graphql, validatedInput)`, so
 * the declared input IS the variable set, exactly and in both directions. Either half of a
 * mismatch is silent at runtime, which is what makes it worth failing the load over:
 *
 *   - a variable no input declares can never be supplied, and GraphQL reads an absent optional
 *     variable as "not specified" — for a partial fulfillment that means fulfil everything;
 *   - an input no variable uses is validated and then dropped, so the tool advertises a parameter
 *     it ignores.
 *
 * One typo produces both. `complete_draft_order` shipped with `payment_pending` in its input and
 * `$paymentPending` in its mutation, so asking for a pending payment completed the draft order as
 * paid instead — with no error anywhere.
 */
function assertVariablesMatchInput(toolName: string, filePath: string, graphql: string, declared: string[]): void {
	const used = new Set<string>();
	for (const match of stripStringsAndComments(graphql).matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) {
		used.add(match[1]);
	}

	const undeclared = [...used].filter((v) => !declared.includes(v)).sort();
	const unused = declared.filter((k) => !used.has(k)).sort();
	if (undeclared.length === 0 && unused.length === 0) return;

	const problems: string[] = [];
	if (undeclared.length > 0) {
		problems.push(
			`the query uses ${undeclared.map((v) => `$${v}`).join(", ")}, which 'input' does not declare, ` +
				"so nothing can ever supply them",
		);
	}
	if (unused.length > 0) {
		problems.push(
			`'input' declares ${unused.join(", ")}, which the query never uses, ` +
				"so the value is validated and then dropped",
		);
	}

	throw new Error(`YAML tool "${toolName}" at "${filePath}": ${problems.join("; ")}`);
}

function parseYamlTool(content: string, filePath: string): ToolDefinition {
	const raw = parseYaml(content) as YamlToolDef;

	if (!raw.name) {
		throw new Error(`YAML tool at "${filePath}" is missing required field: name`);
	}
	if (!raw.graphql) {
		throw new Error(`YAML tool "${raw.name}" at "${filePath}" is missing required field: graphql`);
	}
	if (!raw.domain) {
		throw new Error(`YAML tool "${raw.name}" at "${filePath}" is missing required field: domain`);
	}
	if (!raw.description) {
		throw new Error(`YAML tool "${raw.name}" at "${filePath}" is missing required field: description`);
	}

	const input: Record<string, ZodType> = {};
	if (raw.input) {
		for (const [key, field] of Object.entries(raw.input)) {
			try {
				input[key] = convertInputType(field, key);
			} catch (err) {
				throw new Error(`YAML tool "${raw.name}" at "${filePath}": ${(err as Error).message}`);
			}
		}
	}

	assertVariablesMatchInput(raw.name, filePath, raw.graphql, Object.keys(input));

	const tool: ToolDefinition = {
		name: raw.name,
		domain: raw.domain,
		tier: 3,
		description: raw.description,
		scopes: raw.scopes ?? [],
		input,
		graphql: raw.graphql,
	};

	if (raw.response?.mapping) {
		const mapping = raw.response.mapping;
		tool.response = (data: any) => {
			const parts = mapping.split(".");
			let result = data;
			for (const part of parts) {
				result = result?.[part];
			}
			return result;
		};
	}

	return tool;
}

/** One configured custom_paths entry that produced tools. */
export interface LoadedYamlPath {
	/** Path exactly as configured. */
	path: string;
	/** Absolute path it resolved to — the thing to check when the count is wrong. */
	resolvedPath: string;
	count: number;
}

/** One configured custom_paths entry that produced nothing. */
export interface SkippedYamlPath {
	path: string;
	resolvedPath: string;
	reason: string;
}

export interface YamlLoadResult {
	tools: ToolDefinition[];
	loaded: LoadedYamlPath[];
	skipped: SkippedYamlPath[];
}

/**
 * Load YAML tools and report exactly what happened per configured path.
 *
 * A missing or empty `custom_paths` entry is NOT an error — a misconfigured path must not stop
 * the server from booting — but it is never silent either. Every skipped path is returned in
 * `skipped` and, when a logger is supplied, warned about with the resolved absolute path. A
 * wrong path previously produced a healthy-looking server with zero custom tools and no symptom
 * beyond their absence.
 *
 * A path that exists but holds a BROKEN tool is the opposite case and does throw. A tool whose
 * declaration contradicts its own query would otherwise run, wrongly and quietly, for as long as
 * nobody checked its output by hand.
 */
export function loadYamlToolsDetailed(paths: string[], logger?: YamlLoaderLogger): YamlLoadResult {
	const tools: ToolDefinition[] = [];
	const loaded: LoadedYamlPath[] = [];
	const skipped: SkippedYamlPath[] = [];

	for (const p of paths) {
		const resolvedPath = resolve(p);
		const before = tools.length;

		try {
			const stat = statSync(p);
			if (stat.isDirectory()) {
				const files = readdirSync(p).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
				if (files.length === 0) {
					skipped.push({ path: p, resolvedPath, reason: "directory contains no .yaml or .yml files" });
					continue;
				}
				for (const file of files) {
					const filePath = join(p, file);
					const content = readFileSync(filePath, "utf-8");
					tools.push(parseYamlTool(content, filePath));
				}
			} else {
				const content = readFileSync(p, "utf-8");
				tools.push(parseYamlTool(content, p));
			}
		} catch (err) {
			if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
				skipped.push({ path: p, resolvedPath, reason: "path does not exist" });
				continue;
			}
			throw err;
		}

		loaded.push({ path: p, resolvedPath, count: tools.length - before });
	}

	for (const entry of skipped) {
		logger?.warn(
			{ path: entry.path, resolvedPath: entry.resolvedPath, reason: entry.reason },
			`Custom tool path skipped: ${entry.resolvedPath} — ${entry.reason}. No tools were loaded from it.`,
		);
	}

	return { tools, loaded, skipped };
}

/**
 * Load YAML tools from the configured paths.
 *
 * Thin wrapper over {@link loadYamlToolsDetailed} for callers that only need the tools.
 * Pass a logger to get a warning per skipped path.
 */
export function loadYamlTools(paths: string[], logger?: YamlLoaderLogger): ToolDefinition[] {
	return loadYamlToolsDetailed(paths, logger).tools;
}
