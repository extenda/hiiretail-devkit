import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = resolve(__dirname, '..', '..', '..', 'specs', 'v1');

const API_SPEC_MAP = {
  item: { file: 'item-input-api.yaml', schema: 'ItemInput' },
  price: { file: 'price-specification-input-api.yaml', schema: 'PriceSpecificationInput' },
  identifier: { file: 'item-identifier-input-api.yaml', schema: 'ItemIdentifierInput' },
  bug: { file: 'business-unit-group-input-api.yaml', schema: 'BusinessUnitGroupInput' },
  bu: { file: 'business-unit-input-api.yaml', schema: 'BusinessUnitInput' },
  category: { file: 'item-category-input-api.yaml', schema: 'ItemCategoryInput' },
};

/**
 * Load an OpenAPI spec and extract the named schema as a standalone JSON Schema.
 */
function loadSchema(apiName) {
  const mapping = API_SPEC_MAP[apiName];
  if (!mapping) {
    throw new Error(`Unknown API: "${apiName}". Valid options: ${Object.keys(API_SPEC_MAP).join(', ')}`);
  }

  const specPath = resolve(SPECS_DIR, mapping.file);
  const raw = readFileSync(specPath, 'utf-8');
  const spec = yaml.load(raw);

  const schema = spec.components?.schemas?.[mapping.schema];
  if (!schema) {
    throw new Error(`Schema "${mapping.schema}" not found in ${mapping.file}`);
  }

  // Resolve internal $refs to inline definitions
  const allSchemas = spec.components?.schemas || {};
  return resolveRefs(schema, allSchemas);
}

/**
 * Recursively resolve $ref pointers within the components/schemas namespace.
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
    result[key] = resolveRefs(value, allSchemas);
  }
  return result;
}

/**
 * Validate a payload against the schema for the given API.
 * Returns { valid: boolean, errors: FormattedError[] }
 */
export function validate(payload, apiName) {
  const schema = loadSchema(apiName);

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
