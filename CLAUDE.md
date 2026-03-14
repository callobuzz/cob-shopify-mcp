# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**cob-shopify-mcp** — the definitive open-source MCP server for Shopify. Bridges AI systems (LLM agents, chatbots, automation pipelines) to the entire Shopify Admin GraphQL API through the Model Context Protocol.

**Package:** `cob-shopify-mcp` on npm
**Changelog:** `CHANGELOG.md` — maintained with every release, follows [Keep a Changelog](https://keepachangelog.com/) format
**Design Doc:** `docs/plans/2026-03-14-architecture-design.md`
**Ideation PRDs (brainstorming only, not specs):** `docs/idea_prd*.md`

## Architecture: Core + Shell

```
src/
├── core/                   # Generic MCP engine (API-agnostic, reusable)
│   ├── engine/             # Tool, Resource, Prompt engines
│   ├── registry/           # Barrel-based registration, config filter, plugin loader
│   ├── helpers/            # defineTool(), defineResource(), definePrompt()
│   ├── transport/          # stdio + Streamable HTTP
│   ├── auth/               # Auth provider interface
│   ├── storage/            # JSON + SQLite backends
│   ├── config/             # Config schema (Zod) + loader
│   └── observability/      # pino logger, audit trail, metrics
│
├── shopify/                # Shopify-specific shell
│   ├── client/             # @shopify/admin-api-client, rate limiter, cache, retry
│   ├── tools/              # Co-located: *.tool.ts + *.graphql + *.test.ts
│   │   ├── products/       # 15 tools
│   │   ├── orders/         # 12 tools
│   │   ├── customers/      # 9 tools
│   │   ├── inventory/      # 7 tools
│   │   ├── analytics/      # 6 tools
│   │   └── _disabled/      # Tier 2 (billing, payments, themes, etc.)
│   ├── resources/          # MCP resources
│   ├── prompts/            # MCP prompt templates
│   └── defaults.config.yaml
│
├── server/                 # Wires core + shopify, creates McpServer
├── cli/                    # CLI commands (Commander)
└── index.ts
```

**Key rule:** `core/` must NEVER import from `shopify/`. Shopify is a shell plugged into the generic core.

## Tech Stack

| Component | Choice |
|---|---|
| Runtime | Node.js 22 LTS, ESM-only |
| Language | TypeScript 5.x |
| MCP SDK | `@modelcontextprotocol/sdk` v1.x |
| Shopify | `@shopify/admin-api-client` + `@shopify/shopify-api` |
| Validation | Zod v4 |
| Build | tsup |
| Test | Vitest |
| Lint/Format | Biome |
| Logger | pino |
| CLI | Commander (commander) |
| Package Manager | pnpm |

## Key Design Decisions

- **Config-driven tool engine:** Built-in tools use `defineTool()` in TypeScript (bundled). Custom tools use YAML (loaded at runtime from `custom_paths`). No filesystem auto-discovery for built-in tools — barrel exports.
- **Tier system:** Tier 1 = enabled by default (safe ops). Tier 2 = disabled by default (sensitive). Tier 3 = custom user tools (enabled). Config precedence: `read_only` > `disable` > `enable` > tier defaults.
- **Full Shopify API coverage:** All Admin GraphQL API operations as tools. Safe ones active, sensitive ones shipped but disabled.
- **Three auth strategies:** Static token, OAuth client credentials (recommended), OAuth authorization code. Auto-detected from config.
- **Two storage backends:** JSON files (default, zero deps) + SQLite with AES-256-GCM token encryption.
- **Two transports:** stdio (default, local) + Streamable HTTP (remote/hosted).
- **Cost-based rate limiting:** Reads Shopify's point-based throttle from response `extensions.cost`. Not simple request counting.
- **Co-located files:** Each tool = `name.tool.ts` + `name.graphql` + `name.test.ts` in the same directory.
- **Normalized responses:** Never return raw Shopify payloads. Always map edges/nodes to clean JSON.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server with hot reload
pnpm build            # Build with tsup (includes action name generation)
pnpm test             # Run tests with Vitest (573 tests)
pnpm lint             # Lint with Biome
pnpm lint:fix         # Auto-fix lint issues
pnpm generate         # Generate build-time action name map
```

## CLI Architecture

The CLI uses `cob-shopify <domain> <action> [flags]` pattern powered by Commander.

- `src/cli/converter/` — Core: `toolToCommand()`, `deriveActionName()`, `zodToCittyArgs()`, `coerceInput()`
- `src/cli/output/` — Output: formatter (TTY/JSON), field-filter, jq-filter, table renderer
- `src/cli/safety/` — Mutation guard: `--dry-run`, confirmation prompts, `--yes`
- `src/cli/domain-commands.ts` — Groups tools by domain into Commander subcommands
- `src/cli/deprecation.ts` — Deprecation warnings for old `tools run/list/info`

Global flags (`--json`, `--fields`, `--jq`, `--schema`, `--dry-run`, `--yes`) are defined on the root Commander program and accessed via `collectOptions()` in leaf command actions.

Custom YAML tools auto-register as CLI commands under their declared domain (e.g., `domain: "orders"` → `cob-shopify orders <action>`).

## Advertise-and-Activate (MCP only)

Context reduction feature — registers 1 meta-tool (`activate_tools`) instead of 49 tool schemas. AI calls `activate_tools("analytics")` to load only the domain it needs. 82% token reduction.

- **Config:** `tools.advertise_and_activate: true` (default: false)
- **Env var:** `COB_SHOPIFY_ADVERTISE_AND_ACTIVATE=true`
- **Module:** `src/core/engine/advertiser.ts` — `registerAdvertiser()`, `buildAdvertisementDescription()`, `createActivateHandler()`
- **Wiring:** `src/server/bootstrap.ts` — conditional branch based on config flag
- **Tests:** `src/core/engine/advertiser.test.ts` — 12 unit tests
- **CLI is unaffected** — CLI already loads one command at a time, no context problem

## Production Testing Procedure

**NEVER test MCP with curl or piped JSON. Always test with real Claude MCP connection.**

### Phase 1: Docker + MCP HTTP
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
curl http://127.0.0.1:3000/health   # verify {"status":"ok"}
claude mcp add --transport http shopify http://127.0.0.1:3000/mcp
```
Then ask user to `/mcp` to verify. Test all tools via real Claude tool calls across all 5 domains.

### Phase 2: npm package + MCP stdio
```bash
docker compose down
claude mcp add shopify -- npx cob-shopify-mcp start
```
Ask user to `/mcp` to verify. Test all tools again.

### Phase 3: CLI direct (no MCP)
```bash
cob-shopify products list --limit 5
cob-shopify orders list --limit 5
cob-shopify customers list --limit 5
cob-shopify inventory low-stock-report --threshold 10
cob-shopify analytics sales-summary --start_date 2026-01-01 --end_date 2026-03-15
```
Test global flags: `--json`, `--fields`, `--schema`, `--dry-run`.

## Adding a Tool

1. Create `src/shopify/tools/<domain>/<name>.tool.ts` with `defineTool()`
2. Create `src/shopify/tools/<domain>/<name>.graphql` with the GraphQL query/mutation
3. Create `src/shopify/tools/<domain>/<name>.test.ts`
4. Export from `src/shopify/tools/<domain>/index.ts` barrel
5. Auto-registered on next build
