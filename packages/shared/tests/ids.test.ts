import { describe, it, expect } from 'vitest';
import { isValidUuid, isValidIdentifier } from '../src/ids';

describe('isValidUuid', () => {
  it('accepts a valid UUID', () => {
    expect(isValidUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('rejects an invalid UUID', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUuid('')).toBe(false);
  });
});

describe('isValidIdentifier', () => {
  it('accepts a non-empty identifier', () => {
    expect(isValidIdentifier('my-tenant')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidIdentifier('')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(isValidIdentifier('   ')).toBe(false);
  });

  it('accepts a trimmed identifier', () => {
    expect(isValidIdentifier('  hello  ')).toBe(true);
  });
});
