# ERP Integration Testing Guide

This guide explains how to use the Hii Retail DevKit to test your ERP system's
integration with Hii Retail input APIs — without connecting to Hii Retail
production or sandbox environments.

## Overview

When integrating an ERP system (SAP, Microsoft Dynamics, Oracle, custom, etc.)
with Hii Retail, your ERP needs to push product data to Hii Retail's input APIs.
The DevKit provides a local mock environment that:

- **Validates API contracts** — Requests are validated against Hii Retail's
  OpenAPI specifications
- **Returns realistic responses** — 202 Accepted on success, 400/422 on
  validation errors
- **Stores data** — Items, prices, and identifiers persist in memory for
  verification
- **Dispatches webhooks** — Simulates Hii Retail's async notifications so you
  can test your webhook receiver

This gives you a fast, isolated feedback loop for developing and debugging your
ERP integration before touching real Hii Retail infrastructure.

## Prerequisites

On the machine running the DevKit:

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2+
- [Node.js 22 LTS](https://nodejs.org/) (for the CLI)
- Network connectivity from your ERP system to this machine

## Quick Start

### 1. Start the DevKit

```bash
# Clone the repository
git clone <repo-url> && cd hiiretail-devkit

# Install CLI dependencies
cd cli && npm install && cd ..

# Start all services
npm run devkit --prefix cli -- mock up
```

You'll see:

```
Services started:
  MockServer:        http://localhost:1080
  State Server:      http://localhost:3001
  Webhook Receiver:  http://localhost:3002
  Swagger UI:        http://localhost:8080
```

### 2. Find your DevKit machine's IP address

Your ERP system needs to reach the MockServer over the network. Find the IP:

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'

# Windows
ipconfig | findstr "IPv4"
```

Example: `192.168.1.100`

### 3. Configure your ERP system

In your ERP's Hii Retail integration settings, set the API base URL to:

```
http://<devkit-machine-ip>:1080
```

For example: `http://192.168.1.100:1080`

The ERP should POST to the standard Hii Retail API paths:

| Data Type | Endpoint |
|-----------|----------|
| Items | `POST /api/v1/items` |
| Price Specifications | `POST /api/v1/price-specifications` |
| Item Identifiers | `POST /api/v1/item-identifiers` |
| Business Unit Groups | `POST /api/v1/business-unit-groups` |
| Business Units | `POST /api/v1/business-units` |
| Item Categories | `POST /api/v1/item-categories` |

### 4. Handle authentication

The MockServer **does not enforce authentication**. Configure your ERP to either:

- **Disable auth** for the mock target (if your ERP supports per-environment auth settings)
- **Send a dummy token** — The MockServer accepts any `Authorization: Bearer <token>` header and ignores it

This lets you test the payload format without dealing with OAuth2 token exchange.

### 5. Trigger your ERP sync

Run your ERP's product export, sync job, or integration workflow. The data flows to the MockServer.

### 6. Verify results

From the DevKit machine:

```bash
# Check what was stored
curl http://localhost:3001/health
```

Output shows counts:
```json
{
  "status": "ok",
  "items": 42,
  "priceSpecifications": 38,
  "itemIdentifiers": 42,
  ...
}
```

Fetch a specific item to inspect its structure:

```bash
# Get the complete item view (item + prices + identifiers)
curl http://localhost:1080/api/v1/complete-items/<item-id> | jq
```

Check webhook events:

```bash
npm run devkit --prefix cli -- webhook logs
```

## Detailed Workflows

### Testing payload validation

The MockServer validates requests against Hii Retail's OpenAPI schemas. If your
ERP sends an invalid payload, you'll get a 400 or 422 response with details.

**Example: Missing required field**

```bash
curl -X POST http://localhost:1080/api/v1/items \
  -H "Content-Type: application/json" \
  -d '{"id": "item-1"}'
```

Response (400):
```json
{
  "statusCode": 400,
  "message": "required property 'businessUnitGroupId' is missing"
}
```

Use these errors to fix your ERP's field mappings before going to production.

### Testing webhook delivery

Hii Retail sends webhook notifications when data changes. The DevKit simulates
this behavior.

**Built-in receiver**: By default, all webhooks go to the built-in receiver at
`http://localhost:3002`. View them with:

```bash
npm run devkit --prefix cli -- webhook logs
npm run devkit --prefix cli -- webhook logs --type item.created
npm run devkit --prefix cli -- webhook logs --follow  # live tail
```

**Your own receiver**: If your ERP or middleware has a webhook endpoint, register it:

```bash
npm run devkit --prefix cli -- webhook register http://<your-host>:<port>/webhook
```

Now both the built-in receiver and your endpoint receive events.

To test specific event types only:

```bash
npm run devkit --prefix cli -- webhook register http://<your-host>:<port>/webhook \
  --events item.created,price.created
```

### Testing the complete item view

After pushing an item, its price, and its identifier, verify the composed view:

```bash
curl http://localhost:1080/api/v1/complete-items/erp-item-10001 | jq
```

This returns the item with nested `priceSpecifications` and `itemIdentifiers` arrays —
the same structure Hii Retail's Complete Item Query API returns.

### Resetting state between tests

Clear all stored data without restarting containers:

```bash
npm run devkit --prefix cli -- mock reset
```

This clears items, prices, identifiers, and webhook events. The default webhook
subscription is re-registered automatically.

## Network and Firewall Configuration

### Local network testing

If your ERP and DevKit are on the same network, no special configuration is needed.
Just use the DevKit machine's LAN IP.

### Cloud VM / Remote server

If running DevKit on a cloud VM (AWS, GCP, Azure):

1. Ensure port 1080 is open in the security group / firewall rules
2. Use the VM's public IP or internal IP (depending on where your ERP runs)
3. Consider using a private network or VPN for security

### Docker networking notes

By default, Docker Compose binds MockServer to `0.0.0.0:1080`, making it accessible
on all network interfaces. If you need to restrict this:

```bash
# Edit docker-compose.yml
ports:
  - "127.0.0.1:1080:1080"  # localhost only
```

## HTTPS / TLS

The DevKit does not include TLS termination. If your ERP requires HTTPS:

**Option 1: Reverse proxy**

Put nginx, Caddy, or Traefik in front of MockServer:

```
ERP --HTTPS--> Reverse Proxy --HTTP--> MockServer:1080
```

Example nginx config:
```nginx
server {
    listen 443 ssl;
    server_name devkit.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:1080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Option 2: Self-signed certificate**

For testing only, configure your ERP to trust a self-signed cert on the reverse proxy.

## Troubleshooting

### ERP can't connect to MockServer

1. **Check MockServer is running**: `docker compose ps` should show `mockserver` as "running"
2. **Test from ERP machine**: `curl http://<devkit-ip>:1080/health`
3. **Check firewall**: Ensure port 1080 is open
4. **Check IP address**: Use the correct network interface IP

### Requests return 404

The path doesn't match any expectation. Verify:
- The path matches exactly (e.g., `/api/v1/items`, not `/items`)
- The HTTP method is correct (POST for create, PUT for update)

### Requests return 400 or 422

The payload failed schema validation. Check the response body for details:
- Missing required fields
- Wrong data types
- Invalid enum values
- Malformed JSON

### Webhooks not received

1. **Check registration**: `devkit webhook list`
2. **Check events exist**: `devkit webhook logs`
3. **Network reachable?**: Can MockServer reach your webhook URL?
4. **Check your receiver logs**: Is it receiving and acknowledging (200)?

### State not persisting

Data is stored in memory and lost when containers stop. Always use
`devkit mock reset` to clear state, not `docker compose down` (which
destroys containers).

## Typical Integration Development Workflow

```
1. ERP Developer writes field mappings (ERP fields → Hii Retail schema)
         ↓
2. Start DevKit locally or on a shared test server
         ↓
3. Configure ERP to point at MockServer URL
         ↓
4. Run ERP export job → Data flows to MockServer
         ↓
5. Check results:
   - devkit webhook logs (what events fired?)
   - curl /api/v1/complete-items/:id (what was stored?)
   - Check for 400/422 errors in ERP logs
         ↓
6. Fix mappings, repeat until clean
         ↓
7. Switch ERP to Hii Retail sandbox, run same tests
         ↓
8. Switch ERP to Hii Retail production
```

## API Reference

### MockServer endpoints (port 1080)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/items` | Create item |
| PUT | `/api/v1/items/:id` | Update item |
| DELETE | `/api/v1/items/:id` | Soft-delete item |
| POST | `/api/v1/price-specifications` | Create price |
| PUT | `/api/v1/price-specifications/:id` | Update price |
| DELETE | `/api/v1/price-specifications/:id` | Soft-delete price |
| POST | `/api/v1/item-identifiers` | Create identifier |
| PUT | `/api/v1/item-identifiers/:id` | Update identifier |
| DELETE | `/api/v1/item-identifiers/:id` | Soft-delete identifier |
| POST | `/api/v1/business-unit-groups` | Create business unit group |
| POST | `/api/v1/business-units` | Create business unit |
| POST | `/api/v1/item-categories` | Create item category |
| GET | `/api/v1/complete-items/:id` | Get composed item view |
| GET | `/health` | MockServer health check |

### State server endpoints (port 3001)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health + entity counts |
| POST | `/api/v1/_reset` | Clear all state |
| GET | `/api/v1/webhooks` | List webhook subscriptions |
| POST | `/api/v1/webhooks` | Register webhook |
| DELETE | `/api/v1/webhooks/:id` | Remove webhook |

### Webhook receiver endpoints (port 3002)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health + event count |
| GET | `/api/v1/webhook-events` | List events (supports `?type=`, `?limit=`) |
| GET | `/api/v1/webhook-events/:id` | Get single event |
| POST | `/api/v1/_reset` | Clear events |

## Further Reading

- [Hii Retail Developer Portal](https://developer.hiiretail.com) — Official API documentation
- [OpenAPI Specs](../specs/v1/) — Bundled API specifications
- [Example Payloads](../examples/payloads/) — Sample JSON for each API
- [README](../README.md) — DevKit overview and CLI reference
