# Custom YAML Tools Guide

Add any Shopify Admin GraphQL API operation as a tool — no TypeScript, no rebuild.

## Quick Start

1. Write a `.yaml` file in this directory
2. Set `COB_SHOPIFY_CUSTOM_TOOLS=./custom-tools` in your `.env` (or config)
3. Restart the server — tool is live

## YAML Tool Structure

```yaml
name: my_tool_name              # Unique tool name (snake_case)
domain: orders                   # Domain: products, orders, customers, inventory, analytics
description: What this tool does # Clear description for AI agents
scopes:                          # Required Shopify API scopes (see scopes section below)
  - read_orders
  - read_products
input:                           # Input parameters
  order_id:
    type: string                 # string, number, boolean, enum
    description: The order GID
    required: true               # true = mandatory, false/omit = optional
  limit:
    type: number
    description: Max results
    required: false
    min: 1                       # number validation
    max: 250
    default: 10                  # default value if not provided
  status:
    type: enum                   # enum = dropdown/fixed values
    description: Filter by status
    required: false
    enum:                        # list all valid values
      - ACTIVE
      - DRAFT
      - ARCHIVED
graphql: |                       # The GraphQL query or mutation
  query MyQuery($order_id: ID!, $limit: Int) {
    order(id: $order_id) {
      id
      name
      lineItems(first: $limit) {
        edges {
          node { title quantity }
        }
      }
    }
  }
response:                        # Optional response mapping
  mapping: data.order            # Dot-path to extract from response
```

## Important Rules

### 1. Variable names must match exactly

Your `input` field names become GraphQL variables. They must match the `$variable` names in your GraphQL query.

```yaml
# Input field name = GraphQL variable name
input:
  order_id:        # → $order_id in GraphQL
    type: string

graphql: |
  query($order_id: ID!) {      # Must match input field name
    order(id: $order_id) { ... }
  }
```

### 2. Response mapping path

The Shopify client returns `{ data: { ... }, cost: { ... } }`. Your mapping must start with `data.`:

```yaml
# For a query that returns order data:
response:
  mapping: data.order              # Extracts response.data.order

# For a mutation:
response:
  mapping: data.draftOrderComplete # Extracts response.data.draftOrderComplete

# No mapping = returns the full raw response (data + cost)
```

### 3. Mutations vs Queries

**Queries** (read operations) — use `query` keyword:
```yaml
graphql: |
  query GetProduct($id: ID!) {
    product(id: $id) { id title }
  }
```

**Mutations** (write operations) — use `mutation` keyword:
```yaml
graphql: |
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }
```

### 4. Always include userErrors for mutations

Shopify mutations return `userErrors`. Always include them in your GraphQL:

```yaml
graphql: |
  mutation DoSomething($input: SomeInput!) {
    someMutation(input: $input) {
      result { id }
      userErrors {    # Always include this
        field
        message
      }
    }
  }
```

### 5. Shopify GID format

Shopify uses Global IDs like `gid://shopify/Product/12345`. Always document this in your input description:

```yaml
input:
  id:
    type: string
    description: Product GID (e.g. gid://shopify/Product/12345)
    required: true
```

### 6. Pagination with edges/nodes

Shopify GraphQL uses the Relay connection pattern. Lists return `edges > node`:

```yaml
graphql: |
  query ListProducts($limit: Int) {
    products(first: $limit) {
      edges {
        node {
          id
          title
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
```

## How to Find GraphQL Queries

1. Go to **Shopify GraphQL Admin API docs**: https://shopify.dev/docs/api/admin-graphql
2. Search for the operation you need (e.g., "productCreate", "orderCancel")
3. Check the **Arguments** section for required input types
4. Check the **Return fields** section for what you can query
5. Use the **GraphiQL explorer** on your dev store: `https://your-store.myshopify.com/admin/api/2026-01/graphql.json`

### Using Shopify's GraphiQL Explorer

1. Open your store admin: `https://your-store.myshopify.com/admin`
2. Go to Settings → Apps and sales channels → Develop apps
3. Or use the direct URL: `https://your-store.myshopify.com/admin/api/2026-01/graphql.json`
4. Test your query there first, then copy it into your YAML file

## Scopes Reference

Your YAML tool's `scopes` field declares what Shopify API scopes are needed. These must match what's configured in your app on dev.shopify.com.

### Products & Collections

| Scope | What it allows |
|-------|---------------|
| `read_products` | List, get, search products, variants, collections |
| `write_products` | Create, update, delete products, variants, tags, status |

### Orders

| Scope | What it allows |
|-------|---------------|
| `read_orders` | List, get, search orders, timeline |
| `write_orders` | Update order notes, tags, mark as paid, cancel |
| `write_draft_orders` | Create draft orders, complete draft orders |
| `read_all_orders` | Read orders older than 60 days (add this if you need historical data) |

### Customers

| Scope | What it allows |
|-------|---------------|
| `read_customers` | List, get, search customers, lifetime value |
| `write_customers` | Create, update customers, manage tags |

### Inventory

| Scope | What it allows |
|-------|---------------|
| `read_inventory` | Get inventory levels, items, SKU lookup |
| `write_inventory` | Adjust inventory, set inventory levels |
| `read_locations` | List store locations (needed for inventory tools) |

### Fulfillment

| Scope | What it allows |
|-------|---------------|
| `read_assigned_fulfillment_orders` | Read fulfillment orders for an order |
| `write_assigned_fulfillment_orders` | Create fulfillments, update tracking |

**Important:** Fulfillment also requires the **"Fulfill and ship orders"** additional permission in your app settings on dev.shopify.com. This is separate from API scopes.

### Other Scopes (for custom tools)

