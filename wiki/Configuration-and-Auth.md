# Configuration and Auth

## Authentication

cob-shopify-mcp supports three authentication methods. The method is auto-detected from the credentials you provide.

### Client Credentials (recommended)

Best for production and multi-tenant setups. Uses OAuth client credentials flow.

```bash
# .env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
COB_SHOPIFY_CLIENT_ID=your-client-id
COB_SHOPIFY_CLIENT_SECRET=your-client-secret
```

Or in config:

```yaml
auth:
  method: client-credentials
  store_domain: your-store.myshopify.com
  client_id: your-client-id
  client_secret: your-client-secret
```

### Static Token

Simplest method. Use the access token generated when you install your custom app.

```bash
# .env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
```

Or in config:

```yaml
auth:
  method: token
  store_domain: your-store.myshopify.com
  access_token: shpat_xxxxxxxxxxxxxxxxxxxxx
```

### OAuth Authorization Code

For apps that need user-facing OAuth flow (browser-based consent).

```yaml
auth:
  method: authorization-code
  store_domain: your-store.myshopify.com
  client_id: your-client-id
  client_secret: your-client-secret
```

---

## Configuration File

Create `cob-shopify-mcp.config.yaml` in your project root. All fields are optional with sensible defaults.

```yaml
# Authentication
auth:
  method: token                    # token | client-credentials | authorization-code
  store_domain: ""                 # your-store.myshopify.com
  access_token: ""                 # For static token auth
  client_id: ""                    # For OAuth methods
  client_secret: ""                # For OAuth methods

# Shopify API settings
shopify:
  api_version: "2026-01"          # Shopify Admin API version
  max_retries: 3                   # Max retry attempts on failure
  cache:
    read_ttl: 30                   # Cache TTL for read operations (seconds)
    search_ttl: 10                 # Cache TTL for search operations (seconds)
    analytics_ttl: 300             # Cache TTL for analytics/ShopifyQL (seconds)

# Tool management
tools:
  read_only: false                 # Block all mutations (write operations)
  disable: []                      # List of tool names to disable
  enable: []                       # List of tool names to enable (overrides tier defaults)
  custom_paths:                    # Directories containing custom YAML tools
    - ./custom-tools
  advertise_and_activate: false    # MCP context reduction (1 meta-tool instead of 59)

# Transport
transport:
  type: stdio                      # stdio | http
  port: 3000                       # Port for HTTP transport
  host: "0.0.0.0"                  # Bind address for HTTP transport

# Storage
storage:
  backend: json                    # json | sqlite
  path: "~/.cob-shopify-mcp/"     # Storage directory
  encrypt_tokens: false            # AES-256-GCM token encryption (sqlite only)

# Rate limiting
rate_limit:
  respect_shopify_cost: true       # Use Shopify's cost-based throttle info
  max_concurrent: 10               # Max concurrent API requests

# Observability
observability:
  log_level: info                  # debug | info | warn | error
  audit_log: true                  # Log all tool executions
  metrics: false                   # Enable metrics collection
```

---

## Environment Variables

All config options can be set via environment variables. Env vars override config file values.

| Variable | Config Equivalent | Description |
|----------|-------------------|-------------|
| `SHOPIFY_STORE_DOMAIN` | `auth.store_domain` | Your Shopify store domain |
| `SHOPIFY_ACCESS_TOKEN` | `auth.access_token` | Static access token |
| `SHOPIFY_CLIENT_ID` | `auth.client_id` | OAuth client ID |
| `SHOPIFY_CLIENT_SECRET` | `auth.client_secret` | OAuth client secret |
| `COB_SHOPIFY_AUTH_METHOD` | `auth.method` | Auth method override |
| `SHOPIFY_API_VERSION` | `shopify.api_version` | Shopify API version — validated at startup, see below |
| `COB_SHOPIFY_ALLOW_UNSUPPORTED_API_VERSION` | — | Allow an aged-out `api_version` instead of failing startup (`true`/`false`) |
| `COB_SHOPIFY_READ_ONLY` | `tools.read_only` | Block all mutations (`true`/`false`) |
| `COB_SHOPIFY_ADVERTISE_AND_ACTIVATE` | `tools.advertise_and_activate` | Enable lazy tool loading (`true`/`false`) |
| `COB_SHOPIFY_TRANSPORT` | `transport.type` | Transport type (`stdio`/`http`) |
| `COB_SHOPIFY_PORT` | `transport.port` | HTTP transport port |
| `COB_SHOPIFY_LOG_LEVEL` | `observability.log_level` | Log level |
| `COB_SHOPIFY_STORAGE_BACKEND` | `storage.backend` | Storage backend (`json`/`sqlite`) |

