# Hii Retail ERP Integration DevKit

A Docker-first local development toolkit for integrating ERP systems with
[Hii Retail](https://developer.hiiretail.com) APIs. Provides a mock environment
with schema validation based on canonical OpenAPI specs, plus webhook testing
tools — so you can build and test integrations without touching production.

## Supported APIs

| API | CLI `--api` key | API Path |
|-----|-----------------|----------|
| **Item Input** | `item` | `/api/v2/bu-g-items` |
| **Item Input (BU level)** | `item-bu` | `/api/v2/bu-items` |
| **Price Specification Input** | `price` | `/api/v2/bu-g-price-specifications` |
| **Price Specification (BU level)** | `price-bu` | `/api/v2/bu-price-specifications` |
| **Item Identifier Input** | `identifier` | `/api/v2/bu-g-item-identifiers` |
| **Item Identifier (BU level)** | `identifier-bu` | `/api/v2/bu-item-identifiers` |
| **Item Category Input** | `category` | `/api/v2/item-categories` |
| **Business Unit** | `bu` | `/business-units` |
| **Business Unit Group** | `group` | `/groups` |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2+
- [Node.js 22 LTS](https://nodejs.org/) (for the CLI)

## 5-Minute Quickstart

```bash
# 1. Clone and install CLI dependencies
git clone <repo-url> && cd hiiretail-devkit
cd cli && npm install && cd ..

# 2. Start the mock environment
npm run devkit --prefix cli -- mock up

# 3. Validate an example payload
npm run devkit --prefix cli -- validate examples/payloads/items/organic-milk.json --api item

# 4. Push it to the local mock
npm run devkit --prefix cli -- push --api item --file examples/payloads/items/organic-milk.json --target mock

# 5. Test webhook delivery
npm run devkit --prefix cli -- webhook events   # list available event sources
npm run devkit --prefix cli -- webhook send scr.stock-corrections.v1
npm run devkit --prefix cli -- webhook logs     # view received events

# 6. Open the Webhook Playground UI
open http://localhost:8081
```

## Architecture

```
+---------------------------------------------------------------------+
|  docker compose                                                     |
|                                                                     |
|  +------------------+               +---------------------+         |
|  |  MockServer      |               |  Webhook            |         |
|  |  :1080           |               |  Playground :8081   |         |
|  |                  |               |  (Web UI)           |         |
|  |  - OpenAPI       |               +---------------------+         |
|  |    contract      |                         |                     |
|  |    validation    |                         v                     |
|  |  - Specs from    |               +---------------------+         |
|  |    canonical     |               |  Webhook            |         |
|  |    URLs          |               |  Receiver :3002     |         |
|  +------------------+               +---------------------+         |
|                                                                     |
|  +------------------+                                               |
|  |  Swagger UI      |                                               |
|  |  :8080           |                                               |
|  +------------------+                                               |
+---------------------------------------------------------------------+

+---------------------------------------------------------------------+
|  CLI  (devkit)                                                      |
|                                                                     |
|  mock up|down|status|logs   - manage Docker environment             |
|  validate                   - offline schema validation             |
|  push                       - POST payloads to mock or sandbox      |
|  webhook events|send|logs   - webhook testing                       |
+---------------------------------------------------------------------+
```

### How It Works

1. **MockServer** (port 1080) is the entry point for all API calls. OpenAPI specs
   are fetched from Hii Retail's canonical URLs at startup and used to generate
   request expectations with contract validation.

2. **Webhook Playground** (port 8081) is a web UI for testing webhook receivers.
   Select from pre-built event sources (based on real Hii Retail event schemas),
   configure the target URL, authentication, and custom headers, then send.

3. **Webhook Receiver** (port 3002) is a built-in service that captures webhook
   events. Use it as a test target or inspect events via `devkit webhook logs`.

4. **Swagger UI** (port 8080) serves OpenAPI specs directly from Hii Retail's
   canonical URLs for interactive exploration.

5. **mockserver-init** is a one-shot container that fetches OpenAPI specs from
   canonical URLs and loads expectations into MockServer.

## CLI Reference

All CLI commands use the prefix:

```bash
npm run devkit --prefix cli -- <command>
```

Or install globally:

```bash
cd cli && npm link
devkit <command>
```

### `devkit mock up`

Start the Docker environment.

```bash
devkit mock up              # start in background (default)
devkit mock up --no-swagger # skip Swagger UI container
devkit mock down            # stop everything
devkit mock status          # show container status
devkit mock logs            # show container logs
devkit mock logs -f         # follow logs
```

### `devkit validate <payload.json> --api <name>`

Validate a JSON file against the Hii Retail OpenAPI schema. Specs are fetched
from canonical URLs at runtime. Prints human-friendly errors with suggestions.

```bash
devkit validate payload.json --api item
devkit validate prices.json --api price
devkit validate store.json --api bu
devkit validate group.json --api group
devkit validate category.json --api category
```

### `devkit push --api <api> --file <file> --target <mock|sandbox>`

Push a payload to MockServer (local) or the real Hii Retail sandbox. Validates
the payload first (skip with `--skip-validation`).

```bash
devkit push --api item --file items/organic-milk.json --target mock
devkit push --api price --file prices/organic-milk-normal.json --target sandbox
```

### `devkit webhook`

Test webhook delivery using event sources based on real Hii Retail event schemas
from [hiiretail-json-schema-registry](https://github.com/extenda/hiiretail-json-schema-registry).

```bash
devkit webhook events                    # list available event sources
devkit webhook send scr.stock-corrections.v1   # send to built-in receiver
devkit webhook send grc.goods-received.v1 --target http://localhost:9000/webhook
devkit webhook send cor.customer-order-updates.v2 --username user --password pass
devkit webhook send stp.stock-level-updates.v2 -H "X-Custom: value"
devkit webhook logs                      # show received events (default: 20)
devkit webhook logs --type scr           # filter by type prefix
devkit webhook logs --limit 5            # limit results
devkit webhook logs --follow             # poll for new events every 2s
devkit webhook clear                     # clear all received events
```

Available event sources:
- `scr.stock-corrections.v1` — Stock adjustment events
- `stp.stock-level-updates.v2` — Inventory level changes
- `grc.goods-received.v1` — Delivery receipt events
- `cor.customer-order-updates.v2` — Order status updates
- `rec.reconciliation.v1` — Cash drawer reconciliation
- `stc.stock-count-completed.v1` — Inventory count completion
- `str.store-transfer-completed.v1` — Inter-store transfers
- `txr.digital-receipts.v1` — Digital receipt publishing
- `txr.sequencegaps.v1` — Transaction sequence gap detection
- `txr.transactions.v1` — Raw transaction events (binary PosLog)
- `sre.alerts.v1` — Internal system alerts
- `sre.failed-events.v1` — Event processing failure notifications
- `sre.failed-exe-webhooks.v1` — Webhook delivery failure notifications

### Webhook Playground UI

For a visual interface, open http://localhost:8081 after starting the environment.
The web UI provides:

- Dropdown to select event sources
- Target URL configuration
- Basic Auth support (username/password)
- Custom headers (key-value pairs)
- Payload preview
- Response display

## Working with the Sandbox

To push payloads against the real Hii Retail sandbox, copy `.env.example` to
`.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables for sandbox access:

| Variable | Description |
|----------|-------------|
| `HIR_SANDBOX_BASE_URL` | Sandbox API base URL |
| `HIR_SANDBOX_AUTH_URL` | OAuth2 token endpoint |
| `HIR_SANDBOX_CLIENT_ID` | OAuth2 client ID |
| `HIR_SANDBOX_CLIENT_SECRET` | OAuth2 client secret |
| `HIR_SANDBOX_AUDIENCE` | OAuth2 audience |
| `HIR_SANDBOX_TENANT_ID` | Your tenant ID |

Then use `--target sandbox`:

```bash
devkit push --api item --file examples/payloads/items/organic-milk.json --target sandbox
```

## Example Payloads

### Individual payloads (`examples/payloads/`)

| Directory | API | Contents |
|-----------|-----|----------|
| `items/` | `item` | Organic milk, sourdough bread, bananas (KG), gift wrapping (SERVICE), sparkling water (BUNDLE) |
| `price-specifications/` | `price` | Normal and campaign prices |
| `item-identifiers/` | `identifier` | GTIN13, PLU, and SKU codes |
| `business-unit-groups/` | `group` | Assortment, pricing, and tax groups |
| `business-units/` | `bu` | Stores and warehouses |
| `item-categories/` | `category` | Product categories with hierarchy |

### Vertical examples (`examples/verticals/`)

Complete end-to-end examples for four retail verticals. Each vertical contains
all API payload types with correctly cross-referenced IDs.

| Vertical | Directory | Items | Store |
|----------|-----------|-------|-------|
| **Grocery** | `verticals/grocery/` | Oat milk, salmon fillet | FreshMart Downtown |
| **Fashion** | `verticals/fashion/` | Denim jacket, wool scarf | Threadline Flagship |
| **DIY** | `verticals/diy/` | Cordless drill, wood screws | Hammerstone Retail Park |
| **Eyewear** | `verticals/eyewear/` | Prescription frames, daily contacts | BrightSight Gallery Mall |

## Postman Collections

Ready-to-use Postman collections for testing the MockServer:

| Collection | Description |
|------------|-------------|
| `postman/devkit-environment.json` | Environment variables (baseUrl, IDs) |
| `postman/hiiretail-devkit-happy-path.json` | Happy path tests for all APIs |
| `postman/hiiretail-devkit-negative-tests.json` | Negative tests (validation errors, invalid data) |

**Import into Postman:**

1. Open Postman
2. Click **Import** → select all three JSON files from `postman/`
3. Select the "Hii Retail DevKit" environment
4. Run the collections

**Happy path tests cover:**
- Business Unit Groups, Business Units
- Item Categories (with hierarchy)
- Items (Stock Item, Service, Weighted)
- Price Specifications (Normal, Campaign)
- Item Identifiers (GTIN, PLU, SKU)
- Both BUG-level and BU-level endpoints

**Negative tests cover:**
- Malformed JSON
- Missing required fields
- Invalid enum values
- Wrong data types
- Non-existent endpoints
- Wrong HTTP methods
- Content-Type issues
- Scope mismatches (BUG vs BU)

## ERP Integration Testing

If you're integrating an ERP system (SAP, Microsoft Dynamics, Oracle, etc.) with
Hii Retail, you can point your ERP at the DevKit's MockServer to test payloads
without touching Hii Retail infrastructure.

See **[ERP Integration Testing Guide](docs/erp-integration-testing.md)** for:

- Configuring your ERP to use MockServer as the API endpoint
- Handling authentication (MockServer doesn't enforce OAuth2)
- Testing webhook delivery to your middleware
- Network and firewall configuration
- Troubleshooting common issues

## Adding New APIs

1. Add spec URL to `specs/urls.json`
2. Add schema mapping in `cli/src/lib/validator.js` (`API_SPEC_MAP`)
3. Add path mapping in `cli/src/lib/api-client.js` (`API_PATH_MAP`)
4. Restart: `devkit mock down && devkit mock up`
