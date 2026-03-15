# Documentation & Showcase Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update README for star appeal (badges, updated numbers, new sections) and create a 5-page GitHub Wiki with sidebar.

**Architecture:** All changes are documentation-only. README is edited in-place preserving all existing content. Wiki pages are markdown files that will be pushed to the repo's wiki git.

**Tech Stack:** Markdown, shields.io badges, GitHub Wiki (`_Sidebar.md` convention)

---

## Task 1: README — Add Badges and Update Hero Section

**Files:**
- Modify: `README.md:1-20`

**Step 1: Replace the hero section (lines 1-7)**

Replace lines 1-7 with:

```markdown
# cob-shopify-mcp

[![npm version](https://img.shields.io/npm/v/cob-shopify-mcp?color=blue)](https://www.npmjs.com/package/cob-shopify-mcp)
[![build](https://img.shields.io/github/actions/workflow/status/svinpeace/cob-shopify-mcp/ci.yml?branch=main)](https://github.com/svinpeace/cob-shopify-mcp/actions)
[![license](https://img.shields.io/github/license/svinpeace/cob-shopify-mcp)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![tools](https://img.shields.io/badge/tools-64-orange)](https://github.com/svinpeace/cob-shopify-mcp#tools-reference)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**The most complete open-source MCP server and CLI for Shopify.** 59 built-in tools + 5 custom tools across 5 domains — use it as an MCP server for AI agents (Claude, Cursor, Windsurf) or as a standalone CLI to manage Shopify stores directly from your terminal.
```

**Step 2: Update the Features section (line 7)**

Change:
```
- **49 built-in tools + 5 example custom tools** across 5 domains (Products, Orders, Customers, Inventory, Analytics)
```
To:
```
- **59 built-in tools + 5 custom tools** across 5 domains — Products (15), Orders (12), Customers (9), Inventory (7), Analytics (16)
```

**Step 3: Add "Why cob-shopify-mcp" section after Features**

Insert after the Features bullet list (after line 20, before "## MCP vs CLI"):

```markdown
## Why cob-shopify-mcp

| | What you get |
|---|---|
| **Dual-mode** | Same 64 tools work as both CLI commands and MCP server — no competitor offers both |
| **ShopifyQL Analytics** | 16 analytics tools powered by ShopifyQL — sales summaries, cohort analysis, vendor performance, period-over-period comparison — each in a single API call |
| **82% less AI context** | Advertise-and-Activate loads 1 meta-tool instead of 59 schemas. Domains activate on demand |
| **Production-grade** | Cost-based rate limiting, query caching, retry with backoff, encrypted token storage, 600 tests |
```

**Step 4: Verify render**

Run: `head -35 README.md` — confirm badges, tagline, features, and "Why" section are present.

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): add badges, update hero section and tool counts"
```

---

## Task 2: README — Update Tool Counts Throughout

**Files:**
- Modify: `README.md` (multiple locations)

**Step 1: Find and update all "49" references**

Search for all occurrences of "49" in README.md and update:

- Line ~17 (Advertise-and-Activate feature bullet): "49 schemas" → "59 schemas"
- Line ~52: "With 49 tools" → "With 59 tools"
- Line ~54: "all 49 tool schemas" → "all 59 tool schemas"
- Line ~57: "49 tool schemas → ~16,000 tokens" → "59 tool schemas → ~19,000 tokens"
- Line ~808: "49 tools ship enabled" → "59 tools ship enabled"
- Line ~858 (comparison table): "54 (49 built-in + 5 custom)" → "64 (59 built-in + 5 custom)"

**Step 2: Update comparison table numbers**

In the comparison table (~line 858), update:
- Tools: **54** → **64** (59 built-in + 5 custom)
- Unit Tests: **573** → **600**

**Step 3: Update Advertise-and-Activate section numbers**

- "Instead of loading all 49 tool schemas" → "all 59 tool schemas"
- Token estimates: "49 tool schemas → ~16,000" → "59 tool schemas → ~19,000"
- "activates 6 analytics tools" → "activates 16 analytics tools"

**Step 4: Verify no stale "49" references remain**

Run: `grep -n "49" README.md` — should only appear in Shopify-specific content (variant IDs, etc.), not tool counts.

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): update all tool counts from 49 to 59/64"
```

---

## Task 3: README — Update Analytics and Orders Tool Reference

**Files:**
- Modify: `README.md:599-647`

**Step 1: Update Orders section header and add missing tools**

Change `### Orders (12 tools)` to `### Orders (17 tools)` (12 built-in + 5 custom YAML).

Add the 5 custom YAML tools to the orders table:

