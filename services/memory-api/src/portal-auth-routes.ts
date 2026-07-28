import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  PORTAL_SESSION_COOKIE,
  PortalAuthError,
  clearPortalSessionCookie,
  getStandaloneSession,
  loginStandaloneMemoryOS,
  logoutStandaloneMemoryOS,
  readCookie,
  serializePortalSessionCookie,
  signupStandaloneMemoryOS,
  verifyStandaloneEmail,
} from './portal-auth.js';
import { sendPortalEmail } from './portal-email.js';

const PORTAL_CSRF_COOKIE = 'memoryos_csrf';

function requestContext(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return {
    requestId: request.id as string,
    userAgent:
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    ipAddress: forwardedValue?.split(',')[0]?.trim() || request.ip,
  };
}

function authErrorBody(error: PortalAuthError, requestId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
    },
  };
}

function sessionToken(request: FastifyRequest): string | undefined {
  return readCookie(request.headers.cookie, PORTAL_SESSION_COOKIE);
}

function csrfCookie(token: string, expiresAt: Date): string {
  return [
    `${PORTAL_CSRF_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'Secure',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ].join('; ');
}

function clearCsrfCookie(): string {
  return [
    `${PORTAL_CSRF_COOKIE}=`,
    'Path=/',
    'Secure',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
  ].join('; ');
}

function setSessionCookies(
  reply: FastifyReply,
  sessionTokenValue: string,
  csrfToken: string,
  expiresAt: Date,
): void {
  reply.raw.setHeader('Set-Cookie', [
    serializePortalSessionCookie(sessionTokenValue, expiresAt),
    csrfCookie(csrfToken, expiresAt),
  ]);
}

export function registerPortalAuthRoutes(app: FastifyInstance): void {
  app.post('/v1/portal/auth/signup', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const signup = await signupStandaloneMemoryOS(request.body, requestContext(request));
      const input = (request.body && typeof request.body === 'object'
        ? request.body
        : {}) as Record<string, unknown>;
      const delivery = await sendPortalEmail({
        kind: 'VERIFY_EMAIL',
        to: signup.email,
        token: signup.verificationToken,
        organizationName:
          typeof input.organizationName === 'string' ? input.organizationName.trim() : undefined,
      });
      return reply.status(202).send({
        ok: true,
        verificationRequired: true,
        expiresAt: signup.expiresAt.toISOString(),
        delivery: delivery.delivery,
        ...(delivery.developmentUrl ? { developmentVerificationUrl: delivery.developmentUrl } : {}),
      });
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return reply.status(error.statusCode).send(authErrorBody(error, requestId));
      }
      throw error;
    }
  });

  app.post('/v1/portal/auth/verify-email', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const session = await verifyStandaloneEmail(request.body, requestContext(request));
      setSessionCookies(reply, session.sessionToken, session.csrfToken, session.expiresAt);
      return reply.status(200).send({
        ok: true,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt.toISOString(),
        identity: session.identity,
        organization: session.organization,
      });
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return reply.status(error.statusCode).send(authErrorBody(error, requestId));
      }
      throw error;
    }
  });

  app.post('/v1/portal/auth/login', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const session = await loginStandaloneMemoryOS(request.body, requestContext(request));
      setSessionCookies(reply, session.sessionToken, session.csrfToken, session.expiresAt);
      return reply.status(200).send({
        ok: true,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt.toISOString(),
        identity: session.identity,
        organization: session.organization,
      });
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return reply.status(error.statusCode).send(authErrorBody(error, requestId));
      }
      throw error;
    }
  });

  app.get('/v1/portal/auth/me', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const token = sessionToken(request);
      if (!token) {
        throw new PortalAuthError('UNAUTHENTICATED', 401, 'Sign in to standalone MemoryOS.');
      }
      const session = await getStandaloneSession(token);
      return reply.status(200).send({
        ok: true,
        expiresAt: session.expiresAt.toISOString(),
        identity: session.identity,
        organization: session.organization,
      });
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return reply.status(error.statusCode).send(authErrorBody(error, requestId));
      }
      throw error;
    }
  });

  app.post('/v1/portal/auth/logout', async (request, reply) => {
    const requestId = request.id as string;
    try {
      const token = sessionToken(request);
      if (token) await logoutStandaloneMemoryOS(token, requestId);
      reply.raw.setHeader('Set-Cookie', [clearPortalSessionCookie(), clearCsrfCookie()]);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return reply.status(error.statusCode).send(authErrorBody(error, requestId));
      }
      throw error;
    }
  });
}
