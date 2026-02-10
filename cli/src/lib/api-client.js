// API path mapping based on real Hii Retail API paths
// Items, prices, and identifiers support both business-unit-group level (bu-g-) and business-unit level (bu-)
const API_PATH_MAP = {
  item: '/api/v2/bu-g-items',
  'item-bu': '/api/v2/bu-items',
  price: '/api/v2/bu-g-price-specifications',
  'price-bu': '/api/v2/bu-price-specifications',
  identifier: '/api/v2/bu-g-item-identifiers',
  'identifier-bu': '/api/v2/bu-item-identifiers',
  category: '/api/v2/item-categories',
  bu: '/business-units',
  group: '/groups',
};

/**
 * Resolve target URL base from target name.
 * "mock" → local MockServer
 * "sandbox" → real Hii Retail sandbox (requires env vars)
 */
function resolveBaseUrl(target) {
  if (target === 'mock') {
    const port = process.env.MOCKSERVER_PORT || '1080';
    return `http://localhost:${port}`;
  }
  if (target === 'sandbox') {
    const url = process.env.HIR_SANDBOX_BASE_URL;
    if (!url) {
      throw new Error(
        'HIR_SANDBOX_BASE_URL is not set. Configure sandbox credentials in .env\n' +
        'See .env.example for required variables.',
      );
    }
    return url;
  }
  throw new Error(`Unknown target: "${target}". Use "mock" or "sandbox".`);
}

/**
 * Get auth headers for sandbox requests.
 * Returns empty object for mock target.
 */
async function getAuthHeaders(target) {
  if (target !== 'sandbox') return {};

  const authUrl = process.env.HIR_SANDBOX_AUTH_URL;
  const clientId = process.env.HIR_SANDBOX_CLIENT_ID;
  const clientSecret = process.env.HIR_SANDBOX_CLIENT_SECRET;
  const audience = process.env.HIR_SANDBOX_AUDIENCE;

  if (!authUrl || !clientId || !clientSecret) {
    throw new Error(
      'Sandbox auth not configured. Set HIR_SANDBOX_AUTH_URL, HIR_SANDBOX_CLIENT_ID, and HIR_SANDBOX_CLIENT_SECRET in .env',
    );
  }

  const res = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed (${res.status}): ${body}`);
  }

  const { access_token } = await res.json();
  return { Authorization: `Bearer ${access_token}` };
}

/**
 * Push a payload to the given API and target.
 */
export async function push(payload, apiName, target) {
  const basePath = API_PATH_MAP[apiName];
  if (!basePath) {
    throw new Error(`Unknown API: "${apiName}". Valid: ${Object.keys(API_PATH_MAP).join(', ')}`);
  }

  const baseUrl = resolveBaseUrl(target);
  const authHeaders = await getAuthHeaders(target);

  const url = `${baseUrl}${basePath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await res.text();
  let parsed;
  try { parsed = JSON.parse(responseBody); } catch { parsed = responseBody; }

  return {
    status: res.status,
    ok: res.ok,
    body: parsed,
    url,
  };
}

export { API_PATH_MAP };
