import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const MOCKSERVER_URL = `http://localhost:${process.env.MOCKSERVER_PORT || '1080'}`;

// Kind-to-category mapping for fetching schemas from GitHub
const KIND_CATEGORY_MAP = {
  'rco.reason-codes.v1': 'reason-codes',
};

// Cache for fetched schemas
const schemaCache = new Map();

/**
 * Fetch the list of available CCC kinds from the server.
 */
export async function fetchKinds() {
  const res = await fetch(`${MOCKSERVER_URL}/api/v1/config`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.kinds || [];
}

/**
 * Fetch kind definition from the server.
 */
export async function fetchKindInfo(kind) {
  const res = await fetch(`${MOCKSERVER_URL}/api/v1/config/${kind}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch JSON schema for a CCC kind from GitHub.
 */
async function fetchSchema(kind) {
  if (schemaCache.has(kind)) {
    return schemaCache.get(kind);
  }

  const category = KIND_CATEGORY_MAP[kind];
  if (!category) {
    throw new Error(`Unknown kind: "${kind}". Known kinds: ${Object.keys(KIND_CATEGORY_MAP).join(', ')}`);
  }

  const schemaUrl = `https://raw.githubusercontent.com/extenda/hiiretail-json-schema-registry/master/customer-config/${category}/${kind}.json`;

  const res = await fetch(schemaUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch schema from ${schemaUrl}: ${res.status} ${res.statusText}`);
  }

  const schema = await res.json();
  schemaCache.set(kind, schema);
  return schema;
}

/**
 * Format AJV error into a human-friendly object.
 */
function formatError(err, kind) {
  const path = err.instancePath || '(root)';
  let message = err.message || 'Unknown error';
  let suggestion = '';

  switch (err.keyword) {
    case 'required':
      message = `Missing required field: "${err.params.missingProperty}"`;
      suggestion = `Add the "${err.params.missingProperty}" field to your payload.`;
      break;
    case 'enum':
      message = `Invalid value at ${path}`;
      suggestion = `Allowed values: ${err.params.allowedValues.join(', ')}`;
      break;
    case 'type':
      message = `Wrong type at ${path}: expected ${err.params.type}`;
      suggestion = `Change the value to a ${err.params.type}.`;
      break;
    case 'format':
      message = `Invalid format at ${path}: expected ${err.params.format}`;
      suggestion = `Use ${err.params.format} format.`;
      break;
    case 'additionalProperties':
      message = `Unknown field at ${path}: "${err.params.additionalProperty}"`;
      suggestion = `Remove "${err.params.additionalProperty}" or check the ${kind} schema for valid fields.`;
      break;
    default:
      suggestion = `Check the ${kind} schema for field requirements.`;
  }

  return { path, message, suggestion };
}

/**
 * Validate a payload against the schema for the given CCC kind.
 * Returns { valid: boolean, errors: FormattedError[] }
 */
export async function validateCccPayload(payload, kind) {
  const schema = await fetchSchema(kind);

  const ajv = new Ajv2020({ allErrors: true, verbose: true, strict: false });
  addFormats(ajv);

  const validateFn = ajv.compile(schema);
  const valid = validateFn(payload);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validateFn.errors || []).map(err => formatError(err, kind));
  return { valid: false, errors };
}

/**
 * Push (PUT) a CCC config to the server.
 */
export async function pushCccConfig(payload, kind, { buId } = {}) {
  const path = buId
    ? `/api/v1/config/${kind}/values/business-units/${buId}`
    : `/api/v1/config/${kind}/values/tenant`;

  const url = `${MOCKSERVER_URL}${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const responseBody = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    parsed = responseBody;
  }

  return {
    status: res.status,
    ok: res.ok,
    body: parsed,
    url,
  };
}

/**
 * Get a CCC config from the server.
 */
export async function getCccConfig(kind, { buId } = {}) {
  const path = buId
    ? `/api/v1/config/${kind}/values/business-units/${buId}`
    : `/api/v1/config/${kind}/values/tenant`;

  const url = `${MOCKSERVER_URL}${path}`;
  const res = await fetch(url);

  const responseBody = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    parsed = responseBody;
  }

  return {
    status: res.status,
    ok: res.ok,
    body: parsed,
    url,
  };
}

/**
 * Delete a CCC config from the server.
 */
export async function deleteCccConfig(kind, { buId } = {}) {
  const path = buId
    ? `/api/v1/config/${kind}/values/business-units/${buId}`
    : `/api/v1/config/${kind}/values/tenant`;

  const url = `${MOCKSERVER_URL}${path}`;
  const res = await fetch(url, { method: 'DELETE' });

  const responseBody = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    parsed = responseBody;
  }

  return {
    status: res.status,
    ok: res.ok,
    body: parsed,
    url,
  };
}

export { KIND_CATEGORY_MAP };