```markdown
| `cancel_order` | Cancel an order (async) | `write_orders` |
| `complete_draft_order` | Complete draft to real order | `write_draft_orders` |
| `get_fulfillment_orders` | Get fulfillment order IDs | `read_assigned_fulfillment_orders` |
| `create_fulfillment` | Create fulfillment with tracking | `write_assigned_fulfillment_orders` |
| `update_fulfillment_tracking` | Update tracking info | `write_assigned_fulfillment_orders` |
```

**Step 2: Update Analytics section**

Change `### Analytics (6 tools)` to `### Analytics (16 tools)`.

Replace the analytics table with the full 16-tool list:

```markdown
### Analytics (16 tools)

*All analytics tools use ShopifyQL — single API call per query, no cursor pagination.*

| Tool | Description | Scope |
|------|-------------|-------|
| `sales_summary` | Sales totals for date range | `read_reports` |
| `top_products` | Best sellers by revenue or orders | `read_reports` |
| `orders_by_date_range` | Orders grouped by day/week/month | `read_reports` |
| `refund_rate_summary` | Refund rate and amounts | `read_reports` |
| `repeat_customer_rate` | Repeat purchase analysis | `read_reports` |
| `sales_by_channel` | Revenue by sales channel | `read_reports` |
| `sales_by_geography` | Sales by country/region | `read_reports` |
| `sales_comparison` | Period-over-period comparison | `read_reports` |
| `discount_performance` | Discount impact analysis | `read_reports` |
| `product_vendor_performance` | Revenue by vendor | `read_reports` |
| `customer_cohort_analysis` | Cohort analysis by period | `read_reports` |
| `customer_lifetime_value` | Top customers by CLV | `read_reports` |
| `conversion_funnel` | Sessions → orders funnel | `read_reports` |
| `traffic_analytics` | Session traffic over time | `read_reports` |
| `inventory_risk_report` | Over/understock risk analysis | `read_inventory`, `read_products` |
| `shopifyql_query` | Raw ShopifyQL passthrough | `read_reports` |
```

**Step 3: Update the old analytics scope references**

The old analytics tools said `read_orders` — all ShopifyQL tools now use `read_reports`. Verify the updated table has correct scopes.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): update orders (17 tools) and analytics (16 tools) reference"
```

---

## Task 4: README — Update Architecture Mermaid Diagram

**Files:**
- Modify: `README.md:690-780` (mermaid diagram)

**Step 1: Update the tool domain labels in the mermaid diagram**

In the SHOPIFY subgraph, update the TOOLS section to show correct counts. Find the lines referencing tool domains and update:

- Products: 15 tools
- Orders: 12+5 tools (or just "17")
- Customers: 9 tools
- Inventory: 7 tools
- Analytics: 16 tools (ShopifyQL)

Look for lines like:
```
TOOLS["Tools (49 built-in)"]
```
and update to:
```
TOOLS["Tools (59 built-in + 5 custom)"]
```

**Step 2: Verify mermaid renders**

The mermaid diagram should render correctly on GitHub. Check that the subgraph labels match the new numbers.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): update architecture diagram tool counts"
```

---

## Task 5: GitHub Wiki — Create All Pages

**Files:**
- Create: `wiki/Home.md`
- Create: `wiki/Getting-Started.md`
- Create: `wiki/Tool-Reference.md`
- Create: `wiki/Configuration-and-Auth.md`
- Create: `wiki/Roadmap-and-FAQ.md`
- Create: `wiki/_Sidebar.md`

We create these files locally in a `wiki/` directory first, then push to the wiki git repo.

**Step 1: Create wiki/ directory**

```bash
mkdir -p wiki
```

**Step 2: Create `wiki/_Sidebar.md`**

```markdown
**[Home](Home)**

---

**Getting Started**
- [Installation](Getting-Started#installation)
- [Shopify Credentials](Getting-Started#shopify-credentials)
- [First CLI Command](Getting-Started#first-cli-command)
- [Connect to MCP](Getting-Started#connect-to-mcp)

**Reference**
- [Tool Reference](Tool-Reference)
- [Configuration & Auth](Configuration-and-Auth)

**Project**
- [Roadmap & FAQ](Roadmap-and-FAQ)
- [Changelog](https://github.com/svinpeace/cob-shopify-mcp/blob/main/CHANGELOG.md)
```

**Step 3: Create `wiki/Home.md`**

