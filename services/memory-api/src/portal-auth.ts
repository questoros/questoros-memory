import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { getDatabaseClient } from '@questoros-memory/database';
import type { ApiPermission } from '@questoros-memory/memory-core';

export const PORTAL_SESSION_COOKIE = 'memoryos_session';
export const PORTAL_CSRF_HEADER = 'x-memoryos-csrf';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const SESSION_HOURS = 12;
const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export type PortalRole =
  | 'READER'
  | 'CONTRIBUTOR'
  | 'REVIEWER'
  | 'PUBLISHER'
  | 'AUDITOR'
  | 'ADMINISTRATOR'
  | 'OWNER';

export class PortalAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'PortalAuthError';
  }
}

export interface PortalSessionResult {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  identity: {
    id: string;
    email: string;
    displayName: string | null;
  };
  organization: {
    tenantId: string;
    tenantName: string;
    workspaceId: string;
    workspaceName: string;
    role: PortalRole;
  };
}

export interface PortalSessionView {
  identity: PortalSessionResult['identity'];
  organization: PortalSessionResult['organization'];
  expiresAt: Date;
}

interface RequestContext {
  requestId?: string;
  userAgent?: string;
  ipAddress?: string;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new PortalAuthError('VALIDATION_ERROR', 400, 'A valid email address is required.');
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PortalAuthError('VALIDATION_ERROR', 400, 'A valid email address is required.');
  }
  return email;
}

function normalizeName(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new PortalAuthError('VALIDATION_ERROR', 400, `${label} is required.`);
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > maxLength) {
    throw new PortalAuthError(
      'VALIDATION_ERROR',
      400,
      `${label} must be between 2 and ${maxLength} characters.`,
    );
  }
  return normalized;
}

function normalizePassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw new PortalAuthError('VALIDATION_ERROR', 400, 'A password is required.');
  }
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    throw new PortalAuthError(
      'VALIDATION_ERROR',
      400,
      `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw new PortalAuthError(
      'VALIDATION_ERROR',
      400,
      'Password must include a lowercase letter, uppercase letter, and number.',
    );
  }
  return value;
}

function hashToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function fingerprint(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? hashToken(normalized) : null;
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

async function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(passwordValue: unknown): Promise<string> {
  const password = normalizePassword(passwordValue);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt);
  return [
    'scrypt',
    String(SCRYPT_OPTIONS.N),
    String(SCRYPT_OPTIONS.r),
    String(SCRYPT_OPTIONS.p),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nValue, rValue, pValue, saltValue, hashValue] = parts;
  const options = {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue),
    maxmem: 64 * 1024 * 1024,
  };
  if (
    !Number.isInteger(options.N) ||
    !Number.isInteger(options.r) ||
    !Number.isInteger(options.p) ||
    options.N < 16_384 ||
    options.r < 8 ||
    options.p < 1
  ) {
    return false;
  }
  try {
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scryptCallback(
        password,
        Buffer.from(saltValue, 'base64url'),
        expected.length,
        options,
        (error, key) => {
          if (error) reject(error);
          else resolve(key as Buffer);
        },
      );
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function slugBase(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'organization';
}

async function uniqueTenantSlug(
  prisma: ReturnType<typeof getDatabaseClient>,
  organizationName: string,
): Promise<string> {
  const base = slugBase(organizationName);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
    const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
  throw new PortalAuthError('CONFLICT', 409, 'The organization identifier could not be created.');
}

function permissionsForRole(role: PortalRole): ApiPermission[] {
  if (role === 'OWNER' || role === 'ADMINISTRATOR') return ['memory:admin'];
  if (role === 'PUBLISHER') {
    return ['memory:read', 'memory:write', 'memory:correct', 'memory:review', 'memory:publish'];
  }
  if (role === 'REVIEWER') return ['memory:read', 'memory:correct', 'memory:review'];
  if (role === 'CONTRIBUTOR') return ['memory:read', 'memory:write'];
  return ['memory:read'];
}

async function writeAudit(input: {
  identityId?: string | null;
  tenantId?: string | null;
  action: string;
  outcome: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const prisma = getDatabaseClient();
  await prisma.portalAuthAuditEvent.create({
    data: {
      identityId: input.identityId ?? null,
      tenantId: input.tenantId ?? null,
      action: input.action,
      outcome: input.outcome,
      requestId: input.requestId ?? null,
      metadata: input.metadata ?? {},
    },
  });
}

async function createSession(
  membership: {
    id: string;
    identityId: string;
    tenantId: string;
    workspaceId: string;
    actorId: string;
    role: string;
  },
  identity: { id: string; email: string; displayName: string | null },
  tenantName: string,
  workspaceName: string,
  context: RequestContext,
): Promise<PortalSessionResult> {
  const prisma = getDatabaseClient();
  const sessionToken = `qmem_session_${randomToken(36)}`;
  const csrfToken = randomToken(32);
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  const permissions = permissionsForRole(membership.role as PortalRole);

  const apiKey = await prisma.apiKey.create({
    data: {
      tenantId: membership.tenantId,
      actorId: membership.actorId,
      name: `MemoryOS browser session ${identity.email}`,
      keyPrefix: sessionToken.slice(0, 20),
      keyHash: tokenHash,
      scopeType: 'WORKSPACE',
      scopeId: membership.workspaceId,
      workspaceId: membership.workspaceId,
      projectId: null,
      permissions,
      status: 'ACTIVE',
      expiresAt,
    },
  });

  try {
    await prisma.portalSession.create({
      data: {
        identityId: identity.id,
        membershipId: membership.id,
        apiKeyId: apiKey.id,
        tokenHash,
        csrfHash: hashToken(csrfToken),
        userAgentHash: fingerprint(context.userAgent),
        ipAddressHash: fingerprint(context.ipAddress),
        expiresAt,
      },
    });
  } catch (error) {
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    throw error;
  }

  return {
    sessionToken,
    csrfToken,
    expiresAt,
    identity,
    organization: {
      tenantId: membership.tenantId,
      tenantName,
      workspaceId: membership.workspaceId,
      workspaceName,
      role: membership.role as PortalRole,
    },
  };
}

export async function signupStandaloneMemoryOS(
  body: unknown,
  context: RequestContext = {},
): Promise<{ verificationToken: string; email: string; expiresAt: Date }> {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = normalizeEmail(input.email);
  const displayName = normalizeName(input.displayName, 'Name', 100);
  const organizationName = normalizeName(input.organizationName, 'Organization name', 120);
  const passwordHash = await hashPassword(input.password);
  const prisma = getDatabaseClient();

  const existing = await prisma.portalIdentity.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new PortalAuthError(
      'ACCOUNT_EXISTS',
      409,
      'A standalone MemoryOS account already exists for this email address.',
    );
  }

  const tenantSlug = await uniqueTenantSlug(prisma, organizationName);
  const verificationToken = randomToken(32);
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const created = await prisma.$transaction(async (tx) => {
    const identity = await tx.portalIdentity.create({
      data: {
        email,
        displayName,
        passwordHash,
        status: 'PENDING_VERIFICATION',
      },
    });
    const tenant = await tx.tenant.create({
      data: { slug: tenantSlug, name: organizationName, status: 'ACTIVE', metadata: {} },
    });
    const workspace = await tx.workspace.create({
      data: {
        tenantId: tenant.id,
        slug: 'organization',
        name: `${organizationName} Intelligence`,
        status: 'ACTIVE',
        metadata: { product: 'MEMORYOS_STANDALONE' },
      },
    });
    const actor = await tx.actor.create({
      data: {
        tenantId: tenant.id,
        externalId: `memoryos-identity:${identity.id}`,
        actorType: 'USER',
        displayName,
        metadata: { identityRealm: 'MEMORYOS_STANDALONE' },
      },
    });
    await tx.portalMembership.create({
      data: {
        identityId: identity.id,
        tenantId: tenant.id,
        workspaceId: workspace.id,
        actorId: actor.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    await tx.portalIdentityToken.create({
      data: {
        identityId: identity.id,
        tokenType: 'EMAIL_VERIFICATION',
        tokenHash: hashToken(verificationToken),
        expiresAt: verificationExpiresAt,
      },
    });
    await tx.portalAuthAuditEvent.create({
      data: {
        identityId: identity.id,
        tenantId: tenant.id,
        action: 'SIGNUP',
        outcome: 'PENDING_EMAIL_VERIFICATION',
        requestId: context.requestId ?? null,
        metadata: { identityRealm: 'MEMORYOS_STANDALONE' },
      },
    });
    return { identity, tenant };
  });

  await writeAudit({
    identityId: created.identity.id,
    tenantId: created.tenant.id,
    action: 'VERIFICATION_TOKEN_ISSUED',
    outcome: 'SUCCESS',
    requestId: context.requestId,
  });

  return { verificationToken, email, expiresAt: verificationExpiresAt };
}

export async function verifyStandaloneEmail(
  body: unknown,
  context: RequestContext = {},
): Promise<PortalSessionResult> {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (token.length < 32) {
    throw new PortalAuthError('VALIDATION_ERROR', 400, 'The verification link is invalid.');
  }
  const prisma = getDatabaseClient();
  const stored = await prisma.portalIdentityToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (
    !stored ||
    stored.tokenType !== 'EMAIL_VERIFICATION' ||
    stored.consumedAt ||
    stored.expiresAt <= new Date()
  ) {
    throw new PortalAuthError('INVALID_TOKEN', 400, 'The verification link is invalid or expired.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const tokenClaim = await tx.portalIdentityToken.updateMany({
      where: { id: stored.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (tokenClaim.count !== 1) {
      throw new PortalAuthError('INVALID_TOKEN', 400, 'The verification link is invalid or expired.');
    }
    const identity = await tx.portalIdentity.update({
      where: { id: stored.identityId },
      data: {
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      },
      select: { id: true, email: true, displayName: true },
    });
    const membership = await tx.portalMembership.findFirst({
      where: { identityId: identity.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw new PortalAuthError('ACCESS_DENIED', 403, 'No active MemoryOS organization is assigned.');
    }
    const [tenant, workspace] = await Promise.all([
      tx.tenant.findUnique({ where: { id: membership.tenantId }, select: { name: true } }),
      tx.workspace.findUnique({ where: { id: membership.workspaceId }, select: { name: true } }),
    ]);
    if (!tenant || !workspace) {
      throw new PortalAuthError('ACCESS_DENIED', 403, 'The MemoryOS organization is unavailable.');
    }
    return { identity, membership, tenantName: tenant.name, workspaceName: workspace.name };
  });

  const session = await createSession(
    result.membership,
    result.identity,
    result.tenantName,
    result.workspaceName,
    context,
  );
  await writeAudit({
    identityId: result.identity.id,
    tenantId: result.membership.tenantId,
    action: 'EMAIL_VERIFIED',
    outcome: 'SUCCESS',
    requestId: context.requestId,
  });
  return session;
}

export async function loginStandaloneMemoryOS(
  body: unknown,
  context: RequestContext = {},
): Promise<PortalSessionResult> {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  const prisma = getDatabaseClient();
  const identity = await prisma.portalIdentity.findUnique({ where: { email } });
  const genericError = new PortalAuthError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect.');

  if (!identity) {
    await writeAudit({ action: 'LOGIN', outcome: 'DENIED', requestId: context.requestId });
    throw genericError;
  }
  if (identity.lockedUntil && identity.lockedUntil > new Date()) {
    await writeAudit({
      identityId: identity.id,
      action: 'LOGIN',
      outcome: 'LOCKED',
      requestId: context.requestId,
    });
    throw new PortalAuthError(
      'ACCOUNT_LOCKED',
      429,
      'This account is temporarily locked. Try again later or reset the password.',
    );
  }

  const valid = await verifyPassword(password, identity.passwordHash);
  if (!valid) {
    const failures = identity.failedLoginCount + 1;
    await prisma.portalIdentity.update({
      where: { id: identity.id },
      data: {
        failedLoginCount: failures,
        lockedUntil:
          failures >= LOCK_AFTER_FAILURES
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null,
        updatedAt: new Date(),
      },
    });
    await writeAudit({
      identityId: identity.id,
      action: 'LOGIN',
      outcome: 'DENIED',
      requestId: context.requestId,
    });
    throw genericError;
  }
  if (identity.status === 'PENDING_VERIFICATION' || !identity.emailVerifiedAt) {
    throw new PortalAuthError(
      'EMAIL_VERIFICATION_REQUIRED',
      403,
      'Verify the email address before signing in to standalone MemoryOS.',
    );
  }
  if (identity.status !== 'ACTIVE') {
    throw new PortalAuthError('ACCOUNT_DISABLED', 403, 'This standalone MemoryOS account is disabled.');
  }

  const membership = await prisma.portalMembership.findFirst({
    where: {
      identityId: identity.id,
      status: 'ACTIVE',
      ...(typeof input.workspaceId === 'string' && input.workspaceId
        ? { workspaceId: input.workspaceId }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!membership) {
    throw new PortalAuthError('ACCESS_DENIED', 403, 'No active MemoryOS organization is assigned.');
  }
  const [tenant, workspace] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: membership.tenantId }, select: { name: true, status: true } }),
    prisma.workspace.findUnique({
      where: { id: membership.workspaceId },
      select: { name: true, status: true },
    }),
  ]);
  if (!tenant || tenant.status !== 'ACTIVE' || !workspace || workspace.status !== 'ACTIVE') {
    throw new PortalAuthError('ACCESS_DENIED', 403, 'The MemoryOS organization is unavailable.');
  }

  await prisma.portalIdentity.update({
    where: { id: identity.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const session = await createSession(
    membership,
    { id: identity.id, email: identity.email, displayName: identity.displayName },
    tenant.name,
    workspace.name,
    context,
  );
  await writeAudit({
    identityId: identity.id,
    tenantId: membership.tenantId,
    action: 'LOGIN',
    outcome: 'SUCCESS',
    requestId: context.requestId,
  });
  return session;
}

export async function getStandaloneSession(sessionToken: string): Promise<PortalSessionView> {
  const prisma = getDatabaseClient();
  const session = await prisma.portalSession.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw new PortalAuthError('UNAUTHENTICATED', 401, 'The MemoryOS session is invalid or expired.');
  }
  const [identity, membership] = await Promise.all([
    prisma.portalIdentity.findUnique({ where: { id: session.identityId } }),
    prisma.portalMembership.findUnique({ where: { id: session.membershipId } }),
  ]);
  if (!identity || identity.status !== 'ACTIVE' || !membership || membership.status !== 'ACTIVE') {
    throw new PortalAuthError('ACCESS_DENIED', 403, 'The MemoryOS account or membership is unavailable.');
  }
  const [tenant, workspace] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: membership.tenantId } }),
    prisma.workspace.findUnique({ where: { id: membership.workspaceId } }),
  ]);
  if (!tenant || tenant.status !== 'ACTIVE' || !workspace || workspace.status !== 'ACTIVE') {
    throw new PortalAuthError('ACCESS_DENIED', 403, 'The MemoryOS organization is unavailable.');
  }
  await prisma.portalSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
  return {
    identity: { id: identity.id, email: identity.email, displayName: identity.displayName },
    organization: {
      tenantId: tenant.id,
      tenantName: tenant.name,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      role: membership.role as PortalRole,
    },
    expiresAt: session.expiresAt,
  };
}

export async function assertStandaloneCsrf(
  sessionToken: string,
  csrfToken: string | undefined,
): Promise<void> {
  if (!csrfToken) {
    throw new PortalAuthError('CSRF_REQUIRED', 403, 'The request could not be verified.');
  }
  const prisma = getDatabaseClient();
  const session = await prisma.portalSession.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
    select: { csrfHash: true, expiresAt: true, revokedAt: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.csrfHash !== hashToken(csrfToken)
  ) {
    throw new PortalAuthError('CSRF_INVALID', 403, 'The request could not be verified.');
  }
}

export async function logoutStandaloneMemoryOS(
  sessionToken: string,
  requestId?: string,
): Promise<void> {
  const prisma = getDatabaseClient();
  const session = await prisma.portalSession.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
  });
  if (!session) return;
  const now = new Date();
  await prisma.$transaction([
    prisma.portalSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now, revocationReason: 'USER_LOGOUT' },
    }),
    prisma.apiKey.updateMany({
      where: { id: session.apiKeyId, revokedAt: null },
      data: { status: 'REVOKED', revokedAt: now },
    }),
    prisma.portalAuthAuditEvent.create({
      data: {
        identityId: session.identityId,
        action: 'LOGOUT',
        outcome: 'SUCCESS',
        requestId: requestId ?? null,
        metadata: {},
      },
    }),
  ]);
}

export function serializePortalSessionCookie(token: string, expiresAt: Date): string {
  return [
    `${PORTAL_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ].join('; ');
}

export function clearPortalSessionCookie(): string {
  return [
    `${PORTAL_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
  ].join('; ');
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
