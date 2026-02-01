# Hii Retail ERP Integration DevKit

A Docker-first local development toolkit for integrating ERP systems with
[Hii Retail](https://developer.hiiretail.com) input APIs. Provides a mock
environment with schema validation, realistic responses, and an optional
stateful layer — so you can build and test integrations without touching
production.

## Supported APIs

| API | Description |
|-----|-------------|
| **Item Input** | Create, update, delete items (products) |
| **Price Specification Input** | Set prices, campaigns, validity periods |
| **Item Identifier Input** | Assign GTINs, PLUs, SKUs, QR codes to items |
| **Complete Item Query** | Read a composed view (item + prices + identifiers) |

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

# 5. Push the price and identifier too
npm run devkit --prefix cli -- push --api price --file examples/payloads/price-specifications/organic-milk-normal.json --target mock
npm run devkit --prefix cli -- push --api identifier --file examples/payloads/item-identifiers/organic-milk-gtin.json --target mock

# 6. Verify the composed "complete item" view
npm run devkit --prefix cli -- verify --item-id erp-item-10001 --target mock

# 7. Or diff against an expected result
npm run devkit --prefix cli -- verify --item-id erp-item-10001 --target mock --expect examples/expected/organic-milk-complete.json
```

## Architecture

```
+-------------------------------------------------------------------+
|  docker compose                                                   |
|                                                                   |
|  +----------------+   forward   +----------------+                |
|  |  MockServer    | ----------> |  State Server  |                |
|  |  :1080         |             |  :3001         |                |
|  |                |             |                |                |
|  |  - OpenAPI     |             |  - In-memory   |                |
|  |    contract    |             |    item store  |                |
|  |    validation  |             |  - Composed    |                |
|  |  - Request     |             |    complete    |                |
|  |    recording   |             |    item view   |                |
|  +----------------+             +----------------+                |
|                                                                   |
|  +----------------+                                               |
|  |  Swagger UI    |                                               |
|  |  :8080         |                                               |
|  +----------------+                                               |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
|  CLI  (devkit)                                                    |
|                                                                   |
|  mock up|down   - manage Docker environment                       |
|  validate       - offline schema validation (AJV + OpenAPI)       |
|  push           - POST payloads to mock or sandbox                |
|  verify         - GET complete item, diff against expected        |
+-------------------------------------------------------------------+
```

### How It Works

1. **MockServer** (port 1080) is the single entry point for all API calls.
   OpenAPI-derived expectations handle contract validation. Higher-priority
   forwarding rules proxy mutations to the state server.

2. **State Server** (port 3001) is a lightweight Express service that stores
   items, prices, and identifiers in memory. It exposes a
   `/api/v1/complete-items/:id` endpoint that returns a composed view — the
   same shape you'd get from Hii Retail's Complete Item Query API.

3. **Swagger UI** (port 8080) serves the bundled OpenAPI specs for interactive
   exploration.

4. **mockserver-init** is a one-shot container that waits for MockServer to
   become healthy, then loads expectations from the OpenAPI specs and custom
   forwarding rules.

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

Start the Docker environment (MockServer + state server + Swagger UI).

```bash
devkit mock up              # start in background (default)
devkit mock up --no-swagger # skip Swagger UI container
devkit mock down            # stop everything
devkit mock status          # show container status
devkit mock reset           # clear all in-memory state (keeps containers)
```

### `devkit validate <payload.json> --api <item|price|identifier>`

Validate a JSON file against the Hii Retail OpenAPI schema offline (no running
server needed). Prints human-friendly errors with JSON pointers and suggestions.

```bash
devkit validate payload.json --api item
devkit validate prices.json --api price        # also supports JSON arrays
```

### `devkit push --api <api> --file <file> --target <mock|sandbox>`

Push a payload to MockServer (local) or the real Hii Retail sandbox. Validates
the payload first (skip with `--skip-validation`).

```bash
devkit push --api item --file items/organic-milk.json --target mock
devkit push --api price --file prices/organic-milk-normal.json --target sandbox
```

### `devkit verify --item-id <id> --target <mock|sandbox>`

Fetch the complete item view and optionally diff it against an expected JSON.

```bash
devkit verify --item-id erp-item-10001 --target mock
devkit verify --item-id erp-item-10001 --target mock --expect expected/organic-milk-complete.json
```

Server-set fields (`created`, `modified`, `version`, `revision`) are ignored in diffs.

## Working with the Sandbox

To push payloads or verify against the real Hii Retail sandbox, copy
`.env.example` to `.env` and fill in your credentials:

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
devkit verify --item-id erp-item-10001 --target sandbox
```

## Happy Path: Full Integration Loop

This is the typical development workflow for ERP integration:

```
1. AUTHOR     →  Write/export item + price + identifier payloads
2. VALIDATE   →  devkit validate (catches schema errors instantly)
3. PUSH MOCK  →  devkit push --target mock (test against contract)
4. VERIFY     →  devkit verify --target mock (check composed view)
5. PUSH LIVE  →  devkit push --target sandbox (send to real env)
6. VERIFY     →  devkit verify --target sandbox (confirm in Hii Retail)
```

## Adding New OpenAPI Specs

To add a new Hii Retail API (e.g. Item Link Input):

1. Add the spec to `specs/v1/<api-name>.yaml`
2. Add the schema mapping to `cli/src/lib/validator.js` (`API_SPEC_MAP`)
3. Add the path mapping to `cli/src/lib/api-client.js` (`API_PATH_MAP`)
4. Add forwarding expectations in `mockserver/init/expectations/`
5. Restart: `devkit mock down && devkit mock up`

## Example Payloads

Pre-built examples in `examples/payloads/`:

| File | API | Description |
|------|-----|-------------|
| `items/organic-milk.json` | item | Organic whole milk (STOCK_ITEM) |
| `items/sourdough-bread.json` | item | Artisan sourdough bread |
| `items/banana-loose.json` | item | Loose bananas, sold by KG |
| `items/gift-wrapping.json` | item | Gift wrapping service (SERVICE) |
| `items/sparkling-water-6pack.json` | item | Sparkling water bundle (BUNDLE) |
| `price-specifications/*` | price | Normal and campaign prices |
| `item-identifiers/*` | identifier | GTIN13, PLU, and SKU codes |

## Datasets

`datasets/` contains sample data for batch integration testing:

- `erp-product-catalog.csv` — 10 products in CSV format
- `erp-product-catalog.json` — same data as JSON
- `field-mapping.json` — ERP → Hii Retail field mapping reference

## Next Steps (v2 Roadmap)

- **Recording & replay** — capture MockServer request logs and replay them as regression tests
- **Postman collection export** — auto-generate Postman collections from the OpenAPI specs
- **Language SDK generation** — use OpenAPI Generator to produce client SDKs (TypeScript, Python, C#)
- **Batch push** — CLI support for pushing entire CSV/JSON datasets in one command
- **Docker health dashboard** — simple web UI showing service status and recent requests
- **CI pipeline template** — GitHub Actions workflow for automated validation on PR
