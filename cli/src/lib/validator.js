import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_URLS_PATH = resolve(__dirname, '..', '..', '..', 'specs', 'urls.json');

// Cache for fetched specs
const specCache = new Map();

const API_SPEC_MAP = {
  item: { spec: 'item-input', schema: 'ItemInput' },
  price: { spec: 'price-specification-input', schema: 'PriceSpecificationInput' },
  identifier: { spec: 'item-identifier-input', schema: 'ItemIdentifierInput' },
  bu: { spec: 'business-unit', schema: 'BusinessUnit' },
  group: { spec: 'business-unit', schema: 'BusinessUnitGroup' },
  category: { spec: 'item-category-input', schema: 'ItemCategory' },
  promotion: { spec: 'promotion-input', schema: 'PromotionInput' },
  'promotion-bu': { spec: 'promotion-input', schema: 'BUPromotionInput' },
};

/**
 * Load spec URLs from the local urls.json file.
 */
function loadSpecUrls() {
  try {
    return JSON.parse(readFileSync(SPEC_URLS_PATH, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to load spec URLs from ${SPEC_URLS_PATH}: ${err.message}`);
  }
}

/**
 * Fetch an OpenAPI spec from URL (with caching).
 */
async function fetchSpec(specName) {
  if (specCache.has(specName)) {
    return specCache.get(specName);
  }

  const urls = loadSpecUrls();
  const url = urls[specName];
  if (!url) {
    throw new Error(`Unknown spec: "${specName}". Available: ${Object.keys(urls).join(', ')}`);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch spec from ${url}: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const spec = yaml.load(text);
  specCache.set(specName, spec);
  return spec;
}

/**
 * Load an OpenAPI spec and extract the named schema as a standalone JSON Schema.
 */
async function loadSchema(apiName) {
  const mapping = API_SPEC_MAP[apiName];
  if (!mapping) {
    throw new Error(`Unknown API: "${apiName}". Valid options: ${Object.keys(API_SPEC_MAP).join(', ')}`);
  }

  const spec = await fetchSpec(mapping.spec);
  const schema = spec.components?.schemas?.[mapping.schema];
  if (!schema) {
    // Try to find a similar schema name
    const available = Object.keys(spec.components?.schemas || {}).join(', ');
    throw new Error(`Schema "${mapping.schema}" not found in ${mapping.spec} spec. Available: ${available}`);
  }

  // Resolve internal $refs to inline definitions
  const allSchemas = spec.components?.schemas || {};
  return resolveRefs(schema, allSchemas);
}

/**
 * Recursively resolve $ref pointers and convert OpenAPI nullable to JSON Schema.
 */
function resolveRefs(obj, allSchemas) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => resolveRefs(item, allSchemas));

  if (obj.$ref) {
    const refName = obj.$ref.split('/').pop();
    const resolved = allSchemas[refName];
    if (!resolved) return obj;
    return resolveRefs(JSON.parse(JSON.stringify(resolved)), allSchemas);
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip the 'nullable' keyword - AJV doesn't understand OpenAPI's nullable
    if (key === 'nullable') continue;
    result[key] = resolveRefs(value, allSchemas);
  }
  return result;
}

/**
 * Validate a payload against the schema for the given API.
 * Returns { valid: boolean, errors: FormattedError[] }
 */
export async function validate(payload, apiName) {
  const schema = await loadSchema(apiName);

  const ajv = new Ajv({ allErrors: true, verbose: true, strict: false });
  addFormats(ajv);

  const validateFn = ajv.compile(schema);
  const valid = validateFn(payload);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validateFn.errors || []).map(err => formatError(err, apiName));
  return { valid: false, errors };
}

/**
 * Format an AJV error into a human-friendly object.
 */
function formatError(err, apiName) {
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
      suggestion = `Use ${err.params.format} format (e.g. "2025-01-01T00:00:00Z" for date-time).`;
      break;
    case 'additionalProperties':
      message = `Unknown field at ${path}: "${err.params.additionalProperty}"`;
      suggestion = `Remove "${err.params.additionalProperty}" or check the ${apiName} API spec for valid fields.`;
      break;
    default:
      suggestion = `Check the ${apiName} API spec for field requirements.`;
  }

  return { path, message, suggestion };
}

export { API_SPEC_MAP };
