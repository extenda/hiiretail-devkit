# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Docker-first ERP Integration DevKit for Hii Retail input APIs. Provides a local
mock environment (MockServer + stateful sidecar), a Node.js CLI for validation
and pushing payloads, and bundled OpenAPI specs. Target audience: ERP integration
developers who need a fast local loop against Hii Retail APIs.

## Commands

```bash
# Install CLI dependencies
cd cli && npm install

# Start the full mock environment (MockServer + state server + Swagger UI)
docker compose up -d --build

# Stop everything
docker compose down

# Run CLI commands (from repo root)
npm run devkit --prefix cli -- mock up
npm run devkit --prefix cli -- mock down
npm run devkit --prefix cli -- validate <payload.json> --api <item|price|identifier>
npm run devkit --prefix cli -- push --api <api> --file <file> --target <mock|sandbox>
npm run devkit --prefix cli -- verify --item-id <id> --target <mock|sandbox>
npm run devkit --prefix cli -- webhook list
npm run devkit --prefix cli -- webhook logs

# Run CLI tests
cd cli && npm test
```

## Architecture

- **`specs/v1/`** — Pinned OpenAPI 3.0.3 YAML specs for Hii Retail APIs. These are the
  source of truth for schema validation and MockServer expectations. Four specs:
  item-input-api, price-specification-input-api, item-identifier-input-api, complete-item-query-api.

- **`docker-compose.yml`** — Orchestrates five services:
  - `mockserver` (port 1080): MockServer 5.15.0 — single entry point for all mocked endpoints.
    Loads static expectations from `mockserver/expectations/init-expectations.json` on startup.
  - `state-server` (port 3001): Express.js in-memory store. Receives forwarded POST/PUT/DELETE
    from MockServer and stores items/prices/identifiers. Serves composed complete-item views.
    Dispatches webhook events on every mutation.
  - `webhook-receiver` (port 3002): Built-in webhook receiver. Stores events in memory for
    inspection via CLI (`devkit webhook logs`) or direct HTTP.
  - `swagger-ui` (port 8080): Swagger UI serving the bundled specs.
  - `mockserver-init`: One-shot container that waits for MockServer health, then loads
    OpenAPI-derived expectations and custom forwarding rules via the MockServer REST API.

- **`mockserver/`** — MockServer configuration:
  - `expectations/init-expectations.json` — Static expectations loaded on container start (health endpoint).
  - `init/load-expectations.js` — Node.js script that parses OpenAPI specs, generates
    expectations per endpoint, and loads them + custom expectations via PUT /mockserver/expectation.
  - `init/expectations/forward-to-state.json` — Higher-priority forwarding expectations that
    proxy all input API mutations + complete-item GETs to the state server.

- **`state-server/`** — Lightweight Express app (ESM, Node 22). Stores entities in
  `Map` objects. Exposes same REST paths as the real APIs plus `GET /api/v1/complete-items/:id`
  for composed views and `POST /api/v1/_reset` for clearing state. Also manages webhook
  subscriptions (`/api/v1/webhooks` CRUD) and dispatches events on every mutation.

- **`webhook-receiver/`** — Lightweight Express app (ESM, Node 22). Receives and stores
  webhook events in memory (capped at 1000). Endpoints: `POST /api/v1/webhook-events`,
  `GET /api/v1/webhook-events` (with filters), `GET /api/v1/webhook-events/:id`,
  `POST /api/v1/_reset`.

- **`cli/`** — Node.js CLI (ESM, Commander.js). Commands:
  - `mock up|down|status|reset` — Docker Compose wrapper.
  - `validate` — AJV-based offline validation against OpenAPI schemas. Resolves `$ref`s
    from the spec files, formats errors with JSON pointers and fix suggestions.
  - `push` — Validates then POSTs to mock (localhost:1080) or sandbox (env-var configured).
    Sandbox auth uses OAuth2 client_credentials flow.
  - `verify` — GETs complete item, optionally diffs against expected JSON using deep-diff.
    Ignores server-set fields (created, modified, version, revision).
  - `webhook register|list|remove|logs` — Manage webhook subscriptions and view events.

- **`examples/payloads/`** — Realistic JSON payloads for each API, ready to validate and push.

- **`datasets/`** — CSV and JSON product catalogs + ERP→Hii Retail field mapping reference.

## Key Patterns

- All Hii Retail input APIs return **202 Accepted** on success (async processing).
- Items, price specifications, and item identifiers are linked by `itemId`.
- All entities require a `businessUnitGroupId` for tenant scoping.
- GTIN identifiers are validated for length and check digit by the real API.
- The `status` field uses soft-delete: set to `DELETED` instead of removing.
- The `version` field is an ever-increasing integer managed server-side.
- Every mutation dispatches webhook events to registered subscribers (fire-and-forget).
- A default webhook to the built-in receiver is auto-registered on startup and after reset.
- 18 event types: `{item|price|identifier|business-unit-group|business-unit|item-category}.{created|updated|deleted}`

## Adding a New API

1. Add spec to `specs/v1/<name>.yaml`
2. Add schema mapping in `cli/src/lib/validator.js` → `API_SPEC_MAP`
3. Add path mapping in `cli/src/lib/api-client.js` → `API_PATH_MAP`
4. Add forwarding expectations in `mockserver/init/expectations/`
5. Add corresponding routes in `state-server/server.js` if stateful behavior is needed

## Versions Pinned

- MockServer Docker image: `mockserver/mockserver:5.15.0`
- Swagger UI image: `swaggerapi/swagger-ui:v5.17.14`
- Node.js: 22 LTS (in Dockerfiles and for local CLI)
- OpenAPI spec format: 3.0.3
