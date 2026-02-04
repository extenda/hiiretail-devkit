import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// In-memory event store (capped at 1000)
// ---------------------------------------------------------------------------
const MAX_EVENTS = 1000;
const events = [];

function storeEvent(event) {
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', events: events.length });
});

// ---------------------------------------------------------------------------
// Receive webhook events
// ---------------------------------------------------------------------------
app.post('/api/v1/webhook-events', (req, res) => {
  const event = {
    ...req.body,
    receivedAt: new Date().toISOString(),
  };
  storeEvent(event);
  res.status(200).json({ message: 'Event received', id: event.id });
});

// ---------------------------------------------------------------------------
// List events (supports ?type=, ?entityId=, ?limit=, ?since= filters)
// ---------------------------------------------------------------------------
app.get('/api/v1/webhook-events', (req, res) => {
  let result = [...events];

  if (req.query.type) {
    result = result.filter(e => e.type === req.query.type);
  }
  if (req.query.entityId) {
    result = result.filter(e => e.metadata?.entityId === req.query.entityId);
  }
  if (req.query.since) {
    const since = new Date(req.query.since).toISOString();
    result = result.filter(e => e.timestamp >= since);
  }

  // Most recent first
  result.reverse();

  if (req.query.limit) {
    result = result.slice(0, parseInt(req.query.limit, 10));
  }

  res.json(result);
});

// ---------------------------------------------------------------------------
// Single event by ID
// ---------------------------------------------------------------------------
app.get('/api/v1/webhook-events/:eventId', (req, res) => {
  const event = events.find(e => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ status: 404, message: 'Event not found' });
  res.json(event);
});

// ---------------------------------------------------------------------------
// Reset (clear all events)
// ---------------------------------------------------------------------------
app.post('/api/v1/_reset', (_req, res) => {
  events.length = 0;
  res.json({ message: 'Webhook events cleared' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook receiver listening on port ${PORT}`);
});
