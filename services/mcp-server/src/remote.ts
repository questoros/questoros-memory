import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { ERROR_CODES, ServiceError } from '@questoros-memory/memory-core';
import { transportWhoami } from '@questoros-memory/memory-service';
import { registerRemoteReadOnlyTools } from './remote-tools.js';

const SERVER_NAME = 'questoros-memory-remote';
const SERVER_VERSION = '0.8.0';
const DEFAULT_ROUTE = '/mcp';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type JsonRpcErrorOptions = {
  requestId: string;
  httpStatus: number;
  rpcCode: number;
  safeCode: string;
  message: string;
  authenticate?: boolean;
};

export type RemoteMcpDiagnostic = {
  event: 'request_rejected' | 'transport_error';
  requestId: string;
  code: string;
  httpStatus?: number;
};

export type RemoteMcpHandlerOptions = {
  routePath?: string;
  allowedOrigins?: readonly string[];
  onDiagnostic?: (diagnostic: RemoteMcpDiagnostic) => void;
};

export type RemoteMcpRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  parsedBody?: unknown,
) => Promise<void>;

export type RemoteMcpWebRequestHandler = (request: Request) => Promise<Response>;

function requestPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function requestIdFromCandidate(candidate: string | undefined): string {
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function requestIdFrom(request: IncomingMessage): string {
  const supplied = request.headers['x-request-id'];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
  return requestIdFromCandidate(candidate);
}

function webRequestIdFrom(request: Request): string {
  return requestIdFromCandidate(request.headers.get('x-request-id') ?? undefined);
}

function bearerTokenFromValue(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(trimmed);
  return match?.[1] ?? null;
}

function bearerTokenFrom(request: IncomingMessage): string | null {
  return bearerTokenFromValue(request.headers.authorization);
}

function writeJsonRpcError(response: ServerResponse, options: JsonRpcErrorOptions): void {
  if (response.headersSent || response.writableEnded) return;
  response.statusCode = options.httpStatus;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-request-id', options.requestId);
  if (options.authenticate) {
    response.setHeader('www-authenticate', 'Bearer realm="questoros-memory"');
  }
  response.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: options.rpcCode,
        message: options.message,
        data: {
          code: options.safeCode,
          requestId: options.requestId,
        },
      },
      id: null,
    }),
  );
}

function webJsonRpcError(options: JsonRpcErrorOptions): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-request-id': options.requestId,
  });
  if (options.authenticate) {
    headers.set('www-authenticate', 'Bearer realm="questoros-memory"');
  }
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: options.rpcCode,
        message: options.message,
        data: {
          code: options.safeCode,
          requestId: options.requestId,
        },
      },
      id: null,
    }),
    { status: options.httpStatus, headers },
  );
}

async function securedWebResponse(response: Response, requestId: string): Promise<Response> {
  const body = response.body === null ? null : await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-request-id', requestId);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function authFailure(error: unknown): {
  httpStatus: number;
  safeCode: string;
  message: string;
} {
  if (error instanceof ServiceError) {
    const httpStatus = error.statusCode === 403 ? 403 : 401;
    return {
      httpStatus,
      safeCode: error.code,
      message: error.message,
    };
  }
  return {
    httpStatus: 401,
    safeCode: ERROR_CODES.AUTH_INVALID,
    message: 'Authentication failed.',
  };
}

function originAllowedValue(origin: string | undefined | null, allowedOrigins: readonly string[]) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

function originAllowed(request: IncomingMessage, allowedOrigins: readonly string[]): boolean {
  return originAllowedValue(request.headers.origin, allowedOrigins);
}

function reportDiagnostic(options: RemoteMcpHandlerOptions, diagnostic: RemoteMcpDiagnostic): void {
  options.onDiagnostic?.(diagnostic);
}

/**
 * Creates a stateless MCP Streamable HTTP handler suitable for a real Node HTTP
 * server or reverse proxy. Framework adapters may pass a pre-parsed body.
 */
