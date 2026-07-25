import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { createLambdaHandler, type ApiGatewayV2Event } from '../src/lambda.js';

function event(overrides: Partial<ApiGatewayV2Event> = {}): ApiGatewayV2Event {
  return {
    version: '2.0',
    rawPath: '/healthz',
    rawQueryString: '',
    headers: {},
    requestContext: {
      requestId: 'gateway-request-1',
      http: {
        method: 'GET',
        path: '/healthz',
      },
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

describe('API Gateway v2 Lambda adapter', () => {
  it('reuses one Fastify app across warm invocations', async () => {
    const app = Fastify({ logger: false });
    app.get('/healthz', async () => ({ ok: true }));
    const build = vi.fn().mockResolvedValue(app);
    const handler = createLambdaHandler({ build });

    const first = await handler(event());
    const second = await handler(event({ requestContext: { requestId: 'gateway-request-2', http: { method: 'GET' } } }));

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(build).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('maps query strings, cookies, request ids, and set-cookie responses', async () => {
    const app = Fastify({ logger: false });
    app.get('/echo', async (request, reply) => {
      reply.header('set-cookie', ['session=a', 'preference=b']);
      return {
        query: request.query,
        cookie: request.headers.cookie,
        requestId: request.headers['x-request-id'],
      };
    });
    const handler = createLambdaHandler({ build: async () => app });

    const response = await handler(
      event({
        rawPath: '/echo',
        rawQueryString: 'page=2',
        cookies: ['session=a', 'preference=b'],
        requestContext: {
          requestId: 'gateway-request-echo',
          http: { method: 'GET', path: '/echo' },
        },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.cookies).toEqual(['session=a', 'preference=b']);
    expect(JSON.parse(response.body)).toEqual({
      query: { page: '2' },
      cookie: 'session=a; preference=b',
      requestId: 'gateway-request-echo',
    });
    await app.close();
  });

  it('decodes base64 request bodies before Fastify injection', async () => {
    const app = Fastify({ logger: false });
    app.post('/echo', async (request) => request.body);
    const handler = createLambdaHandler({ build: async () => app });
    const json = JSON.stringify({ message: 'hello' });

    const response = await handler(
      event({
        rawPath: '/echo',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(json, 'utf8').toString('base64'),
        isBase64Encoded: true,
        requestContext: {
          requestId: 'gateway-request-body',
          http: { method: 'POST', path: '/echo' },
        },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ message: 'hello' });
    await app.close();
  });

  it('fails closed for unsupported HTTP methods', async () => {
    const build = vi.fn();
    const handler = createLambdaHandler({ build });

    const response = await handler(
      event({
        requestContext: {
          requestId: 'gateway-request-method',
          http: { method: 'TRACE', path: '/healthz' },
        },
      }),
    );

    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body).error.code).toBe('METHOD_NOT_ALLOWED');
    expect(build).not.toHaveBeenCalled();
  });
});
