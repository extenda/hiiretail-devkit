import express from 'express';

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// In-memory stores keyed by id
// ---------------------------------------------------------------------------
const items = new Map();
const priceSpecifications = new Map();
const itemIdentifiers = new Map();

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', items: items.size, priceSpecifications: priceSpecifications.size, itemIdentifiers: itemIdentifiers.size });
});

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
app.post('/api/v1/items', (req, res) => {
  const item = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  items.set(item.id, item);
  res.status(202).json({ message: 'Request accepted for processing', id: item.id });
});

app.put('/api/v1/items/:itemId', (req, res) => {
  const existing = items.get(req.params.itemId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  items.set(req.params.itemId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.itemId });
});

app.delete('/api/v1/items/:itemId', (req, res) => {
  const existing = items.get(req.params.itemId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
});

// ---------------------------------------------------------------------------
// Price Specifications
// ---------------------------------------------------------------------------
app.post('/api/v1/price-specifications', (req, res) => {
  const spec = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  priceSpecifications.set(spec.id, spec);
  res.status(202).json({ message: 'Request accepted for processing', id: spec.id });
});

app.put('/api/v1/price-specifications/:priceSpecId', (req, res) => {
  const existing = priceSpecifications.get(req.params.priceSpecId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Price specification not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  priceSpecifications.set(req.params.priceSpecId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.priceSpecId });
});

app.delete('/api/v1/price-specifications/:priceSpecId', (req, res) => {
  const existing = priceSpecifications.get(req.params.priceSpecId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Price specification not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
});

// ---------------------------------------------------------------------------
// Item Identifiers
// ---------------------------------------------------------------------------
app.post('/api/v1/item-identifiers', (req, res) => {
  const ident = { ...req.body, created: new Date().toISOString(), modified: new Date().toISOString() };
  itemIdentifiers.set(ident.id, ident);
  res.status(202).json({ message: 'Request accepted for processing', id: ident.id });
});

app.put('/api/v1/item-identifiers/:identifierId', (req, res) => {
  const existing = itemIdentifiers.get(req.params.identifierId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item identifier not found' });
  const updated = { ...existing, ...req.body, modified: new Date().toISOString() };
  itemIdentifiers.set(req.params.identifierId, updated);
  res.status(202).json({ message: 'Request accepted for processing', id: req.params.identifierId });
});

app.delete('/api/v1/item-identifiers/:identifierId', (req, res) => {
  const existing = itemIdentifiers.get(req.params.identifierId);
  if (!existing) return res.status(404).json({ status: 404, message: 'Item identifier not found' });
  existing.status = 'DELETED';
  existing.modified = new Date().toISOString();
  res.status(202).json({ message: 'Request accepted for processing' });
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
app.post('/api/v1/_reset', (_req, res) => {
  items.clear();
  priceSpecifications.clear();
  itemIdentifiers.clear();
  res.json({ message: 'State cleared' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`State server listening on port ${PORT}`);
});
