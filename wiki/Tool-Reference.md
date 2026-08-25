# Tool Reference

cob-shopify-mcp ships **64 tools** across 5 domains: 62 built-in TypeScript tools and 2 custom YAML examples.

Of the 62 built-ins, 61 are Tier 1 (enabled by default). `shopifyql_query` is Tier 2 and must be
enabled deliberately.

CLI pattern: `cob-shopify <domain> <action> [flags]`

---

## Products (15 tools)

| Tool | Description | CLI |
|------|-------------|-----|
| `list_products` | List products with filters (status, vendor, product type) | `cob-shopify products list --limit 5` |
| `get_product` | Get a product by Shopify GID with full variants and images | `cob-shopify products get --id gid://shopify/Product/123` |
| `get_product_by_handle` | Get a product by its URL handle (slug) | `cob-shopify products get-by-handle --handle my-product` |
| `search_products` | Full-text search for products by keyword | `cob-shopify products search --query "t-shirt"` |
| `create_product` | Create a product with title, description, vendor, tags | `cob-shopify products create --title "New Product"` |
| `update_product` | Update product fields (title, description, vendor, status) | `cob-shopify products update --id gid://shopify/Product/123 --title "Updated"` |
| `update_product_status` | Change product status to ACTIVE, DRAFT, or ARCHIVED | `cob-shopify products update-status --id gid://shopify/Product/123 --status ACTIVE` |
| `list_product_variants` | List variants for a product with pagination | `cob-shopify products list-variants --product_id gid://shopify/Product/123` |
| `get_product_variant` | Get a single variant by GID | `cob-shopify products get-variant --id gid://shopify/ProductVariant/456` |
| `create_product_variant` | Add a new variant to a product | `cob-shopify products create-variant --product_id gid://shopify/Product/123 --price 29.99` |
| `update_product_variant` | Update variant fields (price, SKU) | `cob-shopify products update-variant --id gid://shopify/ProductVariant/456 --price 39.99` |
| `manage_product_tags` | Add or remove tags on a product | `cob-shopify products manage-tags --id gid://shopify/Product/123 --add sale,featured` |
| `list_collections` | List collections with pagination | `cob-shopify products list-collections --limit 10` |
| `get_collection` | Get a collection by GID with its products | `cob-shopify products get-collection --id gid://shopify/Collection/789` |
| `create_collection` | Create a new collection | `cob-shopify products create-collection --title "Summer Sale"` |

---

## Orders (17 tools)

### Built-in (15 tools)

| Tool | Description | CLI |
|------|-------------|-----|
| `list_orders` | List orders with filters and pagination | `cob-shopify orders list --limit 5` |
| `get_order` | Get an order by GID with line items, fulfillments, and totals | `cob-shopify orders get --id gid://shopify/Order/123` |
| `get_order_by_name` | Get an order by its display number (e.g., "#1001") | `cob-shopify orders get-by-name --name "#1001"` |
| `search_orders` | Search orders by keyword or status | `cob-shopify orders search --query "fulfilled"` |
| `get_order_fulfillment_status` | Get fulfillment status for an order | `cob-shopify orders get-fulfillment-status --id gid://shopify/Order/123` |
| `get_order_timeline` | Get event timeline (comments, status changes, refunds) | `cob-shopify orders get-timeline --id gid://shopify/Order/123` |
| `create_draft_order` | Create a draft order with line items and customer | `cob-shopify orders create-draft --line_items '[{"variantId":"gid://shopify/ProductVariant/1","quantity":2}]'` |
| `add_order_note` | Add or update a private note on an order | `cob-shopify orders add-note --id gid://shopify/Order/123 --note "Rush shipping"` |
| `update_order_note` | Update an existing order note | `cob-shopify orders update-note --id gid://shopify/Order/123 --note "Updated note"` |
| `add_order_tag` | Add tags to an order | `cob-shopify orders add-tag --id gid://shopify/Order/123 --tags vip,priority` |
| `update_order_tags` | Set or replace tags on an order | `cob-shopify orders update-tags --id gid://shopify/Order/123 --tags wholesale` |
| `mark_order_paid` | Mark an order as paid | `cob-shopify orders mark-paid --id gid://shopify/Order/123` |
| `get_fulfillment_orders` | Get the fulfillment orders for an order (required before creating a fulfillment) | `cob-shopify orders get-fulfillment-orders --id gid://shopify/Order/123` |
| `create_fulfillment` | Fulfill a fulfillment order (mark as shipped) with tracking info | `cob-shopify orders create-fulfillment --fulfillment_order_id gid://shopify/FulfillmentOrder/123` |
| `update_fulfillment_tracking` | Update tracking info on an existing fulfillment | `cob-shopify orders update-fulfillment-tracking --fulfillment_id gid://shopify/Fulfillment/123 --tracking_number "1Z999AA1"` |

