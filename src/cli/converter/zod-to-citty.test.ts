import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToCittyArgs, zodToJsonSchema } from "./zod-to-citty.js";

describe("zodToCittyArgs", () => {
	it("converts ZodString to string arg", () => {
		const result = zodToCittyArgs({ name: z.string().describe("Product name") });
		expect(result).toEqual({
			name: { type: "string", description: "Product name", required: true },
		});
	});

	it("converts ZodNumber to string arg (citty limitation)", () => {
		const result = zodToCittyArgs({ limit: z.number().describe("Max items") });
		expect(result).toEqual({
			limit: { type: "string", description: "Max items", required: true },
		});
	});

	it("converts ZodBoolean to boolean arg", () => {
		const result = zodToCittyArgs({ active: z.boolean().describe("Is active") });
		expect(result).toEqual({
			active: { type: "boolean", description: "Is active", required: true },
		});
	});

	it("converts ZodEnum to string arg with values in description", () => {
		const result = zodToCittyArgs({ status: z.enum(["active", "draft"]).describe("Status") });
		expect(result.status.type).toBe("string");
		expect(result.status.description).toContain("active");
		expect(result.status.description).toContain("draft");
		expect(result.status.required).toBe(true);
	});

	it("converts ZodOptional to non-required arg", () => {
		const result = zodToCittyArgs({ tag: z.string().describe("Tag").optional() });
		expect(result).toEqual({
			tag: { type: "string", description: "Tag", required: false },
		});
	});

	it("converts ZodDefault to non-required arg with default", () => {
		const result = zodToCittyArgs({ limit: z.number().describe("Limit").default(10) });
		expect(result.limit.required).toBe(false);
		expect(result.limit.default).toBe(10);
	});

	it("handles multiple fields", () => {
		const result = zodToCittyArgs({
			id: z.string().describe("Product ID"),
			title: z.string().describe("Title").optional(),
			active: z.boolean().describe("Active").default(true),
		});
		expect(Object.keys(result)).toHaveLength(3);
		expect(result.id.required).toBe(true);
		expect(result.title.required).toBe(false);
		expect(result.active.required).toBe(false);
		expect(result.active.default).toBe(true);
	});

	it("handles empty input", () => {
		const result = zodToCittyArgs({});
		expect(result).toEqual({});
	});
});

describe("zodToJsonSchema", () => {
	it("converts ZodString", () => {
		const result = zodToJsonSchema({ name: z.string().describe("Name") });
		expect(result.name).toEqual({ type: "string", required: true });
	});

	it("converts ZodNumber with min/max", () => {
		const result = zodToJsonSchema({ limit: z.number().min(1).max(250).describe("Limit") });
		expect(result.limit).toEqual({ type: "number", min: 1, max: 250, required: true });
	});

	it("converts ZodBoolean", () => {
		const result = zodToJsonSchema({ active: z.boolean() });
		expect(result.active).toEqual({ type: "boolean", required: true });
	});

	it("converts ZodEnum", () => {
		const result = zodToJsonSchema({ status: z.enum(["active", "draft"]) });
		expect(result.status).toEqual({ type: "string", enum: ["active", "draft"], required: true });
	});

	it("converts ZodOptional", () => {
		const result = zodToJsonSchema({ tag: z.string().optional() });
		expect(result.tag).toEqual({ type: "string", required: false });
	});

	it("converts ZodDefault", () => {
		const result = zodToJsonSchema({ limit: z.number().default(10) });
		expect(result.limit).toEqual({ type: "number", default: 10, required: false });
	});

	it("converts ZodNumber with only min", () => {
		const result = zodToJsonSchema({ count: z.number().min(0) });
		expect(result.count).toEqual({ type: "number", min: 0, required: true });
	});

	it("handles empty input", () => {
		const result = zodToJsonSchema({});
		expect(result).toEqual({});
	});
});

// Zod 4 changed where these live; each case below broke silently during the upgrade.
describe("Zod 4 introspection", () => {
	it("keeps a description set on the optional/default wrapper", () => {
		const result = zodToCittyArgs({
			tag: z.string().optional().describe("Tag"),
			limit: z.number().default(10).describe("Limit"),
		});
		expect(result.tag).toEqual({ type: "string", description: "Tag", required: false });
		expect(result.limit).toEqual({ type: "string", description: "Limit", required: false, default: 10 });
	});

	it("does not report the safe-integer bounds of .int() as min/max", () => {
		const result = zodToJsonSchema({ count: z.number().int(), page: z.number().int().min(1) });
		expect(result.count).toEqual({ type: "number", required: true });
		expect(result.page).toEqual({ type: "number", min: 1, required: true });
	});

	it("reads bounds and default through z.coerce.number()", () => {
		const result = zodToJsonSchema({ limit: z.coerce.number().min(1).max(250).default(10) });
		expect(result.limit).toEqual({ type: "number", min: 1, max: 250, default: 10, required: false });
	});
});
