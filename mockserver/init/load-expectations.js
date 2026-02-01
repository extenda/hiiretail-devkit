import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const MOCKSERVER_URL = process.env.MOCKSERVER_URL || 'http://localhost:1080';
const SPECS_DIR = '/specs/v1';

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
          // Generate a minimal response from the schema
          responseBody = generateFromSchema(jsonContent.schema, spec.components?.schemas || {});
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

function generateFromSchema(schema, allSchemas) {
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return generateFromSchema(allSchemas[refName] || {}, allSchemas);
  }
  if (schema.example !== undefined) return schema.example;
  switch (schema.type) {
    case 'object': {
      const obj = {};
      for (const [key, propSchema] of Object.entries(schema.properties || {})) {
        obj[key] = generateFromSchema(propSchema, allSchemas);
      }
      return obj;
    }
    case 'array':
      return schema.items ? [generateFromSchema(schema.items, allSchemas)] : [];
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

async function main() {
  console.log(`Waiting for MockServer at ${MOCKSERVER_URL}...`);
  await waitForMockServer();

  console.log(`Loading OpenAPI specs from ${SPECS_DIR} into MockServer at ${MOCKSERVER_URL}`);

  const specFiles = readdirSync(SPECS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  let total = 0;
  for (const file of specFiles) {
    const specPath = join(SPECS_DIR, file);
    console.log(`Processing: ${file}`);

    const raw = readFileSync(specPath, 'utf-8');
    const spec = yaml.load(raw);

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