**Fulfilling an order** is a two-step flow — `create_fulfillment` needs a *fulfillment order* GID, not an order GID:

```bash
# 1. Get the fulfillment order GID
cob-shopify orders get-fulfillment-orders --id gid://shopify/Order/123 --json

# 2. Fulfill it, attaching tracking
cob-shopify orders create-fulfillment \
  --fulfillment_order_id gid://shopify/FulfillmentOrder/456 \
  --tracking_company UPS --tracking_number 1Z999AA1 --notify_customer
```

### Custom YAML (2 tools)

These tools ship as YAML examples in `custom-tools/` and auto-register under the `orders` domain only when `custom_paths` points at that folder. They are intentionally *not* built in.

| Tool | Description | CLI |
|------|-------------|-----|
| `cancel_order` | Cancel an order with reason and restock option | `cob-shopify orders cancel --order_id gid://shopify/Order/123 --reason CUSTOMER --restock true` |
| `complete_draft_order` | Convert a draft order into a real order | `cob-shopify orders complete-draft --id gid://shopify/DraftOrder/123` |

---

## Customers (9 tools)

| Tool | Description | CLI |
|------|-------------|-----|
| `list_customers` | List customers with pagination | `cob-shopify customers list --limit 10` |
| `get_customer` | Get a customer by GID with addresses, note, and state | `cob-shopify customers get --id gid://shopify/Customer/123` |
| `search_customers` | Search by email, name, phone, or tag | `cob-shopify customers search --query "john@example.com"` |
| `create_customer` | Create a customer with name, email, phone, tags | `cob-shopify customers create --firstName John --lastName Doe --email john@example.com` |
| `update_customer` | Update customer fields (name, email, phone, note) | `cob-shopify customers update --id gid://shopify/Customer/123 --note "VIP customer"` |
| `get_customer_orders` | Get all orders for a specific customer | `cob-shopify customers get-orders --id gid://shopify/Customer/123` |
| `get_customer_lifetime_value` | Get total spend and order count for a customer | `cob-shopify customers get-lifetime-value --id gid://shopify/Customer/123` |
| `add_customer_tag` | Add tags to a customer | `cob-shopify customers add-tag --id gid://shopify/Customer/123 --tags vip,wholesale` |
| `remove_customer_tag` | Remove tags from a customer | `cob-shopify customers remove-tag --id gid://shopify/Customer/123 --tags inactive` |

---

## Inventory (7 tools)

