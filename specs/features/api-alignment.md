# Align DevKit with Real Hii Retail APIs — Contract Validation + Webhook Testing

> **Status:** Draft

## Summary

Refactor the DevKit to:
1. Fetch OpenAPI specs from canonical Hii Retail URLs at startup
2. Validate incoming requests against those specs (return 202 or 400)
3. Provide a webhook event library that developers can trigger via CLI to test their receivers
4. Remove entity storage, Complete Item Query, and verify command

The DevKit provides two independent capabilities:
- **Contract validation** — Validate ERP requests against real Hii Retail OpenAPI specs
- **Webhook testing** — Trigger sample webhook events to test receiver implementations

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FEATURE 1: Contract Validation                                             │
│                                                                             │
│  ┌─────────────┐     POST      ┌─────────────────────────────────────────┐ │
│  │ ERP System  │ ───────────►  │  MockServer :1080                       │ │
│  └─────────────┘               │  - Validates against OpenAPI specs      │ │
│                                │  - 202 Accepted (valid)                 │ │
│                                │  - 400 Bad Request (invalid)            │ │
│                                └─────────────────────────────────────────┘ │
│                                              ▲                              │
│                                              │ specs fetched at startup     │
│                                ┌─────────────┴─────────────┐                │
│                                │  developer.hiiretail.com  │                │
│                                └───────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  FEATURE 2: Webhook Testing                                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Webhook Playground UI :8081                                        │   │
│  │  - Select event source                                              │   │
│  │  - Configure target URL, Basic Auth, custom headers                 │   │
│  │  - Preview payload, send webhook                                    │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │ sends                                    │
│                  ┌───────────────┴───────────────┐                          │
│                  ▼                               ▼                          │
│   ┌──────────────────────────┐    ┌──────────────────────────┐             │
│   │ Built-in Receiver :3002  │    │ Developer's Webhook      │             │
│   │ (devkit webhook logs)    │    │ Receiver                 │             │
│   └──────────────────────────┘    └──────────────────────────┘             │
│                                                                             │
│  Alternative: CLI                                                           │
│  ┌─────────────────────┐                                                   │
│  │ devkit webhook send │ ───► Same functionality via command line          │
│  │ bu-g-item.created   │                                                   │
│  └─────────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Canonical Spec URLs

```json
{
  "item-input": "https://developer.hiiretail.com/swagger/item-input-api",
  "item-identifier-input": "https://developer.hiiretail.com/swagger/item-identifier-input-api",
  "price-specification-input": "https://developer.hiiretail.com/swagger/price-specification-input-api",
  "business-unit": "https://developer.hiiretail.com/swagger/business-unit-api",
  "item-category-input": "https://developer.hiiretail.com/swagger/item-category-input-api"
}
```

## Real API Paths (from specs)

### Item Input API (v2)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/bu-g-items` | Create item at group level |
| PUT | `/api/v2/bu-g-items` | Replace item at group level |
| DELETE | `/api/v2/bu-g-items/{id}` | Delete item at group level |
| PATCH | `/api/v2/bu-g-items/{id}` | Partial update at group level |
| POST | `/api/v2/bu-items` | Create item at unit level |
| PUT | `/api/v2/bu-items` | Replace item at unit level |
| DELETE | `/api/v2/bu-items/{id}` | Delete item at unit level |
| PATCH | `/api/v2/bu-items/{id}` | Partial update at unit level |

### Price Specification Input API (v2)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/bu-g-price-specifications` | Create at group level |
| PUT | `/api/v2/bu-g-price-specifications` | Replace at group level |
| DELETE | `/api/v2/bu-g-price-specifications/{id}` | Delete at group level |
| PATCH | `/api/v2/bu-g-price-specifications/{id}` | Partial update at group level |
| POST | `/api/v2/bu-price-specifications` | Create at unit level |
| PUT | `/api/v2/bu-price-specifications` | Replace at unit level |
| DELETE | `/api/v2/bu-price-specifications/{id}` | Delete at unit level |
| PATCH | `/api/v2/bu-price-specifications/{id}` | Partial update at unit level |

