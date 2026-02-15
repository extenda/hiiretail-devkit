# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Docker-first ERP Integration DevKit for Hii Retail APIs. Provides a local mock
environment (MockServer), webhook testing tools, and a Node.js CLI for validation.
OpenAPI specs are fetched at startup from Hii Retail's canonical URLs. Target audience:
ERP integration developers who need a fast local loop against Hii Retail APIs.

## Commands

```bash
# Install CLI dependencies
cd cli && npm install

# Start the full mock environment
docker compose up -d --build

# Stop everything
docker compose down

# Run CLI commands (from repo root)
npm run devkit --prefix cli -- mock up
npm run devkit --prefix cli -- mock down
npm run devkit --prefix cli -- mock status
npm run devkit --prefix cli -- validate <payload.json> --api <item|price|identifier|bu|group|category>
npm run devkit --prefix cli -- push --api <api> --file <file> --target <mock|sandbox>
npm run devkit --prefix cli -- webhook events
npm run devkit --prefix cli -- webhook send <event-source> --target <url>
npm run devkit --prefix cli -- webhook logs
npm run devkit --prefix cli -- webhook clear
npm run devkit --prefix cli -- ccc list
npm run devkit --prefix cli -- ccc validate --kind <kind> -f <file>
npm run devkit --prefix cli -- ccc push --kind <kind> -f <file> [--bu <businessUnitId>]
npm run devkit --prefix cli -- ccc get --kind <kind> [--bu <businessUnitId>]
npm run devkit --prefix cli -- ccc delete --kind <kind> [--bu <businessUnitId>]

# Run CLI tests
cd cli && npm test
```

## Architecture

- **`specs/urls.json`** — Canonical URLs for Hii Retail OpenAPI specs. These are fetched
  at startup by MockServer and at runtime by the CLI validator. No local spec copies.

- **`docker-compose.yml`** — Orchestrates services:
  - `mockserver` (port 1080): MockServer 5.15.0 — validates requests against OpenAPI specs.
    Returns mock responses based on spec definitions.
  - `mockserver-init`: One-shot container that fetches OpenAPI specs from canonical URLs
    and loads expectations into MockServer.
  - `webhook-receiver` (port 3002): Built-in webhook receiver. Stores events in memory for
    inspection via CLI (`devkit webhook logs`) or direct HTTP.
  - `webhook-playground` (port 8081): Web UI for sending test webhook events. Select from
    event sources, configure target URL, auth, and headers.
  - `ccc-server` (port 3003): Customer Controlled Configuration server. Stores CCC configs
    (like reason codes) in memory for testing. Accessed via validation-proxy.
  - `swagger-ui` (port 8080): Swagger UI loading specs directly from Hii Retail URLs.

- **`mockserver/`** — MockServer configuration:
  - `expectations/init-expectations.json` — Static expectations loaded on container start.
  - `init/load-expectations.js` — Fetches OpenAPI specs from URLs, generates expectations,
    and loads them into MockServer.

- **`webhook-receiver/`** — Lightweight Express app (ESM, Node 22). Receives and stores
  webhook events in memory (capped at 1000). Endpoints: `POST /api/v1/webhook-events`,
  `GET /api/v1/webhook-events` (with filters), `POST /api/v1/_reset`.

- **`webhook-playground/`** — Express app serving a web UI for webhook testing. Lists
  available event sources from `webhooks/events/*.json`, sends them to configurable
  target URLs with optional Basic Auth and custom headers.

