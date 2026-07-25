export const API_PERMISSIONS = [
  'memory:read',
  'memory:write',
  'memory:correct',
  'memory:delete',
  'memory:embed',
  'memory:harvest',
  'memory:review',
  'memory:publish',
  'memory:admin',
] as const;

export type ApiPermission = (typeof API_PERMISSIONS)[number];

export const PERMISSION_HIERARCHY: Record<ApiPermission, readonly ApiPermission[]> = {
  'memory:admin': [
    'memory:read',
    'memory:write',
    'memory:correct',
    'memory:delete',
    'memory:embed',
    'memory:harvest',
    'memory:review',
    'memory:publish',
    'memory:admin',
  ],
  'memory:read': ['memory:read'],
  'memory:write': ['memory:write'],
  'memory:correct': ['memory:correct'],
  'memory:delete': ['memory:delete'],
  'memory:embed': ['memory:embed'],
  'memory:harvest': ['memory:harvest'],
  'memory:review': ['memory:review'],
  'memory:publish': ['memory:publish'],
};

export function hasPermission(granted: readonly ApiPermission[], required: ApiPermission): boolean {
  if (granted.includes('memory:admin')) return true;
  return granted.includes(required);
}

export function impliesPermission(
  granted: readonly ApiPermission[],
  required: ApiPermission,
): boolean {
  for (const g of granted) {
    if (PERMISSION_HIERARCHY[g].includes(required)) return true;
  }
  return false;
}

export function validatePermissions(value: unknown): ApiPermission[] {
  if (!Array.isArray(value)) throw new Error('Permissions must be an array');
  if (value.length === 0) throw new Error('Permissions must be non-empty');
  const unique = new Set(value);
  if (unique.size !== value.length) throw new Error('Permissions must be unique');
  for (const p of value) {
    if (!API_PERMISSIONS.includes(p as ApiPermission)) {
      throw new Error(`Unknown permission: ${p}`);
    }
  }
  return value as ApiPermission[];
}

export function sortPermissions(perms: readonly ApiPermission[]): ApiPermission[] {
  const order: Record<string, number> = {
    'memory:read': 0,
    'memory:write': 1,
    'memory:correct': 2,
    'memory:delete': 3,
    'memory:embed': 4,
    'memory:harvest': 5,
    'memory:review': 6,
    'memory:publish': 7,
    'memory:admin': 8,
  };
  return [...perms].sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
}
