# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.5] - 2026-05-25

### Security
- Fix fast-uri path traversal via percent-encoded dot segments (High) — upgraded to 3.1.2
- Fix fast-uri host confusion via percent-encoded authority delimiters (High) — upgraded to 3.1.2
- Fix Hono `bodyLimit()` bypass for chunked/unknown-length requests (Moderate) — upgraded to 4.12.22
- Fix Hono cache middleware ignoring `Vary: Authorization/Cookie` leading to cross-user cache leakage (Moderate) — upgraded to 4.12.22
- Fix Hono JSX unvalidated tag names allowing HTML injection (Moderate) — upgraded to 4.12.22
- Fix Hono CSS declaration injection via style object values in JSX SSR (Moderate) — upgraded to 4.12.22
- Fix Hono improper validation of NumericDate claims in JWT `verify()` (Low) — upgraded to 4.12.22
- Fix qs remotely triggerable DoS via `stringify` crash on null/undefined entries (Moderate) — upgraded to 6.15.2
- Fix ip-address XSS in Address6 HTML-emitting methods (Moderate) — upgraded to 10.2.0

### Changed
- Update `pnpm.overrides` for hono (>=4.12.22), add fast-uri (>=3.1.2), qs (>=6.15.2), ip-address (>=10.2.0)

## [0.6.4] - 2026-04-12

### Security
- Fix Vite `server.fs.deny` bypass with queries (High) — upgraded to 8.0.8
- Fix Vite arbitrary file read via dev server WebSocket (High) — upgraded to 8.0.8
- Fix Vite path traversal in optimized deps `.map` handling (Moderate) — upgraded to 8.0.8
- Fix Hono incorrect IP matching in `ipRestriction()` for IPv4-mapped IPv6 (Moderate) — upgraded to 4.12.12
- Fix Hono path traversal in `toSSG()` (Moderate) — upgraded to 4.12.12
- Fix Hono missing cookie name validation in `setCookie()` (Moderate) — upgraded to 4.12.12
- Fix Hono middleware bypass via repeated slashes in `serveStatic` (Moderate) — upgraded to 4.12.12
- Fix Hono non-breaking space prefix bypass in `getCookie()` (Moderate) — upgraded to 4.12.12
- Fix `@hono/node-server` middleware bypass via repeated slashes (Moderate) — upgraded to 1.19.13

### Changed
- Add `pnpm.overrides` for vite (>=8.0.8), hono (>=4.12.12), @hono/node-server (>=1.19.13)
- Add vite 8.0.8 as direct devDependency to force patched resolution

## [0.6.3] - 2026-04-06

### Security
- Fix incomplete URL validation in `connect` command — use `endsWith()` instead of `includes()` to prevent subdomain spoofing (CodeQL)
- Add least-privilege `permissions` to CI workflow (CodeQL)

## [0.6.2] - 2026-04-06

### Security
- Fix picomatch ReDoS vulnerability (CVE via extglob quantifiers) — upgraded to 4.0.4
- Fix picomatch method injection in POSIX character classes — upgraded to 4.0.4
- Fix path-to-regexp DoS via sequential optional groups — upgraded to 8.4.2
- Fix path-to-regexp ReDoS via multiple wildcards — upgraded to 8.4.2
- Fix yaml stack overflow via deeply nested collections — upgraded to 2.8.3

### Changed
- Bump `@modelcontextprotocol/sdk` from 1.27.1 to 1.29.0
- Bump `yaml` from 2.8.2 to 2.8.3
- Add `pnpm.overrides` for transitive dependency security fixes (picomatch, path-to-regexp)

## [0.6.0] - 2026-03-15

### Added
- ShopifyQL client helper (`executeShopifyQL()`) for server-side analytics
- 10 new analytics tools: sales_by_channel, sales_by_geography, sales_comparison, discount_performance, product_vendor_performance, customer_cohort_analysis, customer_lifetime_value, conversion_funnel, traffic_analytics, shopifyql_query
- Period-over-period comparison with ShopifyQL COMPARE TO
- Raw ShopifyQL passthrough tool (Tier 2, disabled by default)

### Changed
- 5 analytics tools rewritten from cursor pagination to ShopifyQL (single API call): sales_summary, top_products, orders_by_date_range, refund_rate_summary, repeat_customer_rate
- Analytics tools now require `read_reports` scope instead of `read_orders`
- Analytics domain expanded from 6 to 16 tools (59 total across all domains)

## [0.5.0] - 2026-03-15

### Added
- **Advertise-and-Activate** — 82% MCP context token reduction. Registers 1 meta-tool (`activate_tools`) instead of 49 tool schemas. AI activates only the domains it needs on demand. Enable with `tools.advertise_and_activate: true` or `COB_SHOPIFY_ADVERTISE_AND_ACTIVATE=true`.
- **CLI as Agent Tool** — AI agents (Claude Code, Cursor) can use CLI commands directly via terminal access. Zero MCP config needed. `--json` output + `--schema` discovery.
- Config flag `advertise_and_activate` with env var `COB_SHOPIFY_ADVERTISE_AND_ACTIVATE`
- Architecture HTML diagram section for Advertise-and-Activate
- 12 new unit tests for advertiser module (573 total)

### Fixed
- `z.coerce.number()` for all numeric tool inputs — MCP clients send numbers as strings over JSON-RPC
- Docker build: copy `scripts/` directory for build-time code generation
- `start` command: Commander flags (`--transport`, `--host`, `--port`) instead of broken citty delegation
- `isError` logic for partial activation (mixed valid + unknown domains)

## [0.4.0] - 2026-03-14

### Added
- **CLI redesign** — `cob-shopify <domain> <action> [flags]` pattern powered by Commander
- 49 tools across 5 domains auto-registered as CLI commands
- Global flags: `--json`, `--fields`, `--jq`, `--schema`, `--dry-run`, `--yes`
- TTY auto-detection (table for humans, JSON when piped)
- Build-time action name generation (49 pre-computed)
- Mutation safety with confirmation prompts and `--dry-run`
- Deprecation warnings on old `tools run/list/info` commands
- `cob-shopify` CLI alias alongside `cob-shopify-mcp` package name
- Prototype pollution protection in field-filter and jq-filter

### Changed
- Migrated from citty to Commander (citty had bug with bundled nested subcommand args)

## [0.3.0] - 2026-03-13

### Added
- Initial release with 49 built-in tools + 5 custom YAML tools
- MCP server with stdio and Streamable HTTP transports
- 3 auth methods: static token, OAuth client credentials, OAuth authorization code
- Cost-based rate limiting (reads Shopify's point-based throttle)
- Query caching with configurable TTL per query type
- JSON + SQLite storage backends with AES-256-GCM encryption
- 4 MCP resources (Shop info, Locations, Policies, Currencies)
- 4 MCP prompts (Health check, Sales report, Inventory risk, Support summary)
- Config-driven tool engine with 3-tier system
- Custom YAML tool support with auto-registration
- Docker multi-stage build with health checks
- pino logging, audit trail, cost tracking
