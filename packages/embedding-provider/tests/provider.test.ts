import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildTitanInvokeBody,
  extractEmbeddingVector,
  validateEmbeddingRequest,
  loadEmbeddingConfig,
  BedrockTitanV2Provider,
  EmbeddingProviderError,
  EMBEDDING_ERROR_CODES,
  TITAN_V2_MODEL_ID,
  HARD_MAX_INPUT_CHARACTERS,
} from '../src/index.js';

function validRequest(overrides: Partial<Parameters<typeof validateEmbeddingRequest>[0]> = {}) {
  return {
    inputText: 'hello world',
    modelId: TITAN_V2_MODEL_ID,
    dimensions: 1024 as const,
    normalize: true as const,
    ...overrides,
  };
}

describe('embedding request validation', () => {
  it('serializes the Titan V2 request body', () => {
    expect(buildTitanInvokeBody('text to embed')).toEqual({
      inputText: 'text to embed',
      dimensions: 1024,
      normalize: true,
      embeddingTypes: ['float'],
    });
  });

  it('rejects empty and oversized input', () => {
    expect(() => validateEmbeddingRequest(validRequest({ inputText: '   ' }), 20_000)).toThrow(
      EmbeddingProviderError,
    );
    try {
      validateEmbeddingRequest(validRequest({ inputText: 'x'.repeat(20_001) }), 20_000);
      expect.fail('expected oversized rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(EmbeddingProviderError);
      expect((error as EmbeddingProviderError).code).toBe(
        EMBEDDING_ERROR_CODES.EMBEDDING_INPUT_TOO_LARGE,
      );
    }
    expect(() =>
      validateEmbeddingRequest(
        validRequest({ inputText: 'x'.repeat(HARD_MAX_INPUT_CHARACTERS + 1) }),
        HARD_MAX_INPUT_CHARACTERS + 100,
      ),
    ).toThrow(EmbeddingProviderError);
  });

  it('rejects unsupported model/dimensions/normalize', () => {
    expect(() =>
      validateEmbeddingRequest(validRequest({ modelId: 'other-model' }), 20_000),
    ).toThrow(EmbeddingProviderError);
    expect(() =>
      validateEmbeddingRequest(validRequest({ dimensions: 512 as never }), 20_000),
    ).toThrow(EmbeddingProviderError);
    expect(() =>
      validateEmbeddingRequest(validRequest({ normalize: false as never }), 20_000),
    ).toThrow(EmbeddingProviderError);
  });
});

describe('embedding config', () => {
  it('loads region/model/dimensions/normalization defaults', () => {
    const config = loadEmbeddingConfig({
      EMBEDDING_PROVIDER: 'amazon-bedrock',
      EMBEDDING_MODEL_ID: TITAN_V2_MODEL_ID,
      EMBEDDING_DIMENSIONS: '1024',
      EMBEDDING_NORMALIZE: 'true',
      AWS_BEDROCK_REGION: 'us-west-2',
      EMBEDDING_AUTO_ON_WRITE: 'false',
    } as NodeJS.ProcessEnv);
    expect(config).toMatchObject({
      provider: 'amazon-bedrock',
      modelId: TITAN_V2_MODEL_ID,
      dimensions: 1024,
      normalize: true,
      bedrockRegion: 'us-west-2',
      autoOnWrite: false,
    });
  });

  it('rejects non-1024 dimensions and normalize=false', () => {
    expect(() => loadEmbeddingConfig({ EMBEDDING_DIMENSIONS: '512' } as NodeJS.ProcessEnv)).toThrow(
      EmbeddingProviderError,
    );
    expect(() =>
      loadEmbeddingConfig({ EMBEDDING_NORMALIZE: 'false' } as NodeJS.ProcessEnv),
    ).toThrow(EmbeddingProviderError);
  });
});

describe('extractEmbeddingVector', () => {
  it('accepts canonical and embeddingsByType.float responses', () => {
    const vector = Array.from({ length: 1024 }, (_, i) => i * 0.001);
    expect(extractEmbeddingVector({ embedding: vector, inputTextTokenCount: 4 })).toEqual({
      embedding: vector,
      inputTokenCount: 4,
    });
    expect(
      extractEmbeddingVector({
        embeddingsByType: { float: vector },
        inputTextTokenCount: 7,
      }),
    ).toEqual({ embedding: vector, inputTokenCount: 7 });
  });

  it('rejects missing, wrong-length, and non-finite vectors', () => {
    expect(() => extractEmbeddingVector({})).toThrow(EmbeddingProviderError);
    expect(() => extractEmbeddingVector({ embedding: [1, 2, 3] })).toThrow(EmbeddingProviderError);
    const bad = Array.from({ length: 1024 }, () => 0);
    bad[10] = Number.NaN;
    expect(() => extractEmbeddingVector({ embedding: bad })).toThrow(EmbeddingProviderError);
  });
});

describe('BedrockTitanV2Provider', () => {
  const config = loadEmbeddingConfig({
    EMBEDDING_AUTO_ON_WRITE: 'false',
    EMBEDDING_MAX_ATTEMPTS: '2',
    EMBEDDING_TIMEOUT_MS: '1000',
  } as NodeJS.ProcessEnv);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps access denied, throttling, timeout, and unavailable errors safely', async () => {
    const cases: Array<{ name: string; code: string; status?: number }> = [
      {
        name: 'AccessDeniedException',
        code: EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_ACCESS_DENIED,
      },
      { name: 'ThrottlingException', code: EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_THROTTLED },
      { name: 'TimeoutError', code: EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_TIMEOUT },
      {
        name: 'ServiceUnavailableException',
        code: EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_UNAVAILABLE,
      },
    ];

    for (const item of cases) {
      const send = vi.fn().mockRejectedValue({ name: item.name, $metadata: {} });
      const provider = new BedrockTitanV2Provider({
        config: { ...config, maxAttempts: 1 },
        client: { send } as never,
      });
      await expect(provider.generate(validRequest())).rejects.toMatchObject({
        code: item.code,
      });
      const message = String(send.mock.calls.length && 'ok');
      expect(message).not.toMatch(/AKIA|aws_secret|password=/i);
    }
  });

  it('returns a validated vector without logging it', async () => {
    const vector = Array.from({ length: 1024 }, () => 0.01);
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ embedding: vector, inputTextTokenCount: 3 })),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new BedrockTitanV2Provider({
      config,
      client: { send } as never,
    });
    const result = await provider.generate(validRequest());
    expect(result.dimensions).toBe(1024);
    expect(result.normalized).toBe(true);
    expect(result.embedding).toHaveLength(1024);
    expect(result.inputTokenCount).toBe(3);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('0.01');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('0.01');
    const command = send.mock.calls[0][0];
    expect(command.input.modelId).toBe(TITAN_V2_MODEL_ID);
    expect(command.input.contentType).toBe('application/json');
    expect(command.input.accept).toBe('application/json');
  });

  it('does not retry non-retryable validation failures', async () => {
    const send = vi.fn().mockRejectedValue({ name: 'ValidationException' });
    const provider = new BedrockTitanV2Provider({
      config: { ...config, maxAttempts: 3 },
      client: { send } as never,
    });
    await expect(provider.generate(validRequest())).rejects.toMatchObject({
      code: EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_RESPONSE_INVALID,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
