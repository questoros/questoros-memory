import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ERROR_CODES, ServiceError } from '@questoros-memory/memory-core';
import { transportWhoami } from '@questoros-memory/memory-service';
import { registerRemoteReadOnlyTools } from './remote-tools.js';

const SERVER_NAME = 'questoros-memory-remote';
const SERVER_VERSION = '0.8.0';
const DEFAULT_ROUTE = '/mcp';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

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

function requestPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function requestIdFrom(request: IncomingMessage): string {
  const supplied = request.headers['x-request-id'];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function bearerTokenFrom(request: IncomingMessage): string | null {
  const value = request.headers.authorization?.trim();
  if (!value) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1] ?? null;
}

function writeJsonRpcError(
  response: ServerResponse,
  options: {
    requestId: string;
    httpStatus: number;
    rpcCode: number;
    safeCode: string;
    message: string;
    authenticate?: boolean;
  },
): void {
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

function originAllowed(request: IncomingMessage, allowedOrigins: readonly string[]): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

/**
 * Creates a stateless MCP Streamable HTTP handler suitable for an HTTPS reverse
 * proxy, API gateway, or a Node HTTPS server.
 *
 * Authentication is completed before MCP initialization or tool discovery, so
 * missing, invalid, expired, and revoked keys cannot enumerate the endpoint.
 * A fresh server and transport are created per request to avoid in-memory
 * session affinity and to keep the handler compatible with horizontally scaled
 * or serverless staging deployments.
 *
 * Framework adapters that parse JSON before dispatch may pass parsedBody. The
 * plain Node listener leaves it undefined so the MCP transport reads the body
 * from the incoming stream itself.
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
      options.onDiagnostic?.({
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
      options.onDiagnostic?.({
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
      options.onDiagnostic?.({
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

    const server = new McpServer({
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });
    registerRemoteReadOnlyTools(server, apiKey);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    transport.onerror = () => {
      options.onDiagnostic?.({
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
      options.onDiagnostic?.({
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
