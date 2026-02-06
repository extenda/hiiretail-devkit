# ERP Integration Testing Guide

This guide explains how to use the Hii Retail DevKit to test your ERP system's
integration with Hii Retail input APIs — without connecting to Hii Retail
production or sandbox environments.

## Overview

When integrating an ERP system (SAP, Microsoft Dynamics, Oracle, custom, etc.)
with Hii Retail, your ERP needs to push product data to Hii Retail's input APIs.
The DevKit provides a local mock environment that:

- **Validates API contracts** — Requests are validated against Hii Retail's
  OpenAPI specifications (fetched from canonical URLs)
- **Returns realistic responses** — 202 Accepted on success, 400/422 on
  validation errors

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
  MockServer:           http://localhost:1080
  Webhook Playground:   http://localhost:8081
  Webhook Receiver:     http://localhost:3002
  Swagger UI:           http://localhost:8080
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
| Items (BUG level) | `POST /api/v2/bu-g-items` |
| Items (BU level) | `POST /api/v2/bu-items` |
| Price Specifications (BUG level) | `POST /api/v2/bu-g-price-specifications` |
| Price Specifications (BU level) | `POST /api/v2/bu-price-specifications` |
| Item Identifiers (BUG level) | `POST /api/v2/bu-g-item-identifiers` |
| Item Identifiers (BU level) | `POST /api/v2/bu-item-identifiers` |
| Item Categories | `POST /api/v2/item-categories` |
| Business Units | `POST /api/v1/business-units` |
| Business Unit Groups | `POST /api/v1/groups` |

### 4. Handle authentication

The MockServer **does not enforce authentication**. Configure your ERP to either:

- **Disable auth** for the mock target (if your ERP supports per-environment auth settings)
- **Send a dummy token** — The MockServer accepts any `Authorization: Bearer <token>` header and ignores it

This lets you test the payload format without dealing with OAuth2 token exchange.

### 5. Trigger your ERP sync

Run your ERP's product export, sync job, or integration workflow. The data flows to the MockServer.

### 6. Check MockServer logs

From the DevKit machine:

```bash
# View MockServer logs to see what requests were received
npm run devkit --prefix cli -- mock logs --service mockserver

# Or use docker compose directly
docker compose logs mockserver
```

## Detailed Workflows

### Testing payload validation

The MockServer validates requests against Hii Retail's OpenAPI schemas. If your
ERP sends an invalid payload, you'll get a 400 or 422 response with details.

**Example: Missing required field**

```bash
curl -X POST http://localhost:1080/api/v2/bu-g-items \
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

You can test how your middleware handles Hii Retail webhook events using the
DevKit's Webhook Playground.

**Using the Web UI** (recommended):

1. Open http://localhost:8081 in your browser
2. Select an event source (e.g., `scr.stock-corrections.v1`)
3. Enter your middleware's webhook URL as the target
4. Add Basic Auth credentials if required
5. Add any custom headers your middleware expects
6. Click "Send Webhook"

**Using the CLI**:

```bash
# List available event sources
npm run devkit --prefix cli -- webhook events

# Send an event to your middleware
npm run devkit --prefix cli -- webhook send scr.stock-corrections.v1 \
  --target http://your-middleware:9000/webhook \
  --username apiuser \
  --password secret123

# Or send to the built-in receiver for inspection
npm run devkit --prefix cli -- webhook send grc.goods-received.v1
npm run devkit --prefix cli -- webhook logs
```

### Viewing received webhook events

The built-in webhook receiver stores events for inspection:

```bash
npm run devkit --prefix cli -- webhook logs
npm run devkit --prefix cli -- webhook logs --type scr
npm run devkit --prefix cli -- webhook logs --follow  # live tail
```

Clear events when done:

```bash
npm run devkit --prefix cli -- webhook clear
```

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
- The path matches exactly (e.g., `/api/v2/bu-g-items`, not `/items`)
- The API version is correct (v2 for most input APIs, v1 for business unit management)
- The HTTP method is correct (POST for create, PUT for update)

### Requests return 400 or 422

The payload failed schema validation. Check the response body for details:
- Missing required fields
- Wrong data types
- Invalid enum values
- Malformed JSON

### Webhooks not received by your middleware

1. **Can MockServer/Playground reach your URL?**: Test connectivity
2. **Check your middleware logs**: Is it receiving requests?
3. **Check response codes**: Your endpoint should return 2xx
4. **Use the built-in receiver first**: Send to the default target to verify the event is correct

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
   - MockServer logs for request/response details
   - Fix 400/422 errors based on validation messages
         ↓
6. Test webhook handling separately with Webhook Playground
         ↓
7. Switch ERP to Hii Retail sandbox, run same tests
         ↓
8. Switch ERP to Hii Retail production
```

## API Reference

### MockServer endpoints (port 1080)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/bu-g-items` | Create item (BUG level) |
| POST | `/api/v2/bu-items` | Create item (BU level) |
| POST | `/api/v2/bu-g-price-specifications` | Create price (BUG level) |
| POST | `/api/v2/bu-price-specifications` | Create price (BU level) |
| POST | `/api/v2/bu-g-item-identifiers` | Create identifier (BUG level) |
| POST | `/api/v2/bu-item-identifiers` | Create identifier (BU level) |
| POST | `/api/v2/item-categories` | Create item category |
| POST | `/api/v1/business-units` | Create business unit |
| POST | `/api/v1/groups` | Create business unit group |
| GET | `/health` | MockServer health check |

### Webhook Playground endpoints (port 8081)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/event-sources` | List available event sources |
| GET | `/api/event-sources/:id` | Get event payload |
| POST | `/api/send` | Send webhook to target URL |
| GET | `/health` | Health check |

### Webhook Receiver endpoints (port 3002)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health + event count |
| GET | `/api/v1/webhook-events` | List events (supports `?type=`, `?limit=`) |
| POST | `/api/v1/webhook-events` | Receive webhook events |
| POST | `/api/v1/_reset` | Clear events |

## Further Reading

- [Hii Retail Developer Portal](https://developer.hiiretail.com) — Official API documentation
- [hiiretail-json-schema-registry](https://github.com/extenda/hiiretail-json-schema-registry) — Webhook event schemas
- [Example Payloads](../examples/payloads/) — Sample JSON for each API
- [README](../README.md) — DevKit overview and CLI reference