- **`webhooks/events/`** — Sample webhook event payloads based on schemas from
  [hiiretail-json-schema-registry](https://github.com/extenda/hiiretail-json-schema-registry/tree/master/external-events).
  Event sources like stock corrections, goods received, customer orders, etc.

- **`cli/`** — Node.js CLI (ESM, Commander.js). Commands:
  - `mock up|down|status|logs` — Docker Compose wrapper.
  - `validate` — AJV-based validation against OpenAPI schemas fetched from canonical URLs.
  - `push` — Validates then POSTs to mock (localhost:1080) or sandbox (env-var configured).
    Sandbox auth uses OAuth2 client_credentials flow.
  - `webhook events|send|logs|clear` — List event sources, send test webhooks, view/clear logs.
  - `ccc list|validate|push|get|delete` — Manage Customer Controlled Configuration (CCC).

- **`ccc-server/`** — Lightweight Express app (ESM, Node 22). Stores CCC configs in memory
  for tenant and business unit levels. Endpoints: `GET /api/v1/config`, `PUT/GET/DELETE`
  for `/api/v1/config/{kind}/values/tenant` and `/api/v1/config/{kind}/values/business-units/{buId}`.

- **`examples/payloads/`** — Realistic JSON payloads for each API, ready to validate and push.

## API Paths

Real Hii Retail API paths (v2 for most input APIs):

| API | Path | Notes |
|-----|------|-------|
| Item (BUG level) | `/api/v2/bu-g-items` | Business Unit Group level |
| Item (BU level) | `/api/v2/bu-items` | Business Unit level |
| Price (BUG level) | `/api/v2/bu-g-price-specifications` | |
| Price (BU level) | `/api/v2/bu-price-specifications` | |
| Identifier (BUG level) | `/api/v2/bu-g-item-identifiers` | |
| Identifier (BU level) | `/api/v2/bu-item-identifiers` | |
| Item Category | `/api/v2/item-categories` | |
| Business Unit | `/api/v1/business-units` | |
| Business Unit Group | `/api/v1/groups` | |

## Key Patterns

- All Hii Retail input APIs return **202 Accepted** on success (async processing).
- Items, price specifications, and item identifiers are linked by `itemId`.
- All entities require a `businessUnitGroupId` for tenant scoping.
- GTIN identifiers are validated for length and check digit by the real API.
- The `status` field uses soft-delete: set to `DELETED` instead of removing.
- The `version` field is an ever-increasing integer managed server-side.

## Webhook Event Sources

Webhook events are based on schemas from the
[hiiretail-json-schema-registry](https://github.com/extenda/hiiretail-json-schema-registry/tree/master/external-events).

Sample event types included:
- `scr.stock-corrections.v1` — Stock adjustment events
- `stp.stock-level-updates.v2` — Inventory level changes
- `grc.goods-received.v1` — Delivery receipt events
- `cor.customer-order-updates.v2` — Order status updates
- `rec.reconciliation.v1` — Cash drawer reconciliation
- `stc.stock-count-completed.v1` — Inventory count completion
- `str.store-transfer-completed.v1` — Inter-store transfers

## Customer Controlled Configuration (CCC)

CCC is Hii Retail's system for managing tenant and business unit level configurations
like reason codes. The DevKit provides a mock CCC server for testing.

### CCC CLI Commands

```bash
devkit ccc list                                    # List available kinds
devkit ccc validate --kind rco.reason-codes.v1 -f payload.json  # Validate
devkit ccc push --kind rco.reason-codes.v1 -f payload.json      # Push to tenant
devkit ccc push --kind rco.reason-codes.v1 -f payload.json --bu store-001  # Push to BU
devkit ccc get --kind rco.reason-codes.v1          # Get tenant config
devkit ccc get --kind rco.reason-codes.v1 --bu store-001  # Get BU config
devkit ccc delete --kind rco.reason-codes.v1       # Delete tenant config
```

### Adding a New CCC Kind

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

### CCC Schema Source

Schemas are fetched from the Hii Retail JSON Schema Registry:
```
https://raw.githubusercontent.com/extenda/hiiretail-json-schema-registry/master/customer-config/{category}/{kind}.json
```

## Spec Driven Development

This project uses spec-driven development. **Write a spec before writing code.**

- **API specs** come from canonical Hii Retail URLs (not stored locally).
- **Feature specs** live in `specs/features/` (Markdown) — describe new capabilities
  before implementation.

### Workflow

1. **Spec first** — Write (or have Claude Code draft in plan mode) a feature spec
   in `specs/features/<name>.md`. Cover what changes, where, and how to verify.
2. **Review** — Read the spec, refine until the design is right.
3. **Implement** — Build from the spec. The spec is the contract.
4. **Mark done** — Add `Status: Implemented` and the commit hash to the spec header.

## Adding a New API

1. Add spec URL to `specs/urls.json`
2. Add schema mapping in `cli/src/lib/validator.js` → `API_SPEC_MAP`
3. Add path mapping in `cli/src/lib/api-client.js` → `API_PATH_MAP`

## Versions Pinned

- MockServer Docker image: `mockserver/mockserver:5.15.0`
- Swagger UI image: `swaggerapi/swagger-ui:v5.17.14`
- Node.js: 22 LTS (in Dockerfiles and for local CLI)
