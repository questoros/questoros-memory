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

type SupportedMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

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
    normalized[name] = Array.isArray(value) ? value.map(String).join(',') : String(value);
  }

  return { headers: normalized, cookies };
}

export interface LambdaHandlerOptions {
  build?: () => Promise<FastifyInstance>;
}

/**
 * Create an API Gateway HTTP API v2 Lambda handler around the existing Fastify app.
 * The Fastify instance is initialized once per warm Lambda execution environment.
 */
export function createLambdaHandler(options: LambdaHandlerOptions = {}) {
  const appBuilder = options.build ?? (() => buildApp({ logLevel: process.env.LOG_LEVEL ?? 'info' }));
  let appPromise: Promise<FastifyInstance> | null = null;

  return async function lambdaHandler(event: ApiGatewayV2Event): Promise<ApiGatewayV2Result> {
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
    const url = event.rawQueryString ? `${path}?${event.rawQueryString}` : path;
    const payload =
      event.body === undefined || event.body === null
        ? undefined
        : event.isBase64Encoded
          ? Buffer.from(event.body, 'base64')
          : event.body;

    appPromise ??= appBuilder();
    const app = await appPromise;
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