export function createRemoteMcpRequestHandler(
  options: RemoteMcpHandlerOptions = {},
): RemoteMcpRequestHandler {
  const routePath = options.routePath ?? DEFAULT_ROUTE;
  const allowedOrigins = options.allowedOrigins ?? [];

  return async (request, response, parsedBody) => {
    const requestId = requestIdFrom(request);
    response.setHeader('x-request-id', requestId);
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');

    if (requestPath(request) !== routePath) {
      writeJsonRpcError(response, {
        requestId,
        httpStatus: 404,
        rpcCode: -32601,
        safeCode: 'MCP_ROUTE_NOT_FOUND',
        message: 'MCP route not found.',
      });
      return;
    }

    if (!originAllowed(request, allowedOrigins)) {
      reportDiagnostic(options, {
        event: 'request_rejected',
        requestId,
        code: 'MCP_ORIGIN_DENIED',
        httpStatus: 403,
      });
      writeJsonRpcError(response, {
        requestId,
        httpStatus: 403,
        rpcCode: -32003,
        safeCode: 'MCP_ORIGIN_DENIED',
        message: 'Origin is not allowed.',
      });
      return;
    }

    const apiKey = bearerTokenFrom(request);
    if (!apiKey) {
      reportDiagnostic(options, {
        event: 'request_rejected',
        requestId,
        code: ERROR_CODES.AUTH_REQUIRED,
        httpStatus: 401,
      });
      writeJsonRpcError(response, {
        requestId,
        httpStatus: 401,
        rpcCode: -32001,
        safeCode: ERROR_CODES.AUTH_REQUIRED,
        message: 'Bearer authentication is required.',
        authenticate: true,
      });
      return;
    }

    try {
      await transportWhoami(apiKey);
    } catch (error) {
      const failure = authFailure(error);
      reportDiagnostic(options, {
        event: 'request_rejected',
        requestId,
        code: failure.safeCode,
        httpStatus: failure.httpStatus,
      });
      writeJsonRpcError(response, {
        requestId,
        httpStatus: failure.httpStatus,
        rpcCode: failure.httpStatus === 403 ? -32003 : -32001,
        safeCode: failure.safeCode,
        message: failure.message,
        authenticate: failure.httpStatus === 401,
      });
      return;
    }

    if (request.method !== 'POST') {
      writeJsonRpcError(response, {
        requestId,
        httpStatus: 405,
        rpcCode: -32601,
        safeCode: 'MCP_METHOD_NOT_ALLOWED',
        message: 'Method not allowed.',
      });
      return;
    }

    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerRemoteReadOnlyTools(server, apiKey);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    transport.onerror = () => {
      reportDiagnostic(options, {
        event: 'transport_error',
        requestId,
        code: 'MCP_TRANSPORT_ERROR',
      });
    };

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      void Promise.allSettled([transport.close(), server.close()]);
    };
    response.once('finish', close);
    response.once('close', close);

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, parsedBody);
    } catch {
      reportDiagnostic(options, {
        event: 'transport_error',
        requestId,
        code: 'MCP_TRANSPORT_ERROR',
        httpStatus: 500,
      });
      writeJsonRpcError(response, {
        requestId,
        httpStatus: 500,
        rpcCode: -32603,
        safeCode: 'MCP_TRANSPORT_ERROR',
        message: 'MCP request failed.',
      });
      close();
    }
  };
}

/**
 * Creates a Web Standards handler for serverless runtimes. API Gateway Lambda
 * events are not real Node IncomingMessage/ServerResponse objects, so this path
 * avoids Fastify inject/reply hijacking and maps Request -> Response directly.
 */
export function createRemoteMcpWebRequestHandler(
  options: RemoteMcpHandlerOptions = {},
): RemoteMcpWebRequestHandler {
  const routePath = options.routePath ?? DEFAULT_ROUTE;
  const allowedOrigins = options.allowedOrigins ?? [];

  return async (request) => {
    const requestId = webRequestIdFrom(request);
    let pathname = '/';
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      // Keep the fail-closed default path.
    }

    if (pathname !== routePath) {
      return webJsonRpcError({
        requestId,
        httpStatus: 404,
        rpcCode: -32601,
        safeCode: 'MCP_ROUTE_NOT_FOUND',
        message: 'MCP route not found.',
      });
    }

    if (!originAllowedValue(request.headers.get('origin'), allowedOrigins)) {
      reportDiagnostic(options, {
        event: 'request_rejected',
        requestId,
        code: 'MCP_ORIGIN_DENIED',
        httpStatus: 403,
      });
      return webJsonRpcError({
        requestId,
        httpStatus: 403,
        rpcCode: -32003,
        safeCode: 'MCP_ORIGIN_DENIED',
        message: 'Origin is not allowed.',
      });
    }

    const apiKey = bearerTokenFromValue(request.headers.get('authorization'));
    if (!apiKey) {
      reportDiagnostic(options, {
        event: 'request_rejected',
        requestId,
        code: ERROR_CODES.AUTH_REQUIRED,
        httpStatus: 401,
      });
      return webJsonRpcError({
        requestId,
        httpStatus: 401,
        rpcCode: -32001,
        safeCode: ERROR_CODES.AUTH_REQUIRED,
        message: 'Bearer authentication is required.',
        authenticate: true,
      });
    }

    try {
      await transportWhoami(apiKey);
    } catch (error) {
      const failure = authFailure(error);
      reportDiagnostic(options, {
        event: 'request_rejected',
        requestId,
        code: failure.safeCode,
        httpStatus: failure.httpStatus,
      });
      return webJsonRpcError({
        requestId,
        httpStatus: failure.httpStatus,
        rpcCode: failure.httpStatus === 403 ? -32003 : -32001,
        safeCode: failure.safeCode,
        message: failure.message,
        authenticate: failure.httpStatus === 401,
      });
    }

    if (request.method !== 'POST') {
      return webJsonRpcError({
        requestId,
        httpStatus: 405,
        rpcCode: -32601,
        safeCode: 'MCP_METHOD_NOT_ALLOWED',
        message: 'Method not allowed.',
      });
    }

    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerRemoteReadOnlyTools(server, apiKey);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    transport.onerror = () => {
      reportDiagnostic(options, {
        event: 'transport_error',
        requestId,
        code: 'MCP_TRANSPORT_ERROR',
      });
    };

    try {
      await server.connect(transport);
      const protocolResponse = await transport.handleRequest(request);
      const response = await securedWebResponse(protocolResponse, requestId);
      await Promise.allSettled([transport.close(), server.close()]);
      return response;
    } catch {
      reportDiagnostic(options, {
        event: 'transport_error',
        requestId,
        code: 'MCP_TRANSPORT_ERROR',
        httpStatus: 500,
      });
      await Promise.allSettled([transport.close(), server.close()]);
      return webJsonRpcError({
        requestId,
        httpStatus: 500,
        rpcCode: -32603,
        safeCode: 'MCP_TRANSPORT_ERROR',
        message: 'MCP request failed.',
      });
    }
  };
}
