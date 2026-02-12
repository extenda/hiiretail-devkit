import express from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const app = express();
app.use(express.json({ limit: '10mb' }));

const MOCKSERVER_URL = process.env.MOCKSERVER_URL || 'http://mockserver:1080';
const SPECS_DIR = process.env.SPECS_DIR || '/specs';
const PORT = process.env.PORT || 1080;

// ---------------------------------------------------------------------------
// Schema storage: maps path patterns to validators
// ---------------------------------------------------------------------------
const validators = new Map(); // key: "METHOD /path/pattern" -> { validate, schemaName }
let specsLoaded = false;

// ---------------------------------------------------------------------------
// AJV setup
// ---------------------------------------------------------------------------
function createAjv() {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);
  return ajv;
}

// ---------------------------------------------------------------------------
// Resolve $ref references in schema
// ---------------------------------------------------------------------------
function resolveRefs(schema, components) {
  if (!schema || typeof schema !== 'object') return schema;

  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/components/schemas/', '');
    const resolved = components?.schemas?.[refPath];
    if (resolved) {
      return resolveRefs({ ...resolved }, components);
    }
    return schema;
  }

  const result = Array.isArray(schema) ? [] : {};
  for (const [key, value] of Object.entries(schema)) {
    // Skip OpenAPI-specific keywords that AJV doesn't understand
    if (['nullable', 'discriminator', 'xml', 'externalDocs', 'example'].includes(key)) {
      continue;
    }
    result[key] = resolveRefs(value, components);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Convert OpenAPI path to regex pattern
// ---------------------------------------------------------------------------
function pathToRegex(openApiPath) {
  // Convert /api/v2/items/{id} to /api/v2/items/[^/]+
  const pattern = openApiPath.replace(/\{[^}]+\}/g, '[^/]+');
  return new RegExp(`^${pattern}$`);
}

// ---------------------------------------------------------------------------
// Load and parse OpenAPI specs
// ---------------------------------------------------------------------------
function loadSpecs() {
  if (!existsSync(SPECS_DIR)) {
    console.log(`Specs directory ${SPECS_DIR} not found, waiting...`);
    return false;
  }

  const files = readdirSync(SPECS_DIR).filter(f => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'));
  if (files.length === 0) {
    console.log('No spec files found yet, waiting...');
    return false;
  }

  const ajv = createAjv();
  let totalEndpoints = 0;

  for (const file of files) {
    try {
      const filePath = join(SPECS_DIR, file);
      const content = readFileSync(filePath, 'utf-8');
      const spec = file.endsWith('.json') ? JSON.parse(content) : yaml.load(content);

      console.log(`Loading spec: ${file}`);

      for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const [method, operation] of Object.entries(methods)) {
          if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;

          // Find request body schema
          const requestBody = operation.requestBody;
          const jsonContent = requestBody?.content?.['application/json'];
          const schema = jsonContent?.schema;

          if (schema && ['post', 'put', 'patch'].includes(method)) {
            const resolvedSchema = resolveRefs(schema, spec.components);
            const key = `${method.toUpperCase()} ${path}`;

            try {
              const validate = ajv.compile(resolvedSchema);
              validators.set(key, {
                validate,
                pathRegex: pathToRegex(path),
                method: method.toUpperCase(),
                path,
                schemaName: operation.operationId || `${method}-${path}`,
              });
              totalEndpoints++;
            } catch (err) {
              console.error(`  Failed to compile schema for ${key}: ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to load spec ${file}: ${err.message}`);
    }
  }

  console.log(`Loaded validators for ${totalEndpoints} endpoints`);
  return totalEndpoints > 0;
}

// ---------------------------------------------------------------------------
// Find validator for a request
// ---------------------------------------------------------------------------
function findValidator(method, path) {
  for (const [key, validator] of validators.entries()) {
    if (validator.method === method && validator.pathRegex.test(path)) {
      return validator;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Format validation errors
// ---------------------------------------------------------------------------
function formatErrors(errors) {
  return errors.map(err => {
    const path = err.instancePath || '/';
    const message = err.message || 'validation failed';
    const details = [];

    if (err.params) {
      if (err.params.additionalProperty) {
        details.push(`unexpected property '${err.params.additionalProperty}'`);
      }
      if (err.params.missingProperty) {
        details.push(`missing required property '${err.params.missingProperty}'`);
      }
      if (err.params.allowedValues) {
        details.push(`allowed values: ${err.params.allowedValues.join(', ')}`);
      }
      if (err.params.type) {
        details.push(`expected type: ${err.params.type}`);
      }
    }

    return {
      path,
      message,
      details: details.length > 0 ? details.join('; ') : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: specsLoaded ? 'ok' : 'initializing',
    service: 'validation-proxy',
    validators: validators.size,
  });
});

// ---------------------------------------------------------------------------
// Proxy all requests
// ---------------------------------------------------------------------------
app.all('*', async (req, res) => {
  const { method, path, body, headers } = req;

  // Skip validation for non-JSON or GET/DELETE requests
  const contentType = headers['content-type'] || '';
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method) && contentType.includes('application/json');

  if (hasBody && specsLoaded) {
    const validator = findValidator(method, path);

    if (validator) {
      const valid = validator.validate(body);

      if (!valid) {
        const errors = formatErrors(validator.validate.errors || []);
        return res.status(400).json({
          error: 'Request validation failed',
          message: `The request body does not match the ${validator.schemaName} schema`,
          validationErrors: errors,
          hint: 'Use the CLI to validate payloads offline: devkit validate <file> --api <name>',
        });
      }
    }
  }

  // Forward to MockServer
  try {
    const targetUrl = `${MOCKSERVER_URL}${path}`;
    const fetchOptions = {
      method,
      headers: {
        'Content-Type': contentType || 'application/json',
        // Forward relevant headers
        ...(headers['x-request-id'] && { 'x-request-id': headers['x-request-id'] }),
      },
    };

    if (hasBody) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseBody = await response.text();

    // Forward response headers
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
        res.set(key, value);
      }
    });

    res.send(responseBody);
  } catch (err) {
    console.error(`Proxy error: ${err.message}`);
    res.status(502).json({
      error: 'Proxy error',
      message: `Failed to forward request to MockServer: ${err.message}`,
    });
  }
});

// ---------------------------------------------------------------------------
// Wait for specs and start server
// ---------------------------------------------------------------------------
async function waitForSpecs(maxRetries = 30, intervalMs = 2000) {
  for (let i = 1; i <= maxRetries; i++) {
    if (loadSpecs()) {
      specsLoaded = true;
      return true;
    }
    console.log(`Waiting for specs... (${i}/${maxRetries})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.warn('Starting without validation - specs not available');
  return false;
}

async function main() {
  console.log('Validation Proxy starting...');
  console.log(`MockServer URL: ${MOCKSERVER_URL}`);
  console.log(`Specs directory: ${SPECS_DIR}`);

  await waitForSpecs();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Validation Proxy listening on port ${PORT}`);
    console.log(`Proxying to MockServer at ${MOCKSERVER_URL}`);
    if (specsLoaded) {
      console.log(`Request validation: ENABLED (${validators.size} endpoints)`);
    } else {
      console.log('Request validation: DISABLED (no specs)');
    }
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
