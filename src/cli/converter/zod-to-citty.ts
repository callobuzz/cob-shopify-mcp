import type { ZodType } from "zod";
import {
	zodDefaultValue,
	zodDescription,
	zodEnumValues,
	zodInner,
	zodKind,
	zodNumberBounds,
} from "./zod-introspect.js";

export interface CittyArgDef {
	type: "string" | "boolean";
	description?: string;
	required?: boolean;
	default?: unknown;
}

export interface JsonSchemaField {
	type: string;
	min?: number;
	max?: number;
	default?: unknown;
	enum?: string[];
	required: boolean;
}

/**
 * Converts a record of Zod schemas to citty argument definitions.
 * citty only supports "string" and "boolean" types — numbers become strings.
 */
export function zodToCittyArgs(input: Record<string, ZodType>): Record<string, CittyArgDef> {
	const result: Record<string, CittyArgDef> = {};

	for (const [key, schema] of Object.entries(input)) {
		result[key] = convertToCitty(schema);
	}

	return result;
}

/**
 * Serializes Zod schemas to JSON schema objects for --describe output.
 */
export function zodToJsonSchema(input: Record<string, ZodType>): Record<string, JsonSchemaField> {
	const result: Record<string, JsonSchemaField> = {};

	for (const [key, schema] of Object.entries(input)) {
		result[key] = convertToJsonSchema(schema);
	}

	return result;
}

function convertToCitty(schema: ZodType, inherited?: string): CittyArgDef {
	const kind = zodKind(schema);
	const description = zodDescription(schema, inherited);
	const inner = zodInner(schema);

	if (kind === "optional" && inner) {
		return { ...convertToCitty(inner, description), required: false };
	}

	if (kind === "default" && inner) {
		return { ...convertToCitty(inner, description), required: false, default: zodDefaultValue(schema) };
	}

	if (kind === "string") {
		return { type: "string", ...(description && { description }), required: true };
	}

	if (kind === "number") {
		const parts: string[] = [];
		if (description) parts.push(description);
		const { min, max } = zodNumberBounds(schema);
		if (min !== undefined) parts.push(`min: ${min}`);
		if (max !== undefined) parts.push(`max: ${max}`);
		const desc = parts.length > 0 ? parts.join(", ") : undefined;
		return { type: "string", ...(desc && { description: desc }), required: true };
	}

	if (kind === "boolean") {
		return { type: "boolean", ...(description && { description }), required: true };
	}

	if (kind === "enum") {
		const values = zodEnumValues(schema);
		const desc = description ? `${description} (${values.join(", ")})` : `One of: ${values.join(", ")}`;
		return { type: "string", description: desc, required: true };
	}

	// Fallback
	return { type: "string", ...(description && { description }), required: true };
}

function convertToJsonSchema(schema: ZodType): JsonSchemaField {
	const kind = zodKind(schema);
	const inner = zodInner(schema);

	if (kind === "optional" && inner) {
		return { ...convertToJsonSchema(inner), required: false };
	}

	if (kind === "default" && inner) {
		return { ...convertToJsonSchema(inner), required: false, default: zodDefaultValue(schema) };
	}

	if (kind === "string") {
		return { type: "string", required: true };
	}

	if (kind === "number") {
		return { type: "number", ...zodNumberBounds(schema), required: true };
	}

	if (kind === "boolean") {
		return { type: "boolean", required: true };
	}

	if (kind === "enum") {
		return { type: "string", enum: zodEnumValues(schema), required: true };
	}

	if (kind === "array") {
		return { type: "array", required: true };
	}

	if (kind === "object") {
		return { type: "object", required: true };
	}

	return { type: "string", required: true };
}
