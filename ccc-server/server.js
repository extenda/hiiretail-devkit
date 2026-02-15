import express from 'express';

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Known CCC kinds with category mappings
// ---------------------------------------------------------------------------
const KNOWN_KINDS = new Map([
  ['rco.reason-codes.v1', {
    category: 'reason-codes',
    description: 'Reason codes for transactions, returns, voids, and other operations',
  }],
]);

// ---------------------------------------------------------------------------
// In-memory config storage
// ---------------------------------------------------------------------------
const tenantConfigs = new Map(); // key: kind, value: config object
const buConfigs = new Map();     // key: `${kind}:${buId}`, value: config object

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ccc-server',
    tenantConfigs: tenantConfigs.size,
    buConfigs: buConfigs.size,
  });
});

// ---------------------------------------------------------------------------
// List available kinds
// ---------------------------------------------------------------------------
app.get('/api/v1/config', (_req, res) => {
  const kinds = Array.from(KNOWN_KINDS.entries()).map(([kind, info]) => ({
    kind,
    category: info.category,
    description: info.description,
  }));
  res.json({ kinds });
});

// ---------------------------------------------------------------------------
// Get kind definition
// ---------------------------------------------------------------------------
app.get('/api/v1/config/:kind', (req, res) => {
  const { kind } = req.params;
  const info = KNOWN_KINDS.get(kind);
  if (!info) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
      availableKinds: Array.from(KNOWN_KINDS.keys()),
    });
  }
  res.json({
    kind,
    category: info.category,
    description: info.description,
    schemaUrl: `https://raw.githubusercontent.com/extenda/hiiretail-json-schema-registry/master/customer-config/${info.category}/${kind}.json`,
  });
});

// ---------------------------------------------------------------------------
// Tenant config: PUT (set)
// ---------------------------------------------------------------------------
app.put('/api/v1/config/:kind/values/tenant', (req, res) => {
  const { kind } = req.params;
  if (!KNOWN_KINDS.has(kind)) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
    });
  }
  tenantConfigs.set(kind, req.body);
  res.status(202).json({ message: 'Config accepted', kind, level: 'tenant' });
});

// ---------------------------------------------------------------------------
// Tenant config: PATCH (partial update)
// ---------------------------------------------------------------------------
app.patch('/api/v1/config/:kind/values/tenant', (req, res) => {
  const { kind } = req.params;
  if (!KNOWN_KINDS.has(kind)) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
    });
  }
  const existing = tenantConfigs.get(kind) || {};
  tenantConfigs.set(kind, { ...existing, ...req.body });
  res.status(202).json({ message: 'Config patched', kind, level: 'tenant' });
});

// ---------------------------------------------------------------------------
// Tenant config: GET
// ---------------------------------------------------------------------------
app.get('/api/v1/config/:kind/values/tenant', (req, res) => {
  const { kind } = req.params;
  if (!KNOWN_KINDS.has(kind)) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
    });
  }
  const config = tenantConfigs.get(kind);
  if (!config) {
    return res.status(404).json({
      error: 'Config not found',
      message: `No tenant config set for kind: ${kind}`,
    });
  }
  res.json(config);
});

// ---------------------------------------------------------------------------
// Tenant config: DELETE
// ---------------------------------------------------------------------------
app.delete('/api/v1/config/:kind/values/tenant', (req, res) => {
  const { kind } = req.params;
  if (!KNOWN_KINDS.has(kind)) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
    });
  }
  if (!tenantConfigs.has(kind)) {
    return res.status(404).json({
      error: 'Config not found',
      message: `No tenant config set for kind: ${kind}`,
    });
  }
  tenantConfigs.delete(kind);
  res.status(200).json({ message: 'Config deleted', kind, level: 'tenant' });
});

// ---------------------------------------------------------------------------
// Business Unit config: PUT (set)
// ---------------------------------------------------------------------------
app.put('/api/v1/config/:kind/values/business-units/:buId', (req, res) => {
  const { kind, buId } = req.params;
  if (!KNOWN_KINDS.has(kind)) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
    });
  }
  buConfigs.set(`${kind}:${buId}`, req.body);
  res.status(202).json({ message: 'Config accepted', kind, level: 'business-unit', businessUnitId: buId });
});

// ---------------------------------------------------------------------------
// Business Unit config: PATCH (partial update)
// ---------------------------------------------------------------------------
app.patch('/api/v1/config/:kind/values/business-units/:buId', (req, res) => {
  const { kind, buId } = req.params;
  if (!KNOWN_KINDS.has(kind)) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
    });
  }
  const key = `${kind}:${buId}`;
  const existing = buConfigs.get(key) || {};
  buConfigs.set(key, { ...existing, ...req.body });
  res.status(202).json({ message: 'Config patched', kind, level: 'business-unit', businessUnitId: buId });
});

// ---------------------------------------------------------------------------
// Business Unit config: GET
// ---------------------------------------------------------------------------
app.get('/api/v1/config/:kind/values/business-units/:buId', (req, res) => {
  const { kind, buId } = req.params;
  if (!KNOWN_KINDS.has(kind)) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
    });
  }
  const config = buConfigs.get(`${kind}:${buId}`);
  if (!config) {
    return res.status(404).json({
      error: 'Config not found',
      message: `No business-unit config set for kind: ${kind}, buId: ${buId}`,
    });
  }
  res.json(config);
});

// ---------------------------------------------------------------------------
// Business Unit config: DELETE
// ---------------------------------------------------------------------------
app.delete('/api/v1/config/:kind/values/business-units/:buId', (req, res) => {
  const { kind, buId } = req.params;
  if (!KNOWN_KINDS.has(kind)) {
    return res.status(404).json({
      error: 'Kind not found',
      message: `Unknown kind: ${kind}`,
    });
  }
  const key = `${kind}:${buId}`;
  if (!buConfigs.has(key)) {
    return res.status(404).json({
      error: 'Config not found',
      message: `No business-unit config set for kind: ${kind}, buId: ${buId}`,
    });
  }
  buConfigs.delete(key);
  res.status(200).json({ message: 'Config deleted', kind, level: 'business-unit', businessUnitId: buId });
});

// ---------------------------------------------------------------------------
// Reset (clear all configs)
// ---------------------------------------------------------------------------
app.post('/api/v1/_reset', (_req, res) => {
  tenantConfigs.clear();
  buConfigs.clear();
  res.json({ message: 'All configs cleared' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`CCC Server listening on port ${PORT}`);
  console.log(`Available kinds: ${Array.from(KNOWN_KINDS.keys()).join(', ')}`);
});
