import { describe, it, expect } from 'vitest';
import { ERROR_CODES, ServiceError } from '../src/errors.js';

describe('ERROR_CODES', () => {
  it('contains all expected error codes', () => {
    expect(ERROR_CODES).toMatchInlineSnapshot(`
      {
        "AUTH_EXPIRED": "AUTH_EXPIRED",
        "AUTH_INVALID": "AUTH_INVALID",
        "AUTH_REQUIRED": "AUTH_REQUIRED",
        "AUTH_REVOKED": "AUTH_REVOKED",
        "CONFLICT": "CONFLICT",
        "DATABASE_RETRY_EXHAUSTED": "DATABASE_RETRY_EXHAUSTED",
        "DRIVE_NOT_CONFIGURED": "DRIVE_NOT_CONFIGURED",
        "EMBEDDING_INPUT_EMPTY": "EMBEDDING_INPUT_EMPTY",
        "EMBEDDING_INPUT_TOO_LARGE": "EMBEDDING_INPUT_TOO_LARGE",
        "EMBEDDING_INVALID": "EMBEDDING_INVALID",
        "EMBEDDING_PROVIDER_ACCESS_DENIED": "EMBEDDING_PROVIDER_ACCESS_DENIED",
        "EMBEDDING_PROVIDER_NOT_CONFIGURED": "EMBEDDING_PROVIDER_NOT_CONFIGURED",
        "EMBEDDING_PROVIDER_RESPONSE_INVALID": "EMBEDDING_PROVIDER_RESPONSE_INVALID",
        "EMBEDDING_PROVIDER_THROTTLED": "EMBEDDING_PROVIDER_THROTTLED",
        "EMBEDDING_PROVIDER_TIMEOUT": "EMBEDDING_PROVIDER_TIMEOUT",
        "EMBEDDING_PROVIDER_UNAVAILABLE": "EMBEDDING_PROVIDER_UNAVAILABLE",
        "INTERNAL_ERROR": "INTERNAL_ERROR",
        "INVALID_CURSOR": "INVALID_CURSOR",
        "MEMORY_DELETED": "MEMORY_DELETED",
        "MEMORY_DUPLICATE": "MEMORY_DUPLICATE",
        "MEMORY_NOT_FOUND": "MEMORY_NOT_FOUND",
        "MEMORY_UNCHANGED": "MEMORY_UNCHANGED",
        "PERMISSION_DENIED": "PERMISSION_DENIED",
        "SCOPE_DENIED": "SCOPE_DENIED",
        "VALIDATION_ERROR": "VALIDATION_ERROR",
      }
    `);
  });
});

describe('ServiceError', () => {
  it('constructs with code, message, and default status 400', () => {
    const err = new ServiceError('VALIDATION_ERROR', 'Invalid input');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ServiceError');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Invalid input');
    expect(err.statusCode).toBe(400);
  });

  it('accepts a custom status code', () => {
    const err = new ServiceError('AUTH_REQUIRED', 'Authentication required', 401);
    expect(err.statusCode).toBe(401);
  });

  it('works with all error codes', () => {
    for (const code of Object.values(ERROR_CODES)) {
      const err = new ServiceError(code, `Error: ${code}`);
      expect(err.code).toBe(code);
    }
  });
});
