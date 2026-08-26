# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.1] - 2026-08-26

### Fixed
- `prepublishOnly` builds before packing. `dist/` is git-ignored and was built by hand, so nothing
  tied the published bundle to the tagged source — a manual `npm publish` could ship a stale `dist/`
  that silently disagreed with the release it claimed to be.
- Source maps are no longer published. `dist/**/*.map` was 940 kB of a 1.6 MB unpacked package;
  excluding it cuts the tarball from 315 kB to 128 kB. Maps are still generated for local debugging.

## [0.7.0] - 2026-08-26

### Added
- **Fulfillment tools are now built in** — `get_fulfillment_orders`, `create_fulfillment` and
  `update_fulfillment_tracking` moved from `custom-tools/*.yaml` into `src/shopify/tools/orders/`.
  They previously existed only as YAML examples, so calling them by name returned "tool not found"
  unless a consumer copied the YAML into their own `custom_paths`. There was no built-in way to mark
  an order fulfilled or attach tracking. Built-in tool count: 59 → 62.
- `api_version` is validated against the known Shopify support windows
  (`src/core/config/api-versions.ts`). A malformed or aged-out version now fails startup with a
  message naming the cause; a version nearing end of support, or newer than this build's table, boots
  with a warning. Shopify silently serves unrecognized versions with its *oldest* supported schema,
  so this class of misconfiguration previously survived for months and then broke with no config
  change. `COB_SHOPIFY_ALLOW_UNSUPPORTED_API_VERSION=true` overrides the hard failure.
- `loadYamlToolsDetailed()` reports per-path load counts and skipped paths. The startup log line now
  includes `builtInTools`, `customTools`, resolved `customToolPaths` with per-path counts,
  `customToolPathsSkipped` with reasons, and `apiVersion`.
- **ShopifyQL rate limiting is now understood and handled.** Analytics requests are billed against
  a second allowance, `extensions.shopifyqlCost`, that is separate from the familiar
  `extensions.cost` leaky bucket: it has no restore rate and resets in full at a window boundary
  (observed: one minute). It was not tracked at all, and the resulting throttle — a `THROTTLED`
  GraphQL error inside an **HTTP 200** — was raised *outside* the retry wrapper, so it could never
  be retried and surfaced as a bare "Rate limited. Please retry later." The client now waits
  exactly until the window resets (default up to 10s, `rateLimit.maxShopifyQLWaitMs`), and past
  that fails with a message naming the reset time and why an immediate retry cannot help. It also
  warns when the allowance drops below 10%. Query cost scales steeply with the range scanned — a
  wide grouped query measured 259 points of 1000.
- `ToolDefinition.cliAction` overrides the derived CLI action name. Derivation strips the domain
  word mechanically, which turned `get_fulfillment_orders` into `cob-shopify orders
  get-fulfillment` — losing the subject and colliding visually with `get-fulfillment-status`. It is
  now `cob-shopify orders get-fulfillment-orders`.

### Changed
- `refund_rate_summary` now works on both sides of Shopify's "sales reversals" rename. Shopify
  added the ShopifyQL `sales_reversals` column in API 2026-04 and deprecated `returns`; the tool
  asks for whichever spelling the configured `api_version` serves. Verified against the live API:
  `sales_reversals` does not exist before 2026-04 (`Column Not Found`), while `returns` is still
  served through at least 2026-10 — so the constraint is at the old end, and a store pinned to
  2026-01 genuinely cannot use the new name. The full rename table lives in
  `src/shopify/client/shopifyql-fields.ts`. Result rows are read under either spelling, so a stale
  version table degrades to a correct number rather than a silent zero.
- **`refund_rate_summary` returns different fields, and a corrected refund rate.** `returns` /
  `sales_reversals` is a MONEY column (confirmed live), but the tool divided it by the *order
  count* to produce `refundRate` — dollars over orders, presented as a percentage. The rate is now
  the refunded value as a share of gross sales, and the refunded amount is taken from the column
  directly instead of being approximated as `gross - net - |discounts|`. Output is now
  `{ totalOrders, grossSales, netSales, totalRefundAmount, refundRate }`; the previous
  `returnedOrders` field is gone, since it never held an order count.
- **`conversion_funnel` returns a real funnel.** It previously reported only total sessions and
  orders, so it could not show where visitors dropped off despite its name. It now reports each
  stage from the ShopifyQL `sessions` dataset — `viewSessions`, `cartSessions`,
  `checkoutSessions`, `purchaseSessions` — with `cartRate`, `checkoutRate` and `conversionRate`
  each expressed as a share of sessions entering the funnel.
- `customer_lifetime_value` accepts optional `start_date` / `end_date`. Its query had no date
  bound at all, which measured at **610 of the 1000-point** ShopifyQL window allowance per call —
  one call could starve every other analytics tool. The same query bounded to a range costs 185.
  Omitting the dates keeps the previous all-time behaviour.
- `shopifyql_query` is now Tier 2 (disabled by default), matching what 0.6.0 documented and what
  its own test asserted. It shipped as Tier 1, so this raw passthrough — which runs any ShopifyQL
  the caller writes — was reachable by default. Re-enable with `tools.enable: ["shopifyql_query"]`
  or `COB_SHOPIFY_ENABLE=shopifyql_query`.
- `top_products` reports `productTitle` as `string | null`. Shopify returns a null title for sales
  it cannot attribute to a product, and on a real store that row can top the list; the value was
  cast to `string`, producing a `null` that claimed to be one.