| Tool | Description | CLI |
|------|-------------|-----|
| `list_inventory_levels` | List inventory levels with pagination | `cob-shopify inventory list-levels --limit 20` |
| `get_inventory_item` | Get an inventory item by GID | `cob-shopify inventory get-item --id gid://shopify/InventoryItem/123` |
| `get_inventory_by_sku` | Look up inventory items by SKU string | `cob-shopify inventory get-by-sku --sku "ABC-123"` |
| `get_location_inventory` | Get inventory for all items at a location | `cob-shopify inventory get-location --location_id gid://shopify/Location/123` |
| `adjust_inventory` | Adjust inventory by a delta (positive or negative) | `cob-shopify inventory adjust --inventory_item_id gid://shopify/InventoryItem/123 --delta -5` |
| `set_inventory_level` | Set inventory to an exact quantity at a location | `cob-shopify inventory set-level --inventory_item_id gid://shopify/InventoryItem/123 --quantity 100` |
| `low_stock_report` | Report on products below a stock threshold | `cob-shopify inventory low-stock-report --threshold 10` |

---

## Analytics (16 tools)

All analytics tools use **ShopifyQL** for data retrieval -- a single API call with no cursor pagination. They require the `read_reports` scope on your Shopify app.

| Tool | Description | CLI |
|------|-------------|-----|
| `sales_summary` | Total and average sales for a date range | `cob-shopify analytics sales-summary --start_date 2026-01-01 --end_date 2026-03-15` |
| `sales_comparison` | Compare sales between two date ranges | `cob-shopify analytics sales-comparison --start_date 2026-02-01 --end_date 2026-02-28 --compare_start_date 2026-01-01 --compare_end_date 2026-01-31` |
| `sales_by_channel` | Revenue and orders broken down by sales channel | `cob-shopify analytics sales-by-channel --start_date 2026-01-01 --end_date 2026-03-15` |
| `sales_by_geography` | Sales breakdown by country or region | `cob-shopify analytics sales-by-geography --start_date 2026-01-01 --end_date 2026-03-15` |
| `top_products` | Best-selling products by revenue or order count | `cob-shopify analytics top-products --start_date 2026-01-01 --end_date 2026-03-15 --limit 10` |
| `orders_by_date_range` | Order count and metrics grouped by day/week/month | `cob-shopify analytics orders-by-date-range --start_date 2026-01-01 --end_date 2026-03-15 --group_by day` |
| `customer_cohort_analysis` | Customers, orders, and sales grouped by cohort period | `cob-shopify analytics customer-cohort-analysis --start_date 2026-01-01 --end_date 2026-03-15` |
| `customer_lifetime_value` | Customer lifetime value distribution and averages | `cob-shopify analytics customer-lifetime-value --start_date 2026-01-01 --end_date 2026-03-15` |
| `repeat_customer_rate` | Percentage of returning customers over time | `cob-shopify analytics repeat-customer-rate --start_date 2026-01-01 --end_date 2026-03-15` |
| `refund_rate_summary` | Refund rates and totals for a date range | `cob-shopify analytics refund-rate-summary --start_date 2026-01-01 --end_date 2026-03-15` |
| `discount_performance` | Performance of discount codes and automatic discounts | `cob-shopify analytics discount-performance --start_date 2026-01-01 --end_date 2026-03-15` |
| `conversion_funnel` | Funnel stages: sessions viewed, added to cart, reached checkout, completed checkout | `cob-shopify analytics conversion-funnel --start_date 2026-01-01 --end_date 2026-03-15` |
| `traffic_analytics` | Session traffic grouped by day, week, or month | `cob-shopify analytics traffic-analytics --start_date 2026-01-01 --end_date 2026-03-15` |
| `product_vendor_performance` | Revenue and orders broken down by product vendor | `cob-shopify analytics product-vendor-performance --start_date 2026-01-01 --end_date 2026-03-15` |
| `inventory_risk_report` | Products at overstock or understock risk based on sales velocity | `cob-shopify analytics inventory-risk-report --start_date 2026-01-01 --end_date 2026-03-15` |
| `shopifyql_query` | Execute any raw ShopifyQL query for custom analytics. **Tier 2 — disabled by default**; enable with `COB_SHOPIFY_ENABLE=shopifyql_query` | `cob-shopify analytics shopifyql-query --query "FROM sales SHOW total_sales SINCE -30d"` |