### Item Identifier Input API (v2)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/bu-g-item-identifiers` | Create at group level |
| PUT | `/api/v2/bu-g-item-identifiers` | Replace at group level |
| DELETE | `/api/v2/bu-g-item-identifiers/{id}` | Delete at group level |
| PATCH | `/api/v2/bu-g-item-identifiers/{id}` | Partial update at group level |
| POST | `/api/v2/bu-item-identifiers` | Create at unit level |
| PUT | `/api/v2/bu-item-identifiers` | Replace at unit level |
| DELETE | `/api/v2/bu-item-identifiers/{id}` | Delete at unit level |
| PATCH | `/api/v2/bu-item-identifiers/{id}` | Partial update at unit level |

### Item Category Input API (v2)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/item-categories` | Create category |
| PUT | `/api/v2/item-categories` | Replace category |
| DELETE | `/api/v2/item-categories/{id}` | Delete category |
| PATCH | `/api/v2/item-categories/{id}` | Partial update |

### Business Unit Management API (v1)
| Method | Path | Description |
|--------|------|-------------|
| PUT | `/api/v1/business-units/{id}` | Create/update business unit |
| PATCH | `/api/v1/business-units/{id}` | Partial update |
| DELETE | `/api/v1/business-units/{id}` | Delete business unit |
| POST | `/api/v1/groups` | Create group |
| PUT | `/api/v1/groups/{id}` | Update group |
| DELETE | `/api/v1/groups/{id}` | Delete group |

## Components

### mockserver-init (modified)
- Fetch OpenAPI specs from canonical URLs at startup
- Generate MockServer expectations from specs
- Load forwarding rules to webhook-dispatcher

### MockServer (unchanged image, new expectations)
- Validates requests against fetched OpenAPI specs
- Returns 202 Accepted for valid requests
- Returns 400 Bad Request with validation errors for invalid requests
- Forwards valid requests to webhook-dispatcher

### webhook-dispatcher (renamed from state-server)
Simplified Express service — manages webhook subscriptions and sends events on demand:

```javascript
// Webhook subscription management
POST   /api/v1/webhooks              // Register subscription
GET    /api/v1/webhooks              // List subscriptions
DELETE /api/v1/webhooks/:id          // Remove subscription

// Trigger webhook from library
POST   /api/v1/webhooks/send         // Send event to all subscribers
       // Body: { "eventType": "bu-g-item.created" }

// Health
GET    /health                       // Status + subscription count

// Reset
POST   /api/v1/_reset                // Clear subscriptions, re-register default
```

### webhook-receiver (unchanged)
Built-in receiver for capturing/inspecting webhook events.

### webhook-playground (new service, port 8081)
Web UI for triggering webhook events. Simple Express server serving static HTML/JS.

**Features:**
- Dropdown to select event source (static fixtures)
- Target URL input
- Basic Authentication (username/password)
- Custom headers (add/remove key-value pairs)
- Payload preview (read-only JSON view)
- Send button + response display

**UI Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Hii Retail DevKit - Webhook Playground                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Event Source:  [dropdown: select event type ▼]        │
│                                                         │
│  Target URL:    [http://localhost:9000/webhook    ]    │
│                                                         │
│  Authentication:                                        │
│  ○ None  ● Basic Auth                                  │
│    Username: [____________]                            │
│    Password: [____________]                            │
│                                                         │
│  Custom Headers:                                        │
│  ┌──────────────┬────────────────────┬───┐            │
│  │ Header Name  │ Value              │ ✕ │            │
│  ├──────────────┼────────────────────┼───┤            │
│  │ X-Tenant-Id  │ my-tenant          │ ✕ │            │
│  └──────────────┴────────────────────┴───┘            │
│  [+ Add Header]                                        │
│                                                         │
│  Payload Preview:                                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │ { "id": "evt-...", "type": "...", ... }         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Send Webhook]                              [Reset]   │
│                                                         │
│  Response:                                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Status: 200 OK                                  │   │
│  │ Body: {"received": true}                        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**API Endpoints (served by webhook-playground):**
```
GET  /                           # Serves the UI
GET  /api/event-sources          # List available event sources
GET  /api/event-sources/:id      # Get payload for specific event source
POST /api/send                   # Send webhook to target URL
     Body: { eventSource, targetUrl, auth, headers }
```

