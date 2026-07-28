import Fastify, { type FastifyInstance } from 'fastify';
import { disconnectDatabaseClient } from '@questoros-memory/database';
import { registerRoutes } from './routes.js';

export interface AppOptions {
  host?: string;
  port?: number;
  logLevel?: string;
  bodyLimit?: number;
  portalOrigins?: string[];
}

export interface AppConfig {
  host: string;
  port: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

function normalizePortalOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function resolvePortalOrigins(explicit?: string[]): Set<string> {
  const rawValues =
    explicit ??
    (process.env.MEMORYOS_PORTAL_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  const origins = new Set<string>();
  for (const value of rawValues) {
    const normalized = normalizePortalOrigin(value);
    if (normalized) origins.add(normalized);
  }
  return origins;
}

function applyPortalCorsHeaders(
  reply: { header: (name: string, value: string) => unknown },
  origin: string,
): void {
  reply.header('access-control-allow-origin', origin);
  reply.header('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  reply.header('access-control-allow-headers', 'Authorization,Content-Type,X-Request-Id');
  reply.header('access-control-expose-headers', 'X-Request-Id');
  reply.header('access-control-max-age', '600');
  reply.header('vary', 'Origin');
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const {
    host = '127.0.0.1',
    port = 8787,
    logLevel = 'info',
    bodyLimit = 262144,
    portalOrigins,
  } = options;
  const allowedPortalOrigins = resolvePortalOrigins(portalOrigins);

  const app = Fastify({
    logger: {
      level: logLevel,
      redact: {
        paths: ['req.headers.authorization', 'authorization', 'apiKey', 'token', 'DATABASE_URL'],
        censor: '[REDACTED]',
      },
    },
    bodyLimit,
  });

  app.decorate('config', { host, port });

  app.addHook('onRequest', async (request, reply) => {
    let requestId = request.headers['x-request-id'];
    if (requestId && typeof requestId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(requestId)) {
      // Use caller-provided request ID.
    } else {
      requestId = crypto.randomUUID();
    }
    request.id = requestId;
    reply.header('x-request-id', requestId);

    const originHeader = request.headers.origin;
    if (!originHeader || typeof originHeader !== 'string') return;
    const normalizedOrigin = normalizePortalOrigin(originHeader);
    if (!normalizedOrigin || !allowedPortalOrigins.has(normalizedOrigin)) {
      return reply.status(403).send({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Origin is not allowed.',
          requestId,
        },
      });
    }

    applyPortalCorsHeaders(reply, normalizedOrigin);
    if (request.method === 'OPTIONS') return reply.status(204).send();
  });

  app.options('/*', async (_request, reply) => reply.status(204).send());

  app.setErrorHandler(async (error, request, reply) => {
    const requestId = request.id as string;
    const err = error as {
      validation?: unknown;
      statusCode?: number;
      code?: string;
    };
    if (err.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed: malformed request.',
          requestId,
        },
      });
    }
    if (
      err.statusCode === 400 &&
      (err.code === 'FST_ERR_CTP_INVALID_JSON_BODY' ||
        err.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
        /json/i.test(String((error as Error).message ?? '')))
    ) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Malformed JSON body.',
          requestId,
        },
      });
    }
    if (err.statusCode === 415 || err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.status(415).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Unsupported content type.',
          requestId,
        },
      });
    }
    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(err.statusCode && err.statusCode >= 400 ? err.statusCode : 500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error.',
        requestId,
      },
    });
  });

  registerRoutes(app);

  return app;
}

export async function startApp(app: FastifyInstance): Promise<void> {
  const cfg = app.config;
  const bindHost = cfg?.host ?? '127.0.0.1';
  const bindPort = cfg?.port ?? 8787;

  try {
    await app.listen({ host: bindHost, port: bindPort });
    app.log.info(`Memory API listening on ${bindHost}:${bindPort}`);
  } catch (err) {
    app.log.error(err, 'Failed to start Memory API');
    throw err;
  }
}

export async function stopApp(app: FastifyInstance): Promise<void> {
  await app.close();
  await disconnectDatabaseClient();
}

export { registerRoutes } from './routes.js';
