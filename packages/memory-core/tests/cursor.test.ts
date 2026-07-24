import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, CursorError } from '../src/cursor.js';

const MEMORY_UUID = '66666666-6666-4666-8666-666666666666';

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a cursor with ISO datetime and UUID', () => {
    const date = new Date('2025-06-15T10:30:00.000Z');
    const encoded = encodeCursor(date, MEMORY_UUID);
    const decoded = decodeCursor(encoded);
    expect(decoded.updatedAt).toBe(date.toISOString());
    expect(decoded.id).toBe(MEMORY_UUID);
  });

  it('encodes to a URL-safe base64 string', () => {
    const encoded = encodeCursor(new Date('2025-06-15T10:30:00.000Z'), MEMORY_UUID);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });
});

describe('decodeCursor validation', () => {
  it('throws CursorError for invalid base64url', () => {
    expect(() => decodeCursor('!!!invalid!!!')).toThrow(CursorError);
  });

  it('throws CursorError for malformed JSON', () => {
    const bad = Buffer.from('not-json').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(CursorError);
  });

  it('throws CursorError for missing fields', () => {
    const bad = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(CursorError);
  });

  it('throws CursorError for SQL injection payload in updatedAt', () => {
    const bad = Buffer.from(
      JSON.stringify({
        updatedAt: "2025-01-01T00:00:00.000Z') OR true --",
        id: MEMORY_UUID,
      }),
    ).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(CursorError);
  });

  it('throws CursorError for invalid timestamp', () => {
    const bad = Buffer.from(JSON.stringify({ updatedAt: 'not-a-date', id: MEMORY_UUID })).toString(
      'base64url',
    );
    expect(() => decodeCursor(bad)).toThrow(CursorError);
  });

  it('throws CursorError for invalid UUID', () => {
    const bad = Buffer.from(
      JSON.stringify({ updatedAt: '2025-06-15T10:30:00.000Z', id: 'mem-123' }),
    ).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(CursorError);
  });

  it('throws CursorError for extra unexpected fields', () => {
    const bad = Buffer.from(
      JSON.stringify({
        updatedAt: '2025-06-15T10:30:00.000Z',
        id: MEMORY_UUID,
        evil: '1; DROP TABLE memories',
      }),
    ).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(CursorError);
  });
});
