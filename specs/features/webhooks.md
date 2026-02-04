# Add Webhook Support to DevKit

> **Status:** Implemented
> **Commit:** `ecb71d4`

## Summary

Add webhook dispatching to the state server, a built-in webhook receiver service, and CLI commands for webhook management. After any mutation (push item, update price, etc.), the state server fires HTTP POST callbacks to registered webhook URLs — letting developers test that their ERP integration handles Hii Retail's async notifications correctly.

## New Files

### `webhook-receiver/server.js` — Built-in webhook receiver service
Express.js app (ESM, Node 22), ~80 lines, matching state-server patterns.
- `POST /api/v1/webhook-events` — Receives webhook POSTs, stores in memory, returns 200
- `GET /api/v1/webhook-events` — Lists stored events (supports `?type=`, `?entityId=`, `?limit=`, `?since=` filters)
- `GET /api/v1/webhook-events/:eventId` — Single event by ID
- `POST /api/v1/_reset` — Clear stored events
- `GET /health` — Status + event count
- In-memory array, capped at 1000 entries (oldest dropped)
- Port 3002

### `webhook-receiver/package.json` + `webhook-receiver/Dockerfile`
Same patterns as state-server (Node 22 alpine, express 4.21.0).

### `cli/src/commands/webhook.js` — CLI webhook commands
- `devkit webhook register <url>` — Register a webhook (options: `--events`, `--secret`)
- `devkit webhook list` — Show all subscriptions
- `devkit webhook remove <id>` — Remove a subscription (`--force` for default)
- `devkit webhook logs` — Show received events (`--type`, `--limit`, `--follow`)

### `cli/src/lib/webhook-client.js` — HTTP helpers
Functions: `registerWebhook()`, `listWebhooks()`, `removeWebhook()`, `fetchWebhookLogs()`

## Modified Files

### `state-server/server.js` — Core changes
- Add `webhookSubscriptions` Map
- Add `dispatchWebhooks(eventType, entityType, action, entityId, data, path)` utility
  - Iterates subscriptions, filters by event type (`*` = all)
  - Fires async fetch POST (fire-and-forget, errors logged not thrown)
  - Optional HMAC-SHA256 signing when subscription has a `secret`
  - Optional delay via `WEBHOOK_DELAY_MS` env var
- Instrument all 18 mutation handlers (POST/PUT/DELETE x 6 entities) to call `dispatchWebhooks` after the 202 response
- Add CRUD endpoints: `POST/GET/DELETE /api/v1/webhooks`
- Auto-register built-in receiver (`http://webhook-receiver:3002/api/v1/webhook-events`) on startup
- Update `/_reset` to clear subscriptions, re-register default, clear receiver logs
- Update `/health` to include webhook subscription count

### `docker-compose.yml`
- Add `webhook-receiver` service (port 3002, `devkit` network, healthcheck)
- Add `depends_on` so state-server waits for webhook-receiver health

### `mockserver/init/expectations/forward-to-state.json`
- Add 4 forwarding rules for webhook management API (POST, GET, GET/:id, DELETE/:id)

### `cli/bin/devkit.js` — Register webhook command
### `cli/src/commands/mock.js` — Print webhook-receiver URL on `mock up`
### `.env.example` — Add `WEBHOOK_RECEIVER_PORT`, `WEBHOOK_DELAY_MS`
### `README.md` + `CLAUDE.md` — Document webhook feature

## Webhook Event Payload

```json
{
  "id": "evt-a1b2c3d4",
  "type": "item.created",
  "timestamp": "2026-02-02T15:30:00.000Z",
  "data": { "...full entity snapshot..." },
  "metadata": {
    "entityType": "item",
    "action": "created",
    "entityId": "erp-item-10001",
    "path": "/api/v1/items"
  }
}
```

Headers: `X-Webhook-Event`, `X-Webhook-Id`, `X-Webhook-Timestamp`, `X-Webhook-Signature` (if secret set).

18 event types: `{item|price|identifier|business-unit-group|business-unit|item-category}.{created|updated|deleted}`

## Verification

```bash
docker compose down && docker compose up -d --build
devkit webhook list                    # shows default subscription
devkit push --api item --file examples/payloads/items/organic-milk.json
devkit webhook logs                    # shows item.created event
devkit webhook register http://host.docker.internal:9000/hook --events item.created
devkit push --api item --file examples/payloads/items/sourdough-bread.json
devkit webhook logs --limit 5          # shows both events
devkit webhook remove <custom-id>
devkit mock reset                      # clears everything, re-registers default
devkit webhook logs                    # empty
curl http://localhost:3001/health      # includes webhookSubscriptions count
curl http://localhost:3002/health      # includes events count
```
