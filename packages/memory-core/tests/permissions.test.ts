import { describe, it, expect } from 'vitest';
import {
  API_PERMISSIONS,
  hasPermission,
  impliesPermission,
  validatePermissions,
  sortPermissions,
} from '../src/permissions.js';

describe('API_PERMISSIONS', () => {
  it('contains exactly six permissions', () => {
    expect(API_PERMISSIONS).toEqual([
      'memory:read',
      'memory:write',
      'memory:correct',
      'memory:delete',
      'memory:embed',
      'memory:admin',
    ]);
  });
});

describe('hasPermission', () => {
  it('returns true when permission is directly granted', () => {
    expect(hasPermission(['memory:read'], 'memory:read')).toBe(true);
  });

  it('returns true when admin is granted regardless of required permission', () => {
    expect(hasPermission(['memory:admin'], 'memory:delete')).toBe(true);
    expect(hasPermission(['memory:admin'], 'memory:read')).toBe(true);
    expect(hasPermission(['memory:admin'], 'memory:embed')).toBe(true);
  });

  it('returns false when permission is not granted', () => {
    expect(hasPermission(['memory:read'], 'memory:write')).toBe(false);
  });

  it('returns false for empty granted list', () => {
    expect(hasPermission([], 'memory:read')).toBe(false);
  });
});

describe('impliesPermission', () => {
  it('returns true when a granted permission hierarchically includes the required one', () => {
    expect(impliesPermission(['memory:admin'], 'memory:read')).toBe(true);
    expect(impliesPermission(['memory:admin'], 'memory:delete')).toBe(true);
    expect(impliesPermission(['memory:admin'], 'memory:embed')).toBe(true);
    expect(impliesPermission(['memory:admin'], 'memory:correct')).toBe(true);
    expect(impliesPermission(['memory:admin'], 'memory:write')).toBe(true);
  });

  it('returns true when the exact permission is granted', () => {
    expect(impliesPermission(['memory:write'], 'memory:write')).toBe(true);
  });

  it('returns false when required permission is not implied', () => {
    expect(impliesPermission(['memory:read'], 'memory:write')).toBe(false);
    expect(impliesPermission(['memory:write'], 'memory:admin')).toBe(false);
  });
});

describe('validatePermissions', () => {
  it('returns valid permissions array for valid input', () => {
    expect(validatePermissions(['memory:read', 'memory:write'])).toEqual([
      'memory:read',
      'memory:write',
    ]);
  });

  it('throws if input is not an array', () => {
    expect(() => validatePermissions('not-an-array')).toThrow('Permissions must be an array');
  });

  it('throws if array is empty', () => {
    expect(() => validatePermissions([])).toThrow('Permissions must be non-empty');
  });

  it('throws if permissions contain duplicates', () => {
    expect(() => validatePermissions(['memory:read', 'memory:read'])).toThrow(
      'Permissions must be unique',
    );
  });

  it('throws if an unknown permission is included', () => {
    expect(() => validatePermissions(['memory:read', 'unknown:perm'] as string[])).toThrow(
      'Unknown permission: unknown:perm',
    );
  });
});

describe('sortPermissions', () => {
  it('sorts permissions in canonical order', () => {
    expect(sortPermissions(['memory:admin', 'memory:read'])).toEqual([
      'memory:read',
      'memory:admin',
    ]);
    expect(sortPermissions(['memory:delete', 'memory:embed', 'memory:read'])).toEqual([
      'memory:read',
      'memory:delete',
      'memory:embed',
    ]);
  });

  it('does not mutate the original array', () => {
    const input = ['memory:admin', 'memory:read'];
    sortPermissions(input);
    expect(input).toEqual(['memory:admin', 'memory:read']);
  });
});
