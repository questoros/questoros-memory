import type { FastifyInstance } from 'fastify';
import {
  createRemoteMcpRequestHandler,
  type RemoteMcpDiagnostic,
} from '@questoros-memory/mcp-server';

export interface RemoteMcpRouteOptions {
  allowedOrigins?: readonly string[];
}

function sanitizedDiagnostic(diagnostic: RemoteMcpDiagnostic) {
  return {
    event: diagnostic.event,
    requestId: diagnostic.requestId,
    code: diagnostic.code,
    httpStatus: diagnostic.httpStatus,
  };
}

/**
 * Mount the stateless remote MCP transport on the existing Fastify application.
 *
 * Fastify parses JSON before route dispatch. The parsed body is therefore passed
 * explicitly to the MCP transport while the raw Node response is hijacked so
 * the transport remains the sole protocol-response writer.
 */
export function registerRemoteMcpRoute(
  app: FastifyInstance,
  options: RemoteMcpRouteOptions = {},
): void {
  const handler = createRemoteMcpRequestHandler({
    routePath: '/mcp',
    allowedOrigins: options.allowedOrigins ?? [],
    onDiagnostic: (diagnostic) => {
      app.log.warn({ remoteMcp: sanitizedDiagnostic(diagnostic) }, 'Remote MCP diagnostic');
    },
  });

  app.all('/mcp', async (request, reply) => {
    reply.hijack();
    await handler(request.raw, reply.raw, request.body);
  });
}
