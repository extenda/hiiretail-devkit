```
 _   _ _ _ ____      _        _ _   ____             _  ___ _
| | | (_|_)  _ \ ___| |_ __ _(_) | |  _ \  _____   _| |/ (_) |_
| |_| | | | |_) / _ \ __/ _` | | | | | | |/ _ \ \ / / ' /| | __|
|  _  | | |  _ <  __/ || (_| | | | | |_| |  __/\ V /| . \| | |_
|_| |_|_|_|_| \_\___|\__\__,_|_|_| |____/ \___| \_/ |_|\_\_|\__|
```

# Hii Retail DevKit

A Docker-first local development toolkit for developing systems that integrate with
[Hii Retail APIs](https://developer.hiiretail.com/api). Provides a mock environment
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
| **Promotion Input** | `promotion` | `/api/v2/bu-g-promotions` |
| **Promotion Input (BU level)** | `promotion-bu` | `/api/v2/bu-promotions` |
| **Item Category Input** | `category` | `/api/v2/item-categories` |
| **Business Unit** | `bu` | `/business-units` |
| **Business Unit Group** | `group` | `/groups` |

**Customer Controlled Configuration (CCC):**

| Kind | CLI `--kind` key | Description |
|------|------------------|-------------|
| **Reason Codes** | `rco.reason-codes.v1` | Reason codes for refunds, voids, price overrides, stock corrections |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2+
- [Node.js 22 LTS](https://nodejs.org/) (for the CLI — optional but recommended)

## Quick Start

### Option 1: Zero Install (Recommended)

Docker images are published to DockerHub with all configuration baked in — just download
one file and run. No cloning, no building, no local dependencies.

**One-liner:**

```bash
curl -O https://raw.githubusercontent.com/extenda/hiiretail-devkit/master/docker-compose.yml && docker compose up -d
```

**Step by step:**

```bash
# 1. Download docker-compose.yml (the only file you need)
curl -O https://raw.githubusercontent.com/extenda/hiiretail-devkit/master/docker-compose.yml

# 2. Start the mock environment (images pulled from DockerHub)
docker compose up -d

# 3. Verify services are running
docker compose ps

# 4. Open the UIs
open http://localhost:8080   # Swagger UI
open http://localhost:8081   # Webhook Playground
```

Services will be available at:
- **API Endpoint:** http://localhost:1080 — POST your API payloads here (validated against OpenAPI schemas)
- **CCC API:** http://localhost:1080/api/v1/config — Customer Controlled Configuration (reason codes, etc.)
- **Swagger UI:** http://localhost:8080 — Interactive API documentation
- **Webhook Playground:** http://localhost:8081 — Test webhook delivery
- **CCC Server:** http://localhost:3003 — Direct CCC server access (health check, debugging)

The Docker images include everything needed: OpenAPI specs are fetched from Hii Retail's
canonical URLs at startup, and webhook event templates are baked into the images.

### Option 2: With CLI Tools

Clone the repo if you want CLI tools for validation, pushing payloads, and webhook management:

```bash
# 1. Clone and install CLI dependencies
git clone https://github.com/extenda/hiiretail-devkit.git && cd hiiretail-devkit
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

# 6. Test CCC (Customer Controlled Configuration)
npm run devkit --prefix cli -- ccc list         # list available CCC kinds
npm run devkit --prefix cli -- ccc push --kind rco.reason-codes.v1 -f examples/payloads/ccc/reason-codes-tenant.json
npm run devkit --prefix cli -- ccc get --kind rco.reason-codes.v1

# 7. Open the Webhook Playground UI
open http://localhost:8081
```

### Building Locally (Development)

If you want to build the Docker images locally instead of pulling from DockerHub:

```bash
docker compose build
docker compose up -d
```

## Docker Images

Pre-built images are available on DockerHub:

| Image | Description |
|-------|-------------|
| `extenda/hiiretail-devkit-mockserver-init` | Fetches OpenAPI specs and configures MockServer |
| `extenda/hiiretail-devkit-validation-proxy` | Validates requests against OpenAPI schemas |
| `extenda/hiiretail-devkit-webhook-playground` | Web UI for testing webhook delivery |
| `extenda/hiiretail-devkit-webhook-receiver` | Captures webhook events for inspection |
| `extenda/hiiretail-devkit-ccc-server` | Customer Controlled Configuration storage |

## Architecture

```
+---------------------------------------------------------------------+
|  docker compose                                                     |
|                                                                     |
|  +------------------+     +------------------+                      |
|  |  Validation      | --> |  MockServer      |                      |
|  |  Proxy :1080     |     |  (internal)      |                      |
|  |                  |     |                  |                      |
|  |  - Schema        |     |  - Response      |                      |
|  |    validation    |     |    mocking       |                      |
|  |  - 400 errors    |     |  - Path routing  |                      |
|  |    for invalid   |     +------------------+                      |
|  |                  |                                               |
|  |  - CCC routing --+---> +------------------+                      |
|  +------------------+     |  CCC Server      |                      |
|                           |  :3003           |                      |
|  +------------------+     |  - Config store  |                      |
|  |  Swagger UI      |     +------------------+                      |
|  |  :8080           |                                               |
|  +------------------+     +---------------------+                   |
|                           |  Webhook            |                   |
|                           |  Playground :8081   |                   |
|                           |  (Web UI)           |                   |
|                           +---------------------+                   |
|                                     |                               |
|                                     v                               |
|                           +---------------------+                   |
|                           |  Webhook            |                   |
|                           |  Receiver :3002     |                   |
|                           +---------------------+                   |
+---------------------------------------------------------------------+

+---------------------------------------------------------------------+
|  CLI  (devkit)                                                      |
|                                                                     |
|  mock up|down|status|logs   - manage Docker environment             |
|  validate                   - offline schema validation             |
|  push                       - POST payloads to mock or sandbox      |
|  webhook events|send|logs   - webhook testing                       |
|  ccc list|validate|push|get - CCC config management                 |
+---------------------------------------------------------------------+
```

### How It Works

1. **Validation Proxy** (port 1080) is the entry point for all API calls.
   Validates request bodies against OpenAPI schemas before forwarding to
   MockServer. Invalid payloads return 400 with detailed validation errors.

2. **MockServer** (internal) handles response mocking after requests pass
   validation. Returns 202 Accepted for valid payloads, matching real Hii
   Retail API behavior.

3. **Webhook Playground** (port 8081) is a web UI for testing webhook receivers.
   Select from pre-built event sources (based on real Hii Retail event schemas),
   configure the target URL, authentication, and custom headers, then send.

4. **Webhook Receiver** (port 3002) is a built-in service that captures webhook
   events. Use it as a test target or inspect events via `devkit webhook logs`.

5. **Swagger UI** (port 8080) serves OpenAPI specs directly from Hii Retail's
   canonical URLs for interactive exploration.

6. **mockserver-init** is a one-shot container that fetches OpenAPI specs from
   canonical URLs, loads expectations into MockServer, and provides specs to the
   validation proxy.

7. **CCC Server** (port 3003) stores Customer Controlled Configuration values
   (like reason codes) in memory. Accessed via the validation-proxy which validates
   payloads against schemas from the Hii Retail JSON Schema Registry.

### Request Validation

All POST, PUT, and PATCH requests are validated against the OpenAPI schemas
before being forwarded to MockServer. This catches schema violations early,
just like the real Hii Retail APIs would.

**Invalid payloads return 400 with detailed errors:**

```json
{
  "error": "Request validation failed",
  "message": "The request body does not match the createItem schema",
  "validationErrors": [
    {
      "path": "/itemType",
      "message": "must be equal to one of the allowed values",
      "details": "allowed values: STOCK, SERVICE, BUNDLE"
    },
    {
      "path": "",
      "message": "must have required property 'businessUnitGroupId'",
      "details": "missing required property 'businessUnitGroupId'"
    }
  ],
  "hint": "Use the CLI to validate payloads offline: devkit validate <file> --api <name>"
}
```

**Validation checks include:**
- Required fields
- Enum values (itemType, status, priceType, etc.)
- Data types (string, number, boolean, array)
- String formats (date-time, uuid, etc.)
- Nested object schemas

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

### `devkit ccc`

Manage Customer Controlled Configuration (CCC) for reason codes and other configuration kinds.

```bash
devkit ccc list                                    # list available CCC kinds
devkit ccc validate --kind rco.reason-codes.v1 -f payload.json  # validate payload
devkit ccc push --kind rco.reason-codes.v1 -f payload.json      # push to tenant
devkit ccc push --kind rco.reason-codes.v1 -f payload.json --bu store-001  # push to BU
devkit ccc get --kind rco.reason-codes.v1          # get tenant config
devkit ccc get --kind rco.reason-codes.v1 --bu store-001  # get BU config
devkit ccc delete --kind rco.reason-codes.v1       # delete tenant config
```

CCC supports hierarchical configuration: tenant-level configs apply to all business units,
while BU-level configs override tenant settings for specific stores.

## Customer Controlled Configuration (CCC)

CCC is Hii Retail's system for tenant-managed configurations like reason codes. The DevKit
provides a mock CCC server that validates payloads against JSON schemas from the
[hiiretail-json-schema-registry](https://github.com/extenda/hiiretail-json-schema-registry/tree/master/customer-config).

### CCC HTTP API

All CCC endpoints are accessible via the validation proxy at `http://localhost:1080`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config` | List available config kinds |
| GET | `/api/v1/config/{kind}` | Get kind definition and schema URL |
| PUT | `/api/v1/config/{kind}/values/tenant` | Set tenant-level config |
| GET | `/api/v1/config/{kind}/values/tenant` | Get tenant-level config |
| DELETE | `/api/v1/config/{kind}/values/tenant` | Delete tenant-level config |
| PUT | `/api/v1/config/{kind}/values/business-units/{buId}` | Set BU-level config |
| GET | `/api/v1/config/{kind}/values/business-units/{buId}` | Get BU-level config |
| DELETE | `/api/v1/config/{kind}/values/business-units/{buId}` | Delete BU-level config |

### CCC HTTP Examples

**List available kinds:**
```bash
curl http://localhost:1080/api/v1/config
```

**Push tenant-level reason codes:**
```bash
curl -X PUT http://localhost:1080/api/v1/config/rco.reason-codes.v1/values/tenant \
  -H 'Content-Type: application/json' \
  -d '{
    "reasonCodes": [
      {
        "id": "REFUND-001",
        "name": "Customer Return",
        "status": "Activated",
        "groups": ["Refund"],
        "isCommentRequired": true
      }
    ]
  }'
```

**Push BU-level override:**
```bash
curl -X PUT http://localhost:1080/api/v1/config/rco.reason-codes.v1/values/business-units/store-001 \
  -H 'Content-Type: application/json' \
  -d '{
    "reasonCodes": [
      {
        "id": "LOCAL-001",
        "name": "Store-Specific Reason",
        "status": "Activated"
      }
    ]
  }'
```

**Get current config:**
```bash
curl http://localhost:1080/api/v1/config/rco.reason-codes.v1/values/tenant
```

### CCC Validation

All PUT requests to CCC endpoints are validated against JSON schemas fetched from the
Hii Retail JSON Schema Registry. Invalid payloads return 400 with detailed errors:

```json
{
  "error": "CCC validation failed",
  "message": "The request body does not match the rco.reason-codes.v1 schema",
  "validationErrors": [
    {
      "path": "/",
      "message": "must have required property 'reasonCodes'",
      "details": "missing required property 'reasonCodes'"
    }
  ],
  "hint": "Use the CLI to validate payloads: devkit ccc validate --kind rco.reason-codes.v1 -f <file>"
}
```

### Reason Codes Schema

The `rco.reason-codes.v1` schema defines reason codes for POS operations:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (max 20 chars) |
| `name` | string | Yes | Display name (3-40 chars) |
| `status` | enum | Yes | `Activated` or `Deactivated` |
| `description` | string | No | Detailed description (3-255 chars) |
| `groups` | array | No | Categories: `Refund`, `CancelOrder`, `StockCorrection`, `PriceOverride`, `TaxExempt`, `CashManagement`, etc. |
| `isManualEntryRequired` | boolean | No | Require manual value entry |
| `isReferenceNumberRequired` | boolean | No | Require reference number |
| `isCommentRequired` | boolean | No | Require comment |
| `isNegativeQuantityByDefault` | boolean | No | Default to negative quantity |
| `minimumAmount` | number | No | Minimum allowed amount |
| `maximumAmount` | number | No | Maximum allowed amount |

### Adding New CCC Kinds

To add support for a new CCC kind:

1. Add to `cli/src/lib/ccc-client.js`:
   ```javascript
   const KIND_CATEGORY_MAP = {
     'rco.reason-codes.v1': 'reason-codes',
     'new.kind.v1': 'category-folder',  // ADD
   };
   ```

2. Add to `validation-proxy/server.js`:
   ```javascript
   const CCC_KINDS = new Map([
     ['rco.reason-codes.v1', { category: 'reason-codes' }],
     ['new.kind.v1', { category: 'category-folder' }],  // ADD
   ]);
   ```

3. Add to `ccc-server/server.js`:
   ```javascript
   const KNOWN_KINDS = new Map([
     ['rco.reason-codes.v1', { category: 'reason-codes', description: '...' }],
     ['new.kind.v1', { category: 'category-folder', description: '...' }],  // ADD
   ]);
   ```

4. Add example payload in `examples/payloads/ccc/`

5. Rebuild: `docker compose up -d --build`

### CCC Troubleshooting

**"Config not found" error:**
```bash
# Check if config was pushed
curl http://localhost:1080/api/v1/config/rco.reason-codes.v1/values/tenant

# List what's stored
curl http://localhost:3003/health
# Shows: {"tenantConfigs": N, "buConfigs": M}
```

**Validation errors:**
```bash
# Validate offline before pushing
devkit ccc validate --kind rco.reason-codes.v1 -f payload.json

# Check the schema requirements
curl http://localhost:1080/api/v1/config/rco.reason-codes.v1
# Returns schema URL for reference
```

**Reset all CCC configs:**
```bash
curl -X POST http://localhost:3003/api/v1/_reset
```

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
| `promotions/` | `promotion` | Summer sale, member discounts, coupon promotions |
| `business-unit-groups/` | `group` | Assortment, pricing, and tax groups |
| `business-units/` | `bu` | Stores and warehouses |
| `item-categories/` | `category` | Product categories with hierarchy |
| `ccc/` | CCC kinds | Reason codes for tenant and BU levels |

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
- Promotions (Normal, Coupon, Member)
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

## Port Customization

Default ports can be overridden with environment variables:

| Variable | Default | Service |
|----------|---------|---------|
| `MOCKSERVER_PORT` | 1080 | API endpoint (validation proxy) |
| `SWAGGER_UI_PORT` | 8080 | Swagger UI |
| `WEBHOOK_PLAYGROUND_PORT` | 8081 | Webhook Playground |
| `WEBHOOK_RECEIVER_PORT` | 3002 | Webhook Receiver |
| `CCC_SERVER_PORT` | 3003 | CCC Server |

Example:
```bash
MOCKSERVER_PORT=9080 SWAGGER_UI_PORT=9090 docker compose up -d
```

## Adding New APIs

1. Add spec URL to `specs/urls.json`
2. Add schema mapping in `cli/src/lib/validator.js` (`API_SPEC_MAP`)
3. Add path mapping in `cli/src/lib/api-client.js` (`API_PATH_MAP`)
4. Restart: `devkit mock down && devkit mock up`