---

## API Version Validation

Shopify releases a new Admin API version each quarter (`YYYY-01`, `-04`, `-07`, `-10`) and supports
each for 12 months.

**Shopify does not reject an unrecognized or aged-out version.** It silently serves the request
against the *oldest* version it still supports. A typo like `2026-13`, or a pinned version that
quietly ages out, therefore keeps working for months — and then starts returning different data,
with no config change and no error naming the cause.

`api_version` is validated at startup to close that gap:

| Case | Behaviour |
|---|---|
| Malformed (`2026-13`, `latest`, `""`) | **Startup fails** with the supported versions listed |
| Past end of support (`2025-01`) | **Startup fails**, naming the support-end date |
| Within 90 days of end of support | Boots, logs a `WARN` with the days remaining |
| Newer than this build's table | Boots, logs a `WARN` — never blocks a freshly released Shopify version |
| Supported | Boots silently |

To keep an aged-out version anyway — for example while a migration is in flight:

```bash
COB_SHOPIFY_ALLOW_UNSUPPORTED_API_VERSION=true
```

The support table lives in `src/core/config/api-versions.ts`.

### Tools that adapt to the version

Where Shopify has renamed a field across versions, tools pick the right name from your configured
`api_version` rather than pinning you to one era:

| Change | Affects | Behaviour |
|---|---|---|
| ShopifyQL `returns` → `sales_reversals` (renamed 2026-04, old name removed 2026-07) | `refund_rate_summary` | Queries `returns` on ≤ 2026-01 and `sales_reversals` on ≥ 2026-04 |

The rename table is in `src/shopify/client/shopifyql-fields.ts`.

**`shopifyql_query` is a raw passthrough** — queries you write are sent verbatim and are *not*
rewritten. If you hand-write ShopifyQL against `returns`, `net_returns`, `quantity_returned` or the
other renamed columns, update them yourself before moving to 2026-07 or later.

---

## Config Precedence

Configuration is resolved in this order (highest priority first):

1. **CLI flags** (`--json`, `--dry-run`, `--yes`, etc.)
2. **Environment variables** (`SHOPIFY_STORE_DOMAIN`, `COB_SHOPIFY_*`)
3. **Config file** (`cob-shopify-mcp.config.yaml`)
4. **Built-in defaults**

---

## Tool Management

### Read-Only Mode

Block all mutation (write) operations. Only read/search/list tools will execute.

```yaml
tools:
  read_only: true
```

Or via env:

```bash
COB_SHOPIFY_READ_ONLY=true
```

### Enable/Disable Specific Tools

```yaml
tools:
  disable:
    - create_product         # Disable product creation
    - cancel_order           # Disable order cancellation
  enable:
    - create_fulfillment     # Force-enable a tier 2 tool
```

### Tier System

Tools are organized into tiers that control their default activation:

| Tier | Default | Description |
|------|---------|-------------|
| **Tier 1** | Enabled | Safe read operations (list, get, search) |
| **Tier 2** | Disabled | Sensitive operations (billing, payments, themes) |
| **Tier 3** | Enabled | Custom user-defined YAML tools |

**Config precedence for tool activation:** `read_only` > `disable` > `enable` > tier defaults.

### Custom YAML Tools

Add your own tools without writing TypeScript. Create YAML files and point the config at the directory:

```yaml
tools:
  custom_paths:
    - ./custom-tools
    - /absolute/path/to/more-tools
```

Each YAML file defines a tool with name, domain, description, scopes, input schema, GraphQL query/mutation, and response mapping. See `custom-tools/` in the repo for examples.

### Advertise-and-Activate (MCP only)

For AI agents, reduces context window usage by registering a single `activate_tools` meta-tool instead of all 59 tool schemas. The AI calls `activate_tools("analytics")` to load only the tools it needs for the current task.

```yaml
tools:
  advertise_and_activate: true
```

This achieves an 82% reduction in initial token usage. Does not affect CLI behavior.
