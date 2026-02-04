import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// In-memory stores keyed by id
// ---------------------------------------------------------------------------
const items = new Map();
const priceSpecifications = new Map();
const itemIdentifiers = new Map();
const businessUnitGroups = new Map();
const businessUnits = new Map();
const itemCategories = new Map();

// ---------------------------------------------------------------------------
// Webhook subscriptions
// ---------------------------------------------------------------------------
const webhookSubscriptions = new Map();
const WEBHOOK_DELAY_MS = parseInt(process.env.WEBHOOK_DELAY_MS || '0', 10);
const DEFAULT_RECEIVER_URL = 'http://webhook-receiver:3002/api/v1/webhook-events';

function registerDefaultWebhook() {
  webhookSubscriptions.set('default', {
    id: 'default',
    url: DEFAULT_RECEIVER_URL,
    events: ['*'],
    secret: null,
    createdAt: new Date().toISOString(),
  });
}

registerDefaultWebhook();

// ---------------------------------------------------------------------------
// Webhook dispatch (fire-and-forget)
// ---------------------------------------------------------------------------
function dispatchWebhooks(eventType, entityType, action, entityId, data, path) {
  const event = {
    id: `evt-${crypto.randomUUID().split('-')[0]}`,
    type: eventType,
    timestamp: new Date().toISOString(),
    data,
    metadata: { entityType, action, entityId, path },
  };

  for (const sub of webhookSubscriptions.values()) {
    const match = sub.events.includes('*') || sub.events.includes(eventType);
    if (!match) continue;

    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': eventType,
      'X-Webhook-Id': event.id,
      'X-Webhook-Timestamp': event.timestamp,
    };

    if (sub.secret) {
      const signature = crypto
        .createHmac('sha256', sub.secret)
        .update(JSON.stringify(event))
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const send = () =>
      fetch(sub.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
      }).catch(err => console.error(`Webhook delivery failed (${sub.id} → ${sub.url}):`, err.message));

    if (WEBHOOK_DELAY_MS > 0) {
      setTimeout(send, WEBHOOK_DELAY_MS);
    } else {
      send();
    }
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    items: items.size,
    priceSpecifications: priceSpecifications.size,
    itemIdentifiers: itemIdentifiers.size,
    businessUnitGroups: businessUnitGroups.size,
    businessUnits: businessUnits.size,
    itemCategories: itemCategories.size,
    webhookSubscriptions: webhookSubscriptions.size,
  });
});

// ---------------------------------------------------------------------------
// Webhook subscription CRUD
// ---------------------------------------------------------------------------
app.post('/api/v1/webhooks', (req, res) => {
  const { url, events = ['*'], secret = null } = req.body;
  if (!url) return res.status(400).json({ status: 400, message: 'url is required' });
  const id = `wh-${crypto.randomUUID().split('-')[0]}`;
  const sub = { id, url, events, secret, createdAt: new Date().toISOString() };
  webhookSubscriptions.set(id, sub);
  res.status(201).json(sub);
});

app.get('/api/v1/webhooks', (_req, res) => {
  const subs = [...webhookSubscriptions.values()].map(s => ({
    ...s,
    secret: s.secret ? '***' : null,
  }));
  res.json(subs);
});

app.get('/api/v1/webhooks/:webhookId', (req, res) => {
  const sub = webhookSubscriptions.get(req.params.webhookId);
  if (!sub) return res.status(404).json({ status: 404, message: 'Webhook not found' });
  res.json({ ...sub, secret: sub.secret ? '***' : null });
});

app.delete('/api/v1/webhooks/:webhookId', (req, res) => {
  const id = req.params.webhookId;
  if (id === 'default') {
    return res.status(400).json({
      status: 400,
      message: 'Cannot delete the default webhook. Use --force in the CLI to override.',
    });
  }
  if (!webhookSubscriptions.has(id)) {
    return res.status(404).json({ status: 404, message: 'Webhook not found' });
  }
  webhookSubscriptions.delete(id);
  res.json({ message: 'Webhook removed', id });
});

