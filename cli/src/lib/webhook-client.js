const WEBHOOK_RECEIVER_URL = `http://localhost:${process.env.WEBHOOK_RECEIVER_PORT || '3002'}`;
const WEBHOOK_PLAYGROUND_URL = `http://localhost:${process.env.WEBHOOK_PLAYGROUND_PORT || '8081'}`;

export async function fetchEventSources() {
  const res = await fetch(`${WEBHOOK_PLAYGROUND_URL}/api/event-sources`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function sendWebhook(eventSource, targetUrl, { auth, headers } = {}) {
  const body = { eventSource, targetUrl };
  if (auth) body.auth = auth;
  if (headers) body.headers = headers;

  const res = await fetch(`${WEBHOOK_PLAYGROUND_URL}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function clearWebhookLogs() {
  const res = await fetch(`${WEBHOOK_RECEIVER_URL}/api/v1/_reset`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}
