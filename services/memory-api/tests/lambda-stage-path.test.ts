import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createLambdaHandler, type ApiGatewayV2Event } from '../src/lambda.js';

function event(rawPath: string, stage?: string): ApiGatewayV2Event {
  return {
    version: '2.0',
    rawPath,
    rawQueryString: '',
    headers: {},
    requestContext: {
      requestId: 'gateway-stage-request',
      stage,
      http: {
        method: 'GET',
        path: rawPath,
      },
    },
    isBase64Encoded: false,
  };
}

describe('API Gateway named-stage path mapping', () => {
  it('strips the named stage before Fastify routing', async () => {
    const app = Fastify({ logger: false });
    app.get('/healthz', async () => ({ status: 'ok' }));
    const handler = createLambdaHandler({
      build: async () => app,
      initialize: async () => undefined,
    });

    const response = await handler(event('/staging/healthz', 'staging'));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    await app.close();
  });

  it('keeps default-stage paths unchanged', async () => {
    const app = Fastify({ logger: false });
    app.get('/healthz', async () => ({ status: 'ok' }));
    const handler = createLambdaHandler({
      build: async () => app,
      initialize: async () => undefined,
    });

    const response = await handler(event('/healthz', '$default'));

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
