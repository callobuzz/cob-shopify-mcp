/**
 * Reads what the CLI needs from a Zod 4 schema: its kind, wrapped schema,
 * default, description, number bounds and enum values.
 *
 * Both converters (Commander options and --schema output) go through here,
 * so a Zod upgrade changes one file.
 */

import type { ZodType } from "zod";

/** Zod 4 kind name: "string", "number", "optional", "default", "enum", ... */
export function zodKind(schema: ZodType): string {
	return schema.def.type;
}

/** The schema wrapped by an optional/default, or undefined for any other kind. */
export function zodInner(schema: ZodType): ZodType | undefined {
	return (schema.def as { innerType?: ZodType }).innerType;
}

/** The value a ZodDefault produces when the input is missing. */
export function zodDefaultValue(schema: ZodType): unknown {
	return (schema.def as { defaultValue?: unknown }).defaultValue;
}

/**
 * Zod 4 keeps a .describe() text on the schema it was called on and does not
 * copy it through .optional() or .default(). Callers that unwrap pass the
 * outer description down as `inherited`.
 */
export function zodDescription(schema: ZodType, inherited?: string): string | undefined {
	return schema.description ?? inherited;
}

/**
 * Bounds a user set with .min()/.max(). Zod 4 reports ±Infinity when no bound
 * is set, and .int() sets ±MAX_SAFE_INTEGER — neither is a real limit.
 */
export function zodNumberBounds(schema: ZodType): { min?: number; max?: number } {
	const { minValue, maxValue } = schema as unknown as { minValue: number | null; maxValue: number | null };
	const real = (v: number | null): v is number => v !== null && Math.abs(v) < Number.MAX_SAFE_INTEGER;
	return {
		...(real(minValue) && { min: minValue }),
		...(real(maxValue) && { max: maxValue }),
	};
}

/** The allowed values of a ZodEnum. */
export function zodEnumValues(schema: ZodType): string[] {
	return [...(schema as unknown as { options: string[] }).options];
}
