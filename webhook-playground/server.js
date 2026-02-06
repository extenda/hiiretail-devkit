import express from 'express';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const EVENTS_DIR = process.env.EVENTS_DIR || '/events';

// ---------------------------------------------------------------------------
// List available event sources
// ---------------------------------------------------------------------------
app.get('/api/event-sources', async (_req, res) => {
  try {
    const files = await readdir(EVENTS_DIR);
    const eventSources = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort();
    res.json(eventSources);
  } catch (err) {
    console.error('Failed to list event sources:', err.message);
    res.status(500).json({ error: 'Failed to list event sources' });
  }
});

// ---------------------------------------------------------------------------
// Get payload for a specific event source
// ---------------------------------------------------------------------------
app.get('/api/event-sources/:id', async (req, res) => {
  try {
    const filePath = join(EVENTS_DIR, `${req.params.id}.json`);
    const content = await readFile(filePath, 'utf-8');
    res.json(JSON.parse(content));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Event source not found' });
    }
    console.error('Failed to read event source:', err.message);
    res.status(500).json({ error: 'Failed to read event source' });
  }
});

// ---------------------------------------------------------------------------
// Send webhook to target URL
// ---------------------------------------------------------------------------
app.post('/api/send', async (req, res) => {
  const { eventSource, targetUrl, auth, headers: customHeaders } = req.body;

  if (!eventSource || !targetUrl) {
    return res.status(400).json({ error: 'eventSource and targetUrl are required' });
  }

  // Load the event payload
  let payload;
  try {
    const filePath = join(EVENTS_DIR, `${eventSource}.json`);
    const content = await readFile(filePath, 'utf-8');
    payload = JSON.parse(content);
    // Update timestamp to now
    payload.timestamp = new Date().toISOString();
    payload.id = `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Event source not found' });
    }
    return res.status(500).json({ error: 'Failed to load event payload' });
  }

  // Build headers
  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': payload.type,
    'X-Webhook-Id': payload.id,
    'X-Webhook-Timestamp': payload.timestamp,
  };

  // Add Basic Auth if provided
  if (auth?.type === 'basic' && auth.username && auth.password) {
    const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  // Add custom headers
  if (customHeaders && typeof customHeaders === 'object') {
    for (const [key, value] of Object.entries(customHeaders)) {
      if (key && value) {
        headers[key] = value;
      }
    }
  }

  // Send the webhook
  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    let responseBody;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    res.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: responseBody,
      sentPayload: payload,
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
      sentPayload: payload,
    });
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook Playground listening on port ${PORT}`);
  console.log(`Events directory: ${EVENTS_DIR}`);
});
