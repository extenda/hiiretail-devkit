const STATE_SERVER_URL = `http://localhost:${process.env.STATE_SERVER_PORT || '3001'}`;
const WEBHOOK_RECEIVER_URL = `http://localhost:${process.env.WEBHOOK_RECEIVER_PORT || '3002'}`;

export async function registerWebhook(url, { events, secret } = {}) {
  const body = { url };
  if (events) body.events = events;
  if (secret) body.secret = secret;

  const res = await fetch(`${STATE_SERVER_URL}/api/v1/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

export async function listWebhooks() {
  const res = await fetch(`${STATE_SERVER_URL}/api/v1/webhooks`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function removeWebhook(id, { force = false } = {}) {
  const url = force
    ? `${STATE_SERVER_URL}/api/v1/webhooks/${encodeURIComponent(id)}/force`
    : `${STATE_SERVER_URL}/api/v1/webhooks/${encodeURIComponent(id)}`;

  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

export async function fetchWebhookLogs({ type, limit, since } = {}) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (limit) params.set('limit', String(limit));
  if (since) params.set('since', since);

  const qs = params.toString();
  const url = `${WEBHOOK_RECEIVER_URL}/api/v1/webhook-events${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return res.json();
}
