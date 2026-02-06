import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const MOCKSERVER_URL = process.env.MOCKSERVER_URL || 'http://localhost:1080';
const SPEC_URLS_PATH = '/specs/urls.json';
const SPECS_OUTPUT_DIR = '/output/specs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function putExpectation(expectation) {
  const res = await fetch(`${MOCKSERVER_URL}/mockserver/expectation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expectation),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create expectation: ${res.status} ${body}`);
  }
}

function buildExpectationsFromSpec(spec) {
  const expectations = [];

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].indexOf(method) === -1) continue;

      // Determine response status code and body
      const responseCodes = Object.keys(operation.responses || {});
      const successCode = responseCodes.find(c => c.startsWith('2')) || '200';
      const responseSpec = operation.responses[successCode];

      let responseBody = null;
      if (responseSpec?.content?.['application/json']) {
        const jsonContent = responseSpec.content['application/json'];
        if (jsonContent.example) {
          responseBody = jsonContent.example;
        } else if (jsonContent.schema) {
          // Generate a minimal response from the schema (with error handling for complex schemas)
          try {
            responseBody = generateFromSchema(jsonContent.schema, spec.components?.schemas || {});
          } catch {
            // Skip response body generation for complex/circular schemas
            responseBody = null;
          }
        }
      }

      // Convert OpenAPI path params {param} to MockServer regex .*
      const mockPath = path.replace(/\{[^}]+\}/g, '[^/]+');

      const expectation = {
        id: `${method}-${path}`.replace(/[^a-zA-Z0-9-]/g, '-'),
        priority: 0,
        httpRequest: {
          method: method.toUpperCase(),
          path: mockPath,
        },
        httpResponse: {
          statusCode: parseInt(successCode, 10),
          headers: {
            'Content-Type': ['application/json'],
          },
        },
      };

      if (responseBody) {
        expectation.httpResponse.body = {
          type: 'JSON',
          json: JSON.stringify(responseBody),
        };
      }

      expectations.push(expectation);
    }
  }

  return expectations;
}

function generateFromSchema(schema, allSchemas, visited = new Set(), depth = 0) {
  // Prevent infinite recursion with max depth
  if (depth > 20) {
    return null;
  }
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    // Prevent circular references
    if (visited.has(refName)) {
      return null;
    }
    const newVisited = new Set(visited);
    newVisited.add(refName);
    return generateFromSchema(allSchemas[refName] || {}, allSchemas, newVisited, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  switch (schema.type) {
    case 'object': {
      const obj = {};
      for (const [key, propSchema] of Object.entries(schema.properties || {})) {
        obj[key] = generateFromSchema(propSchema, allSchemas, visited, depth + 1);
      }
      return obj;
    }
    case 'array':
      return schema.items ? [generateFromSchema(schema.items, allSchemas, visited, depth + 1)] : [];
    case 'string':
      return schema.example || schema.enum?.[0] || 'string';
    case 'integer':
      return schema.example || 0;
    case 'number':
      return schema.example || 0.0;
    case 'boolean':
      return schema.example ?? true;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function waitForMockServer(maxRetries = 30, intervalMs = 2000) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const res = await fetch(`${MOCKSERVER_URL}/mockserver/status`, { method: 'PUT' });
      if (res.ok) {
        console.log('MockServer is ready.');
        return;
      }
    } catch {
      // not up yet
    }
    console.log(`Waiting for MockServer... (${i}/${maxRetries})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('MockServer did not become ready in time');
}

async function fetchSpec(name, url) {
  console.log(`Fetching spec: ${name} from ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  // Parse as YAML (which also handles JSON)
  return yaml.load(text);
}

async function main() {
  console.log(`Waiting for MockServer at ${MOCKSERVER_URL}...`);
  await waitForMockServer();

  // Create output directory for specs (used by Swagger UI)
  try {
    mkdirSync(SPECS_OUTPUT_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }

  // Load spec URLs from configuration
  let specUrls;
  try {
    specUrls = JSON.parse(readFileSync(SPEC_URLS_PATH, 'utf-8'));
    console.log(`Loaded ${Object.keys(specUrls).length} spec URLs from ${SPEC_URLS_PATH}`);
  } catch (err) {
    console.error(`Failed to load spec URLs from ${SPEC_URLS_PATH}: ${err.message}`);
    process.exit(1);
  }

  let total = 0;
  const savedSpecs = [];

  // Fetch and process each OpenAPI spec
  for (const [name, url] of Object.entries(specUrls)) {
    try {
      const spec = await fetchSpec(name, url);
      console.log(`Processing: ${name}`);

      // Save spec to output directory for Swagger UI
      // Patch openapi 3.0.4 to 3.0.3 - Swagger UI v5.17.14 doesn't recognize 3.0.4
      if (spec.openapi === '3.0.4') {
        spec.openapi = '3.0.3';
      }
      const specPath = join(SPECS_OUTPUT_DIR, `${name}.json`);
      writeFileSync(specPath, JSON.stringify(spec, null, 2));
      savedSpecs.push({ name, path: `/specs/${name}.json` });
      console.log(`  → Saved spec to ${specPath}`);

      const expectations = buildExpectationsFromSpec(spec);
      for (const exp of expectations) {
        try {
          await putExpectation(exp);
          console.log(`  ✓ ${exp.httpRequest.method} ${exp.httpRequest.path}`);
          total++;
        } catch (err) {
          console.error(`  ✗ ${exp.httpRequest.method} ${exp.httpRequest.path}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`Failed to process ${name}: ${err.message}`);
    }
  }

  // Also load any hand-crafted expectations
  try {
    const customDir = '/app/expectations';
    const customFiles = readdirSync(customDir).filter(f => f.endsWith('.json'));
    for (const file of customFiles) {
      const expectations = JSON.parse(readFileSync(join(customDir, file), 'utf-8'));
      const items = Array.isArray(expectations) ? expectations : [expectations];
      for (const exp of items) {
        try {
          await putExpectation(exp);
          console.log(`  ✓ [custom] ${exp.httpRequest?.method || '?'} ${exp.httpRequest?.path || '?'}`);
          total++;
        } catch (err) {
          console.error(`  ✗ [custom] ${file}: ${err.message}`);
        }
      }
    }
  } catch {
    // No custom expectations directory — that's fine
  }

  console.log(`\nDone. Loaded ${total} expectations into MockServer.`);
}

main().catch(err => {
  console.error('Fatal error loading expectations:', err);
  process.exit(1);
});