### Swagger UI (modified config)
Points to remote spec URLs instead of local files.

## Webhook Event Library

A collection of sample webhook payloads representing events Hii Retail sends.
Stored in `webhooks/events/` directory:

```
webhooks/events/
  bu-g-item.created.json
  bu-g-item.updated.json
  bu-g-item.deleted.json
  bu-item.created.json
  bu-item.updated.json
  bu-item.deleted.json
  bu-g-price-specification.created.json
  bu-g-price-specification.updated.json
  bu-g-price-specification.deleted.json
  ... (all supported event types)
```

Each file contains a realistic sample payload matching Hii Retail's webhook format.

### Webhook Event Payload Format

```json
{
  "id": "evt-a1b2c3d4",
  "type": "bu-g-item.created",
  "timestamp": "2026-02-06T15:30:00.000Z",
  "data": { "...sample entity data..." },
  "metadata": {
    "tenantId": "sample-tenant",
    "correlationId": "sample-correlation-id"
  }
}
```

Headers sent: `X-Webhook-Event`, `X-Webhook-Id`, `X-Webhook-Timestamp`, `X-Webhook-Signature` (if secret set).

### Supported Event Types

```
bu-g-item.created, bu-g-item.updated, bu-g-item.deleted
bu-item.created, bu-item.updated, bu-item.deleted
bu-g-price-specification.created, bu-g-price-specification.updated, bu-g-price-specification.deleted
bu-price-specification.created, bu-price-specification.updated, bu-price-specification.deleted
bu-g-item-identifier.created, bu-g-item-identifier.updated, bu-g-item-identifier.deleted
bu-item-identifier.created, bu-item-identifier.updated, bu-item-identifier.deleted
item-category.created, item-category.updated, item-category.deleted
business-unit.created, business-unit.updated, business-unit.deleted
group.created, group.updated, group.deleted
```

### CLI Commands for Webhook Testing

```bash
# List available event types
devkit webhook events

# Send a sample event to all registered receivers
devkit webhook send bu-g-item.created

# Send to a specific URL (one-off, no registration needed)
devkit webhook send bu-g-item.created --to http://localhost:9000/webhook

# List registered receivers
devkit webhook list

# Register a receiver
devkit webhook register http://localhost:9000/webhook

# View received events (from built-in receiver)
devkit webhook logs
```

## Files to Remove

- `specs/v1/*.yaml` — All local specs (fetch from URLs instead)
- `cli/src/commands/verify.js` — No Complete Item Query
- Entity storage logic in state-server
- MockServer forwarding to state-server (no longer needed for validation)

## New Files

### `webhooks/events/*.json` — Webhook event library
Sample payloads for each supported event type. These represent what Hii Retail
sends to webhook subscribers when entities change.

## Files to Modify

### `specs/urls.json` (new)
```json
{
  "item-input": "https://developer.hiiretail.com/swagger/item-input-api",
  "item-identifier-input": "https://developer.hiiretail.com/swagger/item-identifier-input-api",
  "price-specification-input": "https://developer.hiiretail.com/swagger/price-specification-input-api",
  "business-unit": "https://developer.hiiretail.com/swagger/business-unit-api",
  "item-category-input": "https://developer.hiiretail.com/swagger/item-category-input-api"
}
```

### `mockserver/init/load-expectations.js`
- Fetch specs from URLs (with retry/timeout)
- Generate expectations for all paths in specs
- Set up forwarding to webhook-dispatcher

### `mockserver/init/expectations/forward-to-state.json`
- Remove entity forwarding rules (no longer needed)
- Keep only webhook management forwarding (`/api/v1/webhooks/*`)

### `state-server/` → rename to `webhook-dispatcher/`
- Remove all entity Maps (items, prices, etc.)
- Remove all entity routes
- Keep webhook subscription management
- Add `POST /api/v1/webhooks/send` endpoint to trigger events from library
- Load event payloads from `webhooks/events/` directory
- Update health endpoint (subscription count only)

### `cli/src/lib/api-client.js`
- Update API_PATH_MAP with correct paths
- Remove fetchCompleteItem()