| Scope | What it allows |
|-------|---------------|
| `read_themes`, `write_themes` | Theme files and configurations |
| `read_discounts`, `write_discounts` | Discount codes and automatic discounts |
| `read_price_rules`, `write_price_rules` | Price rules |
| `read_marketing_events`, `write_marketing_events` | Marketing activities and events |
| `read_metaobjects`, `write_metaobjects` | Metaobjects and metafield data |
| `read_metaobject_definitions`, `write_metaobject_definitions` | Custom metaobject type definitions |
| `read_content`, `write_content` | Blog articles and pages |
| `read_gift_cards`, `write_gift_cards` | Gift cards |
| `read_returns`, `write_returns` | Returns and exchanges |
| `read_files`, `write_files` | File uploads (images, videos, etc.) |
| `read_translations`, `write_translations` | Translation resources |
| `read_markets`, `write_markets` | International markets |
| `read_locales`, `write_locales` | Locale configurations |
| `read_purchase_options`, `write_purchase_options` | Selling plans and subscriptions |
| `read_payment_terms`, `write_payment_terms` | Payment schedules and terms |
| `read_delivery_customizations`, `write_delivery_customizations` | Delivery customization rules |
| `read_payment_customizations`, `write_payment_customizations` | Payment customization rules |
| `read_store_credit_account_transactions`, `write_store_credit_account_transactions` | Store credit |
| `read_legal_policies` | Store policies (privacy, terms, etc.) |
| `read_reports` | Analytics and reporting data |
| `read_shopify_payments_disputes` | Payment disputes |
| `read_shopify_payments_payouts` | Payout information |
| `read_users` | Staff member information |

Full list: https://shopify.dev/docs/api/usage/access-scopes

### Recommended Scopes for Full Access

Paste this into your app's scopes field on dev.shopify.com:

```
read_products, write_products, read_orders, write_orders, read_all_orders, read_draft_orders, write_draft_orders, read_order_edits, write_order_edits, read_customers, write_customers, read_inventory, write_inventory, read_locations, read_fulfillments, write_fulfillments, read_assigned_fulfillment_orders, write_assigned_fulfillment_orders, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders, read_third_party_fulfillment_orders, write_third_party_fulfillment_orders, read_shipping, read_reports, read_legal_policies
```

**Important:** Also enable **"Fulfill and ship orders"** under Additional permissions on the same page.

### Read-Only Scopes

If you only want read access (set `COB_SHOPIFY_READ_ONLY=true`):

```
read_products, read_orders, read_all_orders, read_draft_orders, read_customers, read_inventory, read_locations, read_fulfillments, read_assigned_fulfillment_orders, read_merchant_managed_fulfillment_orders, read_third_party_fulfillment_orders, read_shipping, read_reports, read_legal_policies
```

## Error Handling

### Scope Errors

If your tool fails with "Access denied", it means your app is missing a required scope. The server will tell you:

```
Access denied — your app is missing required Shopify scopes.
Go to dev.shopify.com → your app → Configuration → update scopes → Release a new version.
Then reinstall the app on your store.
```

**Fix:** Add the missing scope on dev.shopify.com, release a new version, reinstall the app on your store.

### GraphQL Errors

If your GraphQL query has a syntax error, you'll see:

```
GraphQL errors: Field 'xyz' doesn't exist on type 'Product'
```

**Fix:** Check the Shopify GraphQL docs for the correct field names. Test your query in GraphiQL first.

### Variable Mismatch

If your input field names don't match the GraphQL variable names:

```
GraphQL errors: Variable $wrong_name is not defined
```

**Fix:** Make sure your `input` field names exactly match the `$variable` names in your `graphql` query.

## Example: Adding a Custom Tool Step by Step

Let's say you want a tool to get a product's metafields.

**Step 1:** Find the query in Shopify docs → https://shopify.dev/docs/api/admin-graphql/2026-01/queries/product

**Step 2:** Write the YAML:

```yaml
name: get_product_metafields
domain: products
description: Get all metafields for a product by its GID
scopes:
  - read_products
  - read_metaobjects
input:
  product_id:
    type: string
    description: Product GID (e.g. gid://shopify/Product/12345)
    required: true
  namespace:
    type: string
    description: Filter by metafield namespace
    required: false
graphql: |
  query GetProductMetafields($product_id: ID!, $namespace: String) {
    product(id: $product_id) {
      id
      title
      metafields(first: 50, namespace: $namespace) {
        edges {
          node {
            id
            namespace
            key
            value
            type
          }
        }
      }
    }
  }
response:
  mapping: data.product
```

**Step 3:** Save as `custom-tools/get-product-metafields.yaml`

**Step 4:** Restart the server. Done — tool is live.

## Enabling / Disabling Tools

### Via environment variables:

```env
# Disable specific tools (comma-separated)
COB_SHOPIFY_DISABLE=cancel_order,create_fulfillment

# Enable only specific Tier 2 tools
COB_SHOPIFY_ENABLE=some_tier2_tool

# Disable ALL write operations
COB_SHOPIFY_READ_ONLY=true
```

### Via config file (cob-shopify-mcp.yaml):

```yaml
tools:
  read_only: false
  disable:
    - cancel_order
    - create_fulfillment
  enable:
    - some_tier2_tool
  custom_paths:
    - ./custom-tools
    - /opt/my-other-tools
```

### Tier system:

- **Tier 1** — Built-in tools, enabled by default (49 tools)
- **Tier 2** — Built-in but disabled by default (sensitive operations, opt-in)
- **Tier 3** — Custom YAML tools, enabled by default

### Priority: `read_only` > `disable` > `enable` > tier defaults