- A missing or empty `custom_paths` entry still does not stop the server booting, but is no longer
  silent: each skipped path is logged as a `WARN` with its resolved absolute path, plus an additional
  warning when `custom_paths` is set and zero custom tools were loaded. Previously a wrong path — a
  Docker image that never copied the folder — produced a healthy-looking server whose only symptom
  was the absence of the expected tools.
- `cancel_order` and `complete_draft_order` remain YAML examples and are deliberately not built in.

### Fixed
- Integration tests now accept **client credentials**, the project's recommended auth method.
  `skipIfNoCredentials()` previously required `SHOPIFY_ACCESS_TOKEN`, so a store configured the
  documented way (`SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`) skipped every live test and the run
  still reported green. Detection now mirrors the config loader: an explicit access token wins,
  otherwise client credentials are used.
- `pnpm test:integration` now includes every test file, not only `*.integration.test.ts`. Live tests
  gated on `skipIfNoCredentials()` also live in plain `*.test.ts` files — all 16 analytics tools plus
  the ShopifyQL client — and since the default vitest config never loads `.env`, those 16 files could
  not run under either command. They now execute in the live run.
- Docs: `wiki/Configuration-and-Auth.md` listed `COB_SHOPIFY_API_VERSION`, `COB_SHOPIFY_CLIENT_ID`
  and `COB_SHOPIFY_CLIENT_SECRET`; the loader reads `SHOPIFY_API_VERSION`, `SHOPIFY_CLIENT_ID` and
  `SHOPIFY_CLIENT_SECRET`. The wrong names were silently ignored, leaving the defaults in place.
- Docs: the README quick-start example pinned `SHOPIFY_API_VERSION=2025-01`, which is past end of
  support.
- **JSON storage no longer loses data when writes overlap.** `setToken()` and friends are
  read-modify-write, and nothing serialized them, so concurrent calls each read the same snapshot
  and the last write won — silently dropping the others. The "atomic write" also used a fixed
  `<file>.tmp`, so two writers wrote the same temp path and both renamed it, failing with ENOENT
  (or EPERM on Windows). Overlapping token refreshes are ordinary for parallel tool calls, and JSON
  is the default backend. Writes to a file are now serialized in-process, temp names are unique per
  process and call, and a transient Windows rename error is retried.
- `pnpm test:integration` runs the live suite serially (`fileParallelism: false`). It fanned out
  across ~20 worker processes, each with its own client and rate limiter and no shared view of the
  per-store ShopifyQL allowance, so the suite throttled itself and reported tool failures that were
  really budget exhaustion.
- Config loader tests clear ambient `SHOPIFY_*` / `COB_SHOPIFY_*` variables. Env overrides file
  config by design, so any real environment — including one that loads a `.env` — defeated the
  file-precedence assertions.
- `src/cli/commands/tools/list.test.ts` imports `afterEach` instead of relying on
  `globals: true`, which is set in the unit config but not the integration one. Without it the file
  failed to load and left `process.stderr.write` patched.
- `cob-shopify --version` reports the real package version. `VERSION` in `src/index.ts` was a
  hand-maintained constant still reading `0.6.0` at package version `0.6.6`, and the test guarding
  it asserted that same literal — so the test restated the constant instead of checking it, and the
  two drifted apart across six releases. The test now compares `VERSION` against `package.json`.
- `.gitattributes` normalizes text files to LF on checkout. Sources are stored LF, but
  `core.autocrlf=true` (the Git for Windows default) rewrote them to CRLF locally, and Biome's
  formatter requires LF — so `pnpm lint` failed on Windows with format errors on files the
  contributor never touched.
- `pnpm lint` no longer inspects generated or git-ignored paths. `test-data/` and local AI-tool
  scratch directories were being format-checked and counted as lint errors.

### Security
- Resolved all 27 open dependency advisories (`pnpm audit` clean at every severity, prod and dev):
  `hono` 4.12.22 → 4.13.4, `@hono/node-server` 1.19.13 → 1.19.17, `fast-uri` 3.1.2 → 3.1.6,
  `ip-address` 10.2.0 → 10.5.0, `postcss` 8.5.15 → 8.5.26, `vite` 8.0.8 → 8.2.2,
  `body-parser` 2.2.2 → 2.3.0, `esbuild` 0.27.4 → 0.28.2, `nanoid` 3.3.12 → 3.3.18.
  All except `vite` are transitive, so they are pinned through `pnpm.overrides`.
- The `pnpm.overrides` floors are now caret ranges rather than `>=`. Each previous floor had been
  written as `>=<the version current when it was added>`, which the already-locked version kept
  satisfying — so `pnpm install` never re-resolved, and later advisories against the same package
  went unfixed while the override still *looked* like it pinned a patched version. That is why
  `hono`, `fast-uri`, `ip-address` and `postcss` were each flagged again after 0.6.5 and 0.6.6.
  Carets invalidate the stale lock entry and also stop an unattended major bump: a plain `>=` would
  now pull `fast-uri` 4.x and `@hono/node-server` 2.x underneath the MCP SDK.

## [0.6.6] - 2026-05-25

### Security
- Fix PostCSS XSS via unescaped `</style>` in CSS stringify output (Moderate) — upgraded to 8.5.15

### Changed
- Add `pnpm.overrides` for postcss (>=8.5.15)

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
