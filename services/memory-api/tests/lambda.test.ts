import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import {
  createLambdaHandler,
  initializeLambdaRuntime,
  type ApiGatewayV2Event,
} from '../src/lambda.js';

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

const initialized = async () => undefined;

describe('API Gateway v2 Lambda adapter', () => {
  it('reuses one Fastify app across warm invocations', async () => {
    const app = Fastify({ logger: false });
    app.get('/healthz', async () => ({ ok: true }));
    const build = vi.fn().mockResolvedValue(app);
    const initialize = vi.fn().mockResolvedValue(undefined);
    const handler = createLambdaHandler({ build, initialize });

    const first = await handler(event());
    const second = await handler(
      event({
        requestContext: {
          requestId: 'gateway-request-2',
          http: { method: 'GET' },
        },
      }),
    );

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(initialize).toHaveBeenCalledTimes(1);
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
    const handler = createLambdaHandler({
      build: async () => app,
      initialize: initialized,
    });

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
    const handler = createLambdaHandler({
      build: async () => app,
      initialize: initialized,
    });
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

  it('routes staged MCP requests through the Web Standards adapter instead of Fastify inject', async () => {
    const app = Fastify({ logger: false });
    app.post('/mcp', async () => {
      throw new Error('Fastify MCP route must not be used by the Lambda adapter.');
    });
    const remoteMcpHandler = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe('/mcp');
      expect(request.method).toBe('POST');
      expect(request.headers.get('authorization')).toBe('Bearer qmem_live_test_only');
      expect(await request.json()).toMatchObject({ method: 'initialize' });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'gateway-request-mcp',
        },
      });
    });
    const handler = createLambdaHandler({
      build: async () => app,
      initialize: initialized,
      remoteMcpEnabled: true,
      remoteMcpHandler,
    });
    const initializeBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'lambda-test', version: '1.0.0' },
      },
    });

    const response = await handler(
      event({
        rawPath: '/staging/mcp',
        headers: {
          authorization: 'Bearer qmem_live_test_only',
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: initializeBody,
        requestContext: {
          requestId: 'gateway-request-mcp',
          stage: 'staging',
          http: { method: 'POST', path: '/staging/mcp' },
        },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ result: { ok: true } });
    expect(response.headers?.['x-request-id']).toBe('gateway-request-mcp');
    expect(remoteMcpHandler).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('fails closed for unsupported HTTP methods', async () => {
    const build = vi.fn();
    const handler = createLambdaHandler({ build, initialize: initialized });

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

  it('returns 503 without leaking initialization errors and retries later', async () => {
    const app = Fastify({ logger: false });
    app.get('/healthz', async () => ({ ok: true }));
    const initialize = vi
      .fn()
      .mockRejectedValueOnce(new Error('secret-value-must-not-leak'))
      .mockResolvedValueOnce(undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = createLambdaHandler({
      build: async () => app,
      initialize,
    });

    const failed = await handler(event());
    const recovered = await handler(event());

    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain('secret-value-must-not-leak');
    expect(recovered.statusCode).toBe(200);
    expect(initialize).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
    await app.close();
  });
});

describe('Lambda runtime secret initialization', () => {
  it('uses an existing DATABASE_URL without calling the extension', async () => {
    const env = {
      DATABASE_URL: 'postgresql://user:password@example.com:26257/memory',
    };
    const fetcher = vi.fn();

    await initializeLambdaRuntime({ env, fetcher });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('loads a JSON-wrapped database URL from the extension', async () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_SECRET_ID: 'questoros-memory/staging/database-url',
      AWS_SESSION_TOKEN: 'session-token',
      PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: '2773',
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        SecretString: JSON.stringify({
          DATABASE_URL:
            'postgresql://user:password@example.com:26257/questoros_memory?sslmode=verify-full',
        }),
      }),
    });

    await initializeLambdaRuntime({ env, fetcher });

    expect(env.DATABASE_URL).toContain('questoros_memory');
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/secretsmanager/get?secretId='),
      expect.objectContaining({
        headers: {
          'X-Aws-Parameters-Secrets-Token': 'session-token',
        },
      }),
    );
  });

  it('rejects a secret that is not a PostgreSQL URL', async () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_SECRET_ID: 'database-secret',
      AWS_SESSION_TOKEN: 'session-token',
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ SecretString: 'https://example.com/not-a-database' }),
    });

    await expect(initializeLambdaRuntime({ env, fetcher })).rejects.toThrow('PostgreSQL protocol');
    expect(env.DATABASE_URL).toBeUndefined();
  });
});