```markdown
# cob-shopify-mcp

**The most complete open-source MCP server and CLI for Shopify.**

59 built-in tools + 5 custom tools across 5 domains. Use it as an MCP server for AI agents (Claude, Cursor, Windsurf) or as a standalone CLI — same tools, same engine, same auth.

## Highlights

- **64 tools** across Products (15), Orders (17), Customers (9), Inventory (7), Analytics (16)
- **Dual-mode** — CLI commands + MCP server from one install
- **ShopifyQL Analytics** — 16 analytics tools, single API call each
- **Advertise-and-Activate** — 82% MCP context token reduction
- **Production-grade** — cost-based rate limiting, query caching, retry, encrypted storage, 600 tests

## Quick Install

```bash
npm install -g cob-shopify-mcp
```

## Pages

| Page | Description |
|------|-------------|
| **[Getting Started](Getting-Started)** | Install, configure credentials, first commands |
| **[Tool Reference](Tool-Reference)** | All 64 tools with params and examples |
| **[Configuration & Auth](Configuration-and-Auth)** | YAML config, env vars, auth methods |
| **[Roadmap & FAQ](Roadmap-and-FAQ)** | What's next + common questions |
```

**Step 4: Create `wiki/Getting-Started.md`**

Content should cover:
- Installation (npm, Docker)
- Getting Shopify credentials (step-by-step — abbreviated from README)
- First CLI command (`cob-shopify products list --limit 3`)
- Connect to MCP (`claude mcp add cob-shopify-mcp -- npx cob-shopify-mcp start`)
- Verify with `/mcp`

**Step 5: Create `wiki/Tool-Reference.md`**

Content: All 64 tools organized by domain. Each tool gets:
- Name, description, scope
- CLI example: `cob-shopify <domain> <action> --flags`
- MCP note: same params as JSON

Group by domain: Products (15), Orders (17), Customers (9), Inventory (7), Analytics (16).

**Step 6: Create `wiki/Configuration-and-Auth.md`**

Content:
- Full YAML config reference with all options and defaults
- Environment variables table
- Auth methods explained (static token, client credentials, authorization code)
- Config precedence (CLI flags > env vars > config file > defaults)
- read_only mode, tool enable/disable, custom tool paths

**Step 7: Create `wiki/Roadmap-and-FAQ.md`**

Content:

Roadmap section:
| Version | Theme | Key Features |
|---|---|---|
| v0.7.0 | Smart Caching & Cost Optimization | Write-through invalidation, request batching, cost budget CLI dashboard |
| v0.8.0 | Metafields & Discounts | Metafields CRUD, discount management, tier 2 tools |
| v0.9.0 | Webhooks & Real-time | Webhook subscriptions, event receiver, automation recipes |
| v1.0.0 | Production Hardening | Multi-store, full API coverage, plugin system |
| v2.0.0 | Hosted MCP-as-a-Service | Multi-tenant hosting, browser OAuth, admin dashboard |

FAQ section:
- What scopes do I need?
- How does rate limiting work?
- Can I add custom tools?
- What's Advertise-and-Activate?
- CLI vs MCP — when to use which?
- How do I run it in Docker?

**Step 8: Commit all wiki files**

```bash
git add wiki/
git commit -m "docs: create GitHub Wiki pages (5 pages + sidebar)"
```

---

## Task 6: Push Wiki to GitHub

**Step 1: Push main branch (README changes)**

```bash
git push origin main
```

**Step 2: Clone the wiki repo and push pages**

```bash
git clone https://github.com/svinpeace/cob-shopify-mcp.wiki.git /tmp/cob-wiki
cp wiki/* /tmp/cob-wiki/
cd /tmp/cob-wiki
git add .
git commit -m "docs: initial wiki — 5 pages + sidebar"
git push
```

Note: The wiki repo must be initialized first. If it doesn't exist yet, create one page via the GitHub web UI (Wiki tab → Create the first page), then clone and push.

**Step 3: Verify**

Visit `https://github.com/svinpeace/cob-shopify-mcp/wiki` and confirm all 5 pages render with sidebar navigation.

---

## Task 7: Update architecture.mmd with current tool counts

**Files:**
- Modify: `docs/assets/architecture.mmd`

**Step 1: Update tool domain counts in the mermaid source**

Find references to tool counts and domain labels. Update to reflect:
- 59 built-in + 5 custom
- Analytics: 16 tools (ShopifyQL)
- Orders: 12 built-in + 5 custom

**Step 2: Commit**

```bash
git add docs/assets/architecture.mmd
git commit -m "docs: update architecture.mmd tool counts"
```

---

## Task 8: Final verification

**Step 1: Verify README renders on GitHub**

Push and check: badges render, mermaid diagram renders, all numbers consistent.

**Step 2: Verify Wiki pages**

Check all 5 pages + sidebar navigation on GitHub Wiki tab.

**Step 3: Run tests to confirm no code was broken**

```bash
pnpm test -- --run
```

Expected: 600 tests pass.