app.delete('/api/v1/webhooks/:webhookId/force', (req, res) => {
  const id = req.params.webhookId;
  if (!webhookSubscriptions.has(id)) {
    return res.status(404).json({ status: 404, message: 'Webhook not found' });
  }
  webhookSubscriptions.delete(id);
  res.json({ message: 'Webhook removed', id });
});

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
app.post('/api/v1/items', (req, res) => {
  const item = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  items.set(item.id, item);
  res.status(202).json({ message: 'Request accepted for processing', id: item.id });
  dispatchWebhooks('item.created', 'item', 'created', item.id, item, '/api/v1/items');
});

app.put('/api/v1/items/:itemId', (req, res) => {
  const existing = items.get(req.params.itemId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  items.set(req.params.itemId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.itemId });
  dispatchWebhooks('item.updated', 'item', 'updated', req.params.itemId, updated, `/api/v1/items/${req.params.itemId}`);
});

app.delete('/api/v1/items/:itemId', (req, res) => {
  const existing = items.get(req.params.itemId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
  dispatchWebhooks('item.deleted', 'item', 'deleted', req.params.itemId, existing, `/api/v1/items/${req.params.itemId}`);
});

// ---------------------------------------------------------------------------
// Price Specifications
// ---------------------------------------------------------------------------
app.post('/api/v1/price-specifications', (req, res) => {
  const spec = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  priceSpecifications.set(spec.id, spec);
  res.status(202).json({ message: 'Request accepted for processing', id: spec.id });
  dispatchWebhooks('price.created', 'price', 'created', spec.id, spec, '/api/v1/price-specifications');
});

app.put('/api/v1/price-specifications/:priceSpecId', (req, res) => {
  const existing = priceSpecifications.get(req.params.priceSpecId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Price specification not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  priceSpecifications.set(req.params.priceSpecId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.priceSpecId });
  dispatchWebhooks('price.updated', 'price', 'updated', req.params.priceSpecId, updated, `/api/v1/price-specifications/${req.params.priceSpecId}`);
});

app.delete('/api/v1/price-specifications/:priceSpecId', (req, res) => {
  const existing = priceSpecifications.get(req.params.priceSpecId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Price specification not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
  dispatchWebhooks('price.deleted', 'price', 'deleted', req.params.priceSpecId, existing, `/api/v1/price-specifications/${req.params.priceSpecId}`);
});

// ---------------------------------------------------------------------------
// Item Identifiers
// ---------------------------------------------------------------------------
app.post('/api/v1/item-identifiers', (req, res) => {
  const ident = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  itemIdentifiers.set(ident.id, ident);
  res.status(202).json({ message: 'Request accepted for processing', id: ident.id });
  dispatchWebhooks('identifier.created', 'identifier', 'created', ident.id, ident, '/api/v1/item-identifiers');
});

app.put('/api/v1/item-identifiers/:identifierId', (req, res) => {
  const existing = itemIdentifiers.get(req.params.identifierId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item identifier not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  itemIdentifiers.set(req.params.identifierId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.identifierId });
  dispatchWebhooks('identifier.updated', 'identifier', 'updated', req.params.identifierId, updated, `/api/v1/item-identifiers/${req.params.identifierId}`);
});

app.delete('/api/v1/item-identifiers/:identifierId', (req, res) => {
  const existing = itemIdentifiers.get(req.params.identifierId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item identifier not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
  dispatchWebhooks('identifier.deleted', 'identifier', 'deleted', req.params.identifierId, existing, `/api/v1/item-identifiers/${req.params.identifierId}`);
});

// ---------------------------------------------------------------------------
// Business Unit Groups
// ---------------------------------------------------------------------------
app.post('/api/v1/business-unit-groups', (req, res) => {
  const entity = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  businessUnitGroups.set(entity.id, entity);
  res.status(202).json({ message: 'Request accepted for processing', id: entity.id });
  dispatchWebhooks('business-unit-group.created', 'business-unit-group', 'created', entity.id, entity, '/api/v1/business-unit-groups');
});

app.put('/api/v1/business-unit-groups/:businessUnitGroupId', (req, res) => {
  const existing = businessUnitGroups.get(req.params.businessUnitGroupId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Business unit group not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  businessUnitGroups.set(req.params.businessUnitGroupId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.businessUnitGroupId });
  dispatchWebhooks('business-unit-group.updated', 'business-unit-group', 'updated', req.params.businessUnitGroupId, updated, `/api/v1/business-unit-groups/${req.params.businessUnitGroupId}`);
});

app.delete('/api/v1/business-unit-groups/:businessUnitGroupId', (req, res) => {
  const existing = businessUnitGroups.get(req.params.businessUnitGroupId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Business unit group not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
  dispatchWebhooks('business-unit-group.deleted', 'business-unit-group', 'deleted', req.params.businessUnitGroupId, existing, `/api/v1/business-unit-groups/${req.params.businessUnitGroupId}`);
});

// ---------------------------------------------------------------------------
// Business Units
// ---------------------------------------------------------------------------
app.post('/api/v1/business-units', (req, res) => {
  const entity = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  businessUnits.set(entity.id, entity);
  res.status(202).json({ message: 'Request accepted for processing', id: entity.id });
  dispatchWebhooks('business-unit.created', 'business-unit', 'created', entity.id, entity, '/api/v1/business-units');
});

app.put('/api/v1/business-units/:businessUnitId', (req, res) => {
  const existing = businessUnits.get(req.params.businessUnitId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Business unit not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  businessUnits.set(req.params.businessUnitId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.businessUnitId });
  dispatchWebhooks('business-unit.updated', 'business-unit', 'updated', req.params.businessUnitId, updated, `/api/v1/business-units/${req.params.businessUnitId}`);
});

app.delete('/api/v1/business-units/:businessUnitId', (req, res) => {
  const existing = businessUnits.get(req.params.businessUnitId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Business unit not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
  dispatchWebhooks('business-unit.deleted', 'business-unit', 'deleted', req.params.businessUnitId, existing, `/api/v1/business-units/${req.params.businessUnitId}`);
});

// ---------------------------------------------------------------------------
// Item Categories
// ---------------------------------------------------------------------------
app.post('/api/v1/item-categories', (req, res) => {
  const entity = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  itemCategories.set(entity.id, entity);
  res.status(202).json({ message: 'Request accepted for processing', id: entity.id });
  dispatchWebhooks('item-category.created', 'item-category', 'created', entity.id, entity, '/api/v1/item-categories');
});

app.put('/api/v1/item-categories/:categoryId', (req, res) => {
  const existing = itemCategories.get(req.params.categoryId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item category not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  itemCategories.set(req.params.categoryId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.categoryId });
  dispatchWebhooks('item-category.updated', 'item-category', 'updated', req.params.categoryId, updated, `/api/v1/item-categories/${req.params.categoryId}`);
});

app.delete('/api/v1/item-categories/:categoryId', (req, res) => {
  const existing = itemCategories.get(req.params.categoryId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item category not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
  dispatchWebhooks('item-category.deleted', 'item-category', 'deleted', req.params.categoryId, existing, `/api/v1/item-categories/${req.params.categoryId}`);
});

// ---------------------------------------------------------------------------
// Complete Item — composed view
// ---------------------------------------------------------------------------
app.get('/api/v1/complete-items/:itemId', (req, res) => {
  const item = items.get(req.params.itemId);
  if (!item) return res.status(404).json({ status: 404, message: 'Item not found' });

  const prices = [...priceSpecifications.values()].filter(p => p.itemId === req.params.itemId && p.status !== 'DELETED');
  const identifiers = [...itemIdentifiers.values()].filter(i => i.itemId === req.params.itemId && i.status !== 'DELETED');

  res.json({ ...item, priceSpecifications: prices, itemIdentifiers: identifiers });
});

// ---------------------------------------------------------------------------
// Reset (for test automation)
// ---------------------------------------------------------------------------
app.post('/api/v1/_reset', async (_req, res) => {
  items.clear();
  priceSpecifications.clear();
  itemIdentifiers.clear();
  businessUnitGroups.clear();
  businessUnits.clear();
  itemCategories.clear();
  webhookSubscriptions.clear();
  registerDefaultWebhook();

  // Clear webhook receiver events
  try {
    await fetch(`${DEFAULT_RECEIVER_URL.replace('/webhook-events', '/_reset')}`, { method: 'POST' });
  } catch (err) {
    console.error('Failed to reset webhook receiver:', err.message);
  }

  res.json({ message: 'State cleared' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`State server listening on port ${PORT}`);
  console.log(`Default webhook registered: ${DEFAULT_RECEIVER_URL}`);
});
