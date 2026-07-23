/**
 * UUID and non-empty identifier validation utilities.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true when the value is a valid UUID string.
 */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Returns true when the value is a non-blank, trimmed identifier.
 */
export function isValidIdentifier(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
