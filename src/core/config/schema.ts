import { z } from "zod";
import { checkApiVersion, unsupportedVersionAllowed } from "./api-versions.js";

/**
 * Shopify serves an unrecognized or aged-out api_version with its OLDEST supported schema
 * instead of returning an error, so a typo or a version that quietly ages out keeps working
 * for months and then breaks with no config change. Reject those here — this schema is the
 * single choke point every entry point (server and CLI) goes through.
 *
 * Non-fatal cases (a version newer than this build knows about, or one nearing its
 * support-end date) pass validation and are logged as warnings at startup instead.
 */
const apiVersionSchema = z
	.string()
	.default("2026-01")
	.superRefine((version, ctx) => {
		const check = checkApiVersion(version);
		if (check.fatal && !unsupportedVersionAllowed()) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.message });
		}
	});

export const configSchema = z.object({
	auth: z
		.object({
			method: z.enum(["token", "client-credentials", "authorization-code"]).default("token"),
			store_domain: z.string().default(""),
			access_token: z.string().optional(),
			client_id: z.string().optional(),
			client_secret: z.string().optional(),
		})
		.default({}),
	shopify: z
		.object({
			api_version: apiVersionSchema,
			max_retries: z.number().int().min(0).default(3),
			cache: z
				.object({
					read_ttl: z.number().min(0).default(30),
					search_ttl: z.number().min(0).default(10),
					analytics_ttl: z.number().min(0).default(300),
				})
				.default({}),
		})
		.default({}),
	tools: z
		.object({
			read_only: z.boolean().default(false),
			disable: z.array(z.string()).default([]),
			enable: z.array(z.string()).default([]),
			custom_paths: z.array(z.string()).default([]),
			advertise_and_activate: z.boolean().default(false),
		})
		.default({}),
	transport: z
		.object({
			type: z.enum(["stdio", "http"]).default("stdio"),
			port: z.number().int().min(1).max(65535).default(3000),
			host: z.string().default("0.0.0.0"),
		})
		.default({}),
	storage: z
		.object({
			backend: z.enum(["json", "sqlite"]).default("json"),
			path: z.string().default("~/.cob-shopify-mcp/"),
			encrypt_tokens: z.boolean().default(false),
		})
		.default({}),
	observability: z
		.object({
			log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
			audit_log: z.boolean().default(true),
			metrics: z.boolean().default(false),
		})
		.default({}),
	rate_limit: z
		.object({
			respect_shopify_cost: z.boolean().default(true),
			max_concurrent: z.number().int().min(1).default(10),
		})
		.default({}),
});

export type InferredCobConfig = z.infer<typeof configSchema>;