### `cli/src/lib/validator.js`
- Fetch specs from URLs instead of local files
- Cache for session

### `cli/bin/devkit.js`
- Remove verify command registration

### `docker-compose.yml`
- Rename state-server service to webhook-dispatcher
- Update Swagger UI to use remote spec URLs
- Remove specs volume mount from swagger-ui

### Documentation
- README.md — Update architecture, paths, remove verify
- CLAUDE.md — Update architecture, remove storage references
- docs/erp-integration-testing.md — Update paths, simplify (no storage)

## CLI Commands (Updated)

```bash
# Docker management
devkit mock up|down|status|reset

# Contract validation
devkit validate <file> --api <api>              # Offline validation (fetches spec from URL)
devkit push --api <api> --file <f> --target mock  # Push to MockServer for validation

# Webhook testing
devkit webhook events                           # List available event types
devkit webhook send <event-type>                # Send sample event to registered receivers
devkit webhook send <event-type> --to <url>     # Send to specific URL
devkit webhook register <url>                   # Register a receiver
devkit webhook list                             # List registered receivers
devkit webhook remove <id>                      # Remove a receiver
devkit webhook logs                             # View events received by built-in receiver
```

### API names for --api flag (contract validation)
```
bu-g-item, bu-item
bu-g-price, bu-price
bu-g-identifier, bu-identifier
item-category
business-unit
group
```

## Implementation Order

1. Create `specs/urls.json` with canonical spec URLs
2. Create `webhooks/events/*.json` — sample payloads for each event type
3. Create `webhook-playground/` service (Express + static HTML/JS UI)
4. Update `mockserver/init/load-expectations.js` to fetch specs from URLs
5. Remove MockServer forwarding rules (validation only, no state)
6. Simplify `state-server/` → `webhook-dispatcher/` (remove storage, keep subscription management)
7. Update `cli/src/lib/api-client.js` paths
8. Update `cli/src/lib/validator.js` to fetch specs from URLs
9. Update `cli/src/commands/webhook.js` — add `events` and `send` commands
10. Remove `cli/src/commands/verify.js`, update `cli/bin/devkit.js`
11. Update `docker-compose.yml` — add webhook-playground, update configs
12. Delete `specs/v1/*.yaml`
13. Update example payloads to match real schemas
14. Update all documentation

## Verification

```bash
# Rebuild
docker compose down && docker compose up -d --build

# Check specs were fetched
docker compose logs mockserver-init | grep -i "fetched"

# --- Contract Validation ---

# Valid request → 202
curl -X POST http://localhost:1080/api/v2/bu-g-items \
  -H "Content-Type: application/json" \
  -H "Correlation-Id: test-123" \
  -d '{"id": "item-001", "businessUnitGroupId": "grp-001", "name": "Test", ...}'
# Response: 202 Accepted

# Invalid request → 400
curl -X POST http://localhost:1080/api/v2/bu-g-items \
  -H "Content-Type: application/json" \
  -d '{"invalid": "payload"}'
# Response: 400 Bad Request with validation errors

# CLI validation (offline, fetches spec)
devkit validate examples/payloads/bu-g-items/sample.json --api bu-g-item

# --- Webhook Testing ---

# List available event types
devkit webhook events
# Output: bu-g-item.created, bu-g-item.updated, ...

# Register a test receiver (or use built-in)
devkit webhook register http://localhost:9000/my-receiver

# Send a sample event
devkit webhook send bu-g-item.created

# Check built-in receiver captured it
devkit webhook logs
# Shows: bu-g-item.created event

# Send directly to a URL without registering
devkit webhook send bu-g-item.updated --to http://localhost:9000/my-receiver

# --- Webhook Playground UI ---
open http://localhost:8081

# 1. Select event source from dropdown (e.g., bu-g-item.created)
# 2. Enter target URL: http://webhook-receiver:3002/api/v1/webhook-events
# 3. Optionally configure Basic Auth and custom headers
# 4. Click "Send Webhook"
# 5. See response status

# Verify built-in receiver got the event
devkit webhook logs

# --- Swagger UI ---
open http://localhost:8080
# Shows remote specs from developer.hiiretail.com
```
