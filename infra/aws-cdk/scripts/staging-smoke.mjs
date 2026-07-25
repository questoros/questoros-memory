const enabled = process.env.RUN_PHASE6_STAGING_SMOKE === 'true';
if (!enabled) {
  console.error(
    'Staging smoke test is blocked. Set RUN_PHASE6_STAGING_SMOKE=true after deployment approval.',
  );
  process.exit(1);
}

const baseUrl = process.env.QUESTOROS_MEMORY_STAGING_URL?.trim();
const apiKey = process.env.QUESTOROS_MEMORY_STAGING_API_KEY?.trim();
if (!baseUrl || !apiKey) {
  console.error('Staging URL and private API key are required.');
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(baseUrl);
} catch {
  console.error('Staging URL is invalid.');
  process.exit(1);
}
if (parsedUrl.protocol !== 'https:') {
  console.error('Staging smoke test requires HTTPS.');
  process.exit(1);
}

const root = baseUrl.replace(/\/+$/, '');

async function request(path, authenticated = false) {
  const response = await fetch(`${root}${path}`, {
    method: 'GET',
    headers: authenticated ? { authorization: `Bearer ${apiKey}` } : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  return { response, body };
}

try {
  const health = await request('/healthz');
  if (health.response.status !== 200 || health.body?.status !== 'ok') {
    throw new Error('health check failed');
  }

  const ready = await request('/readyz');
  if (ready.response.status !== 200 || ready.body?.status !== 'ok') {
    throw new Error('readiness check failed');
  }

  const identity = await request('/v1/whoami', true);
  if (identity.response.status !== 200 || !identity.body || typeof identity.body !== 'object') {
    throw new Error('authenticated identity check failed');
  }

  console.log('Phase 6 staging smoke PASSED: health, readiness, and authentication.');
  console.log('Writes performed: none. Bedrock calls: none. Provider calls: none.');
} catch {
  console.error('Phase 6 staging smoke FAILED. No credential or response body was printed.');
  process.exit(1);
}
