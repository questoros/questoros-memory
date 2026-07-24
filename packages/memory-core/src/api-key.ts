import { createHash, randomBytes } from 'node:crypto';

export const API_KEY_PREFIX = 'qmem_live_';

export interface ParsedApiKey {
  prefix: string;
  secret: string;
  raw: string;
}

export interface GeneratedApiKey {
  raw: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const bytes = randomBytes(32);
  const secret = bytes.toString('base64url').replace(/=+$/, '');
  const prefix = secret.substring(0, 8);
  const raw = `${API_KEY_PREFIX}${prefix}_${secret}`;
  const hash = hashApiKey(raw);
  return { raw, prefix, hash };
}

export function parseApiKey(token: string): ParsedApiKey | null {
  if (!token.startsWith(API_KEY_PREFIX)) return null;
  const rest = token.slice(API_KEY_PREFIX.length);
  if (rest.length < 10) return null;
  const prefix = rest.slice(0, 8);
  if (rest[8] !== '_') return null;
  const secret = rest.slice(9);
  if (!prefix || !secret) return null;
  return { prefix, secret, raw: token };
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf-8').digest('hex');
}
