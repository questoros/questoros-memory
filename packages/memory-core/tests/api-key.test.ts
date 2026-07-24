import { describe, it, expect } from 'vitest';
import { generateApiKey, parseApiKey, hashApiKey, API_KEY_PREFIX } from '../src/api-key.js';

describe('generateApiKey', () => {
  it('returns a key with the correct prefix', () => {
    const result = generateApiKey();
    expect(result.raw).toMatch(/^qmem_live_/);
    expect(result.prefix).toBe(result.raw.slice(API_KEY_PREFIX.length, API_KEY_PREFIX.length + 8));
  });

  it('generates a hash for the key', () => {
    const result = generateApiKey();
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates unique keys on each call', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1.raw).not.toBe(key2.raw);
    expect(key1.hash).not.toBe(key2.hash);
  });
});

describe('parseApiKey', () => {
  it('parses a valid key correctly', () => {
    const generated = generateApiKey();
    const parsed = parseApiKey(generated.raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.raw).toBe(generated.raw);
    expect(parsed!.prefix).toBe(generated.prefix);
    expect(parsed!.secret.length).toBeGreaterThan(0);
  });

  it('returns null for a key with wrong prefix', () => {
    expect(parseApiKey('wrong_prefix_abc123')).toBeNull();
  });

  it('returns null for a key with missing parts', () => {
    expect(parseApiKey('qmem_live_')).toBeNull();
  });

  it('returns null for a malformed key', () => {
    expect(parseApiKey('qmem_live_onlyprefix')).toBeNull();
  });
});

describe('hashApiKey', () => {
  it('returns a SHA-256 hex hash', () => {
    const hash = hashApiKey('qmem_live_testkey_value');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const hash1 = hashApiKey('qmem_live_testkey_value');
    const hash2 = hashApiKey('qmem_live_testkey_value');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = hashApiKey('qmem_live_key_one');
    const hash2 = hashApiKey('qmem_live_key_two');
    expect(hash1).not.toBe(hash2);
  });
});
