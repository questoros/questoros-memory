import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

export interface ApiGatewayV2Event {
  version?: string;
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  requestContext: {
    requestId?: string;
    http: {
      method: string;
      path?: string;
    };
  };
  body?: string | null;
  isBase64Encoded?: boolean;
}

export interface ApiGatewayV2Result {
  statusCode: number;
  headers?: Record<string, string>;
  cookies?: string[];
  body: string;
  isBase64Encoded?: boolean;
}

type SupportedMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD';

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type Fetcher = (
  input: string,
  init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<FetchResponse>;

const SUPPORTED_METHODS = new Set<SupportedMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
]);

function normalizeMethod(method: string): SupportedMethod | null {
  const normalized = method.toUpperCase() as SupportedMethod;
  return SUPPORTED_METHODS.has(normalized) ? normalized : null;
}

function requestHeaders(event: ApiGatewayV2Event): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) {
      headers[name.toLowerCase()] = value;
    }
  }

  if (!headers.cookie && event.cookies?.length) {
    headers.cookie = event.cookies.join('; ');
  }

  const gatewayRequestId = event.requestContext.requestId;
  if (
    !headers['x-request-id'] &&
    gatewayRequestId &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(gatewayRequestId)
  ) {
    headers['x-request-id'] = gatewayRequestId;
  }

  return headers;
}

function responseHeaders(headers: Record<string, string | string[] | undefined>): {
  headers: Record<string, string>;
  cookies?: string[];
} {
  const normalized: Record<string, string> = {};
  let cookies: string[] | undefined;

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    if (name.toLowerCase() === 'set-cookie') {
      cookies = Array.isArray(value) ? value.map(String) : [String(value)];
      continue;
    }
    normalized[name] = Array.isArray(value)
      ? value.map(String).join(',')
      : String(value);
  }

  return { headers: normalized, cookies };
}

function parseDatabaseUrl(secretString: string): string {
  const trimmed = secretString.trim();
  let candidate = trimmed;

  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Database secret is not valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Database secret has an invalid structure.');
    }

    const record = parsed as Record<string, unknown>;
    const configured = record.DATABASE_URL ?? record.databaseUrl ?? record.url;
    if (typeof configured !== 'string') {
      throw new Error('Database secret does not contain a database URL.');
    }
    candidate = configured.trim();
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Database secret does not contain a valid URL.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('Database secret must use the PostgreSQL protocol.');
  }

  if (!url.hostname || !url.username) {
    throw new Error('Database secret is missing required connection fields.');
  }

  return candidate;
}

export interface RuntimeInitializationOptions {
  env?: NodeJS.ProcessEnv;
  fetcher?: Fetcher;
}

/**
 * Load DATABASE_URL from the AWS Parameters and Secrets Lambda Extension.
 * The secret is retained only in this Lambda process environment and is never logged.
 */
export async function initializeLambdaRuntime(
  options: RuntimeInitializationOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  if (env.DATABASE_URL?.trim()) {
    return;
  }

  const secretId = env.DATABASE_SECRET_ID?.trim();
  const sessionToken = env.AWS_SESSION_TOKEN?.trim();
  if (!secretId || !sessionToken) {
    throw new Error('Lambda database secret configuration is incomplete.');
  }

  const configuredPort = env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? '2773';
  if (!/^\d{1,5}$/.test(configuredPort)) {
    throw new Error('Lambda secrets extension port is invalid.');
  }

  const fetcher = options.fetcher ?? (globalThis.fetch as unknown as Fetcher);
  if (typeof fetcher !== 'function') {
    throw new Error('Lambda runtime does not provide fetch.');
  }

  const endpoint = `http://localhost:${configuredPort}/secretsmanager/get?secretId=${encodeURIComponent(secretId)}`;
  const response = await fetcher(endpoint, {
    headers: {
      'X-Aws-Parameters-Secrets-Token': sessionToken,
    },
    signal: AbortSignal.timeout(3_000),
  });

  if (!response.ok) {
    throw new Error(`Lambda secrets extension returned status ${response.status}.`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object') {
    throw new Error('Lambda secrets extension returned an invalid response.');
  }

  const secretString = (payload as Record<string, unknown>).SecretString;
  if (typeof secretString !== 'string') {
    throw new Error('Database secret does not contain a string value.');
  }

  env.DATABASE_URL = parseDatabaseUrl(secretString);
}

export interface LambdaHandlerOptions {
  build?: () => Promise<FastifyInstance>;
  initialize?: () => Promise<void>;
}

function runtimeUnavailable(requestId?: string): ApiGatewayV2Result {
  return {
    statusCode: 503,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      error: {
        code: 'RUNTIME_NOT_READY',
        message: 'Memory API runtime is not ready.',
        requestId: requestId ?? null,
      },
    }),
  };
}

/**
 * Create an API Gateway HTTP API v2 Lambda handler around the existing Fastify app.
 * The Fastify instance is initialized once per warm Lambda execution environment.
 */
export function createLambdaHandler(options: LambdaHandlerOptions = {}) {
  const appBuilder =
    options.build ??
    (() => buildApp({ logLevel: process.env.LOG_LEVEL ?? 'info' }));
  const initialize = options.initialize ?? initializeLambdaRuntime;
  let appPromise: Promise<FastifyInstance> | null = null;

  return async function lambdaHandler(
    event: ApiGatewayV2Event,
  ): Promise<ApiGatewayV2Result> {
    const method = normalizeMethod(event.requestContext.http.method);
    if (!method) {
      return {
        statusCode: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'HTTP method is not supported.',
            requestId: event.requestContext.requestId ?? null,
          },
        }),
      };
    }

    const rawPath = event.rawPath ?? event.requestContext.http.path ?? '/';
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const url = event.rawQueryString
      ? `${path}?${event.rawQueryString}`
      : path;
    const payload =
      event.body === undefined || event.body === null
        ? undefined
        : event.isBase64Encoded
          ? Buffer.from(event.body, 'base64')
          : event.body;

    if (!appPromise) {
      appPromise = (async () => {
        await initialize();
        return appBuilder();
      })().catch((error: unknown) => {
        appPromise = null;
        throw error;
      });
    }

    let app: FastifyInstance;
    try {
      app = await appPromise;
    } catch {
      console.error('Memory API runtime initialization failed.');
      return runtimeUnavailable(event.requestContext.requestId);
    }

    const response = await app.inject({
      method,
      url,
      headers: requestHeaders(event),
      payload,
    });
    const mapped = responseHeaders(response.headers);

    return {
      statusCode: response.statusCode,
      headers: mapped.headers,
      cookies: mapped.cookies,
      body: response.body,
      isBase64Encoded: false,
    };
  };
}

export const handler = createLambdaHandler();
