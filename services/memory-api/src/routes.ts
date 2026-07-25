import type { FastifyInstance } from 'fastify';
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
  transportGenerateEmbedding,
  transportCreateHarvestRun,
  transportGetHarvestRun,
  transportListCandidates,
  transportGetCandidate,
  transportApproveCandidate,
  transportRejectCandidate,
  transportCreateContextPackage,
  transportPublishArtifact,
  transportGetPublishedArtifact,
  transportSyncPublishedArtifact,
  transportRepublishArtifact,
  transportReadyz,
} from '@questoros-memory/memory-service';
import {
  ServiceError,
  parseContract,
  memoryIdParamsSchema,
  harvestRunIdParamsSchema,
  candidateIdParamsSchema,
  publishedArtifactIdParamsSchema,
} from '@questoros-memory/memory-core';

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

  app.post('/v1/memories/:memoryId/embedding/generate', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(memoryIdParamsSchema, request.params);
      const result = await transportGenerateEmbedding(
        extractToken(request),
        params.memoryId,
        request.body ?? {},
        requestId,
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/harvest/runs', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const result = await transportCreateHarvestRun(
        extractToken(request),
        request.body,
        requestId,
      );
      return reply.status(201).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.get('/v1/harvest/runs/:runId', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(harvestRunIdParamsSchema, request.params);
      const result = await transportGetHarvestRun(extractToken(request), params.runId);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.get('/v1/candidates', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const result = await transportListCandidates(extractToken(request), request.query);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.get('/v1/candidates/:candidateId', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(candidateIdParamsSchema, request.params);
      const result = await transportGetCandidate(extractToken(request), params.candidateId);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/candidates/:candidateId/approve', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(candidateIdParamsSchema, request.params);
      const result = await transportApproveCandidate(
        extractToken(request),
        params.candidateId,
        request.body ?? {},
        requestId,
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/candidates/:candidateId/reject', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(candidateIdParamsSchema, request.params);
      const result = await transportRejectCandidate(
        extractToken(request),
        params.candidateId,
        request.body ?? {},
        requestId,
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/context/packages', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const result = await transportCreateContextPackage(extractToken(request), request.body);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/publish/artifacts', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const result = await transportPublishArtifact(extractToken(request), request.body, requestId);
      return reply.status(201).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.get('/v1/publish/artifacts/:artifactId', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(publishedArtifactIdParamsSchema, request.params);
      const result = await transportGetPublishedArtifact(extractToken(request), params.artifactId);
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/publish/artifacts/:artifactId/sync', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(publishedArtifactIdParamsSchema, request.params);
      const result = await transportSyncPublishedArtifact(
        extractToken(request),
        params.artifactId,
        requestId,
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });

  app.post('/v1/publish/artifacts/:artifactId/republish', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const params = parseContract(publishedArtifactIdParamsSchema, request.params);
      const result = await transportRepublishArtifact(
        extractToken(request),
        params.artifactId,
        request.body,
        requestId,
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleError(reply, error, requestId);
    }
  });
}
