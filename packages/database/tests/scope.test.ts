import { describe, it, expect } from 'vitest';
import { resolveScope } from '../src/scope';

describe('resolveScope', () => {
  it('returns TENANT scope when only tenantId is provided', () => {
    const result = resolveScope({ tenantId: 't1' });
    expect(result).toEqual({ scopeType: 'TENANT', scopeId: 't1' });
  });

  it('returns WORKSPACE scope when workspaceId is provided', () => {
    const result = resolveScope({ tenantId: 't1', workspaceId: 'w1' });
    expect(result).toEqual({ scopeType: 'WORKSPACE', scopeId: 'w1' });
  });

  it('returns PROJECT scope when projectId is provided', () => {
    const result = resolveScope({
      tenantId: 't1',
      workspaceId: 'w1',
      projectId: 'p1',
    });
    expect(result).toEqual({ scopeType: 'PROJECT', scopeId: 'p1' });
  });

  it('throws when projectId is provided without workspaceId', () => {
    expect(() => resolveScope({ tenantId: 't1', projectId: 'p1' })).toThrow(
      'project scope requires a non-blank workspaceId',
    );
  });

  it('throws when tenantId is blank', () => {
    expect(() => resolveScope({ tenantId: '' })).toThrow('tenantId must be a non-blank string');
  });

  it('throws when workspaceId is blank', () => {
    expect(() => resolveScope({ tenantId: 't1', workspaceId: '' })).toThrow(
      'workspaceId must be a non-blank string when provided',
    );
  });

  it('throws when projectId is blank', () => {
    expect(() => resolveScope({ tenantId: 't1', workspaceId: 'w1', projectId: '' })).toThrow(
      'projectId must be a non-blank string when provided',
    );
  });
});
