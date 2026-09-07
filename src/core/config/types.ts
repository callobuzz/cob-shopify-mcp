export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface CobConfig {
	auth: {
		method: "token" | "client-credentials" | "authorization-code";
		store_domain: string;
		access_token?: string;
		client_id?: string;
		client_secret?: string;
		/**
		 * A Storefront API access token, for the Storefront half of the API.
		 *
		 * Optional, and normally omitted: `StorefrontClient` mints one from these Admin
		 * credentials and reuses it. Set it when the app is not authorised for
		 * `storefrontAccessTokenCreate`, or when policy says a credential is issued by a human
		 * rather than by a program.
		 */
		storefront_access_token?: string;
	};
	shopify: {
		api_version: string;
		max_retries: number;
		cache: {
			read_ttl: number;
			search_ttl: number;
			analytics_ttl: number;
		};
	};
	tools: {
		read_only: boolean;
		disable: string[];
		enable: string[];
		custom_paths: string[];
		advertise_and_activate: boolean;
	};
	transport: {
		type: "stdio" | "http";
		port: number;
		host: string;
	};
	storage: {
		backend: "json" | "sqlite";
		path: string;
		encrypt_tokens: boolean;
	};
	observability: {
		log_level: "debug" | "info" | "warn" | "error";
		audit_log: boolean;
		metrics: boolean;
	};
	rate_limit: {
		respect_shopify_cost: boolean;
		max_concurrent: number;
	};
}
