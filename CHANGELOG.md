# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
