import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, CursorError } from '../src/cursor.js';

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a cursor', () => {
    const date = new Date('2025-06-15T10:30:00Z');
    const id = 'mem-123';
    const encoded = encodeCursor(date, id);
    const decoded = decodeCursor(encoded);
    expect(decoded.updatedAt).toBe(date.toISOString());
    expect(decoded.id).toBe(id);
  });

  it('encodes to a URL-safe base64 string', () => {
    const encoded = encodeCursor(new Date(), 'mem-456');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });
});

describe('decodeCursor', () => {
  it('throws CursorError for invalid base64', () => {
    expect(() => decodeCursor('!!!invalid!!!')).toThrow(CursorError);
  });

  it('throws CursorError for malformed JSON', () => {
    const bad = Buffer.from('not-json').toString('base64');
    expect(() => decodeCursor(bad)).toThrow(CursorError);
  });

  it('throws CursorError for missing fields', () => {
    const bad = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64');
    expect(() => decodeCursor(bad)).toThrow(CursorError);
  });
});
