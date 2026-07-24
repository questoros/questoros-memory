import type { FastifyInstance } from 'fastify';
import { ServiceError, parseContract, memoryIdParamsSchema } from '@questoros-memory/memory-core';
import {
  transportWhoami,
  transportCreateMemory,
  transportGetMemory,
  transportListMemories,
  transportSearchMemories,
  transportCorrectMemory,
  transportDeleteMemory,
  transportRevisionHistory,
  transportUpsertEmbedding,
  transportReadyz,
} from '@questoros-memory/memory-service';

function extractToken(request: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const auth = request.headers.authorization;
  if (!auth || typeof auth !== 'string') return undefined;
  if (!auth.startsWith('Bearer ')) return undefined;
  return auth.slice(7).trim();
}

function handleError(
  reply: { status: (code: number) => { send: (body: Record<string, unknown>) => void } },
  error: unknown,
  requestId: string,
) {
  if (error instanceof ServiceError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    });
  }

  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
      requestId,
    },
  });
}

export function registerRoutes(app: FastifyInstance): void {
  app.get('/healthz', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  app.get('/readyz', async (_request, reply) => {
    const ready = await transportReadyz();
    if (!ready) {
      return reply.status(503).send({ status: 'error' });
    }
    return reply.status(200).send({ status: 'ok' });
  });

  app.get('/v1/whoami', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const result = await transportWhoami(extractToken(request));
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/memories', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const result = await transportCreateMemory(extractToken(request), request.body, requestId);
      return reply.status(201).send(result.memory);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.get('/v1/memories', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const result = await transportListMemories(extractToken(request), request.query);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.get('/v1/memories/:memoryId', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(memoryIdParamsSchema, request.params);
      const result = await transportGetMemory(
        extractToken(request),
        params.memoryId,
        request.query,
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/memories/search', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const result = await transportSearchMemories(extractToken(request), request.body);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/memories/:memoryId/corrections', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(memoryIdParamsSchema, request.params);
      const result = await transportCorrectMemory(
        extractToken(request),
        params.memoryId,
        request.body,
        requestId,
      );
      return reply.status(200).send({
        id: result.memory.id,
        revisionNumber: result.revision.revisionNumber,
        embeddingInvalidated: result.embeddingInvalidated,
      });
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.delete('/v1/memories/:memoryId', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(memoryIdParamsSchema, request.params);
      const result = await transportDeleteMemory(extractToken(request), params.memoryId, requestId);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.get('/v1/memories/:memoryId/revisions', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(memoryIdParamsSchema, request.params);
      const result = await transportRevisionHistory(extractToken(request), params.memoryId);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.put('/v1/memories/:memoryId/embedding', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(memoryIdParamsSchema, request.params);
      const result = await transportUpsertEmbedding(
        extractToken(request),
        params.memoryId,
        request.body,
        requestId,
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });
}
