import { PortalAuthError } from './portal-auth.js';

export type PortalEmailKind = 'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'INVITATION';

export interface PortalEmailInput {
  kind: PortalEmailKind;
  to: string;
  token: string;
  organizationName?: string;
  inviterName?: string;
}

export interface PortalEmailDelivery {
  delivery: 'webhook' | 'development';
  developmentUrl?: string;
}

function portalBaseUrl(): string {
  const configured = process.env.MEMORYOS_PORTAL_BASE_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new PortalAuthError(
        'EMAIL_NOT_CONFIGURED',
        503,
        'MemoryOS email delivery is not configured.',
      );
    }
    return 'http://localhost:4173';
  }
  const parsed = new URL(configured);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new PortalAuthError('EMAIL_NOT_CONFIGURED', 503, 'MemoryOS email delivery is not configured.');
  }
  return parsed.origin;
}

function actionUrl(input: PortalEmailInput): string {
  const base = portalBaseUrl();
  if (input.kind === 'VERIFY_EMAIL') {
    return `${base}/verify?token=${encodeURIComponent(input.token)}`;
  }
  if (input.kind === 'RESET_PASSWORD') {
    return `${base}/reset-password?token=${encodeURIComponent(input.token)}`;
  }
  return `${base}/invite/${encodeURIComponent(input.token)}`;
}

export async function sendPortalEmail(input: PortalEmailInput): Promise<PortalEmailDelivery> {
  const url = actionUrl(input);
  const webhookUrl = process.env.MEMORYOS_AUTH_EMAIL_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new PortalAuthError(
        'EMAIL_NOT_CONFIGURED',
        503,
        'MemoryOS email delivery is not configured.',
      );
    }
    return { delivery: 'development', developmentUrl: url };
  }

  const parsedWebhook = new URL(webhookUrl);
  if (parsedWebhook.protocol !== 'https:' || parsedWebhook.username || parsedWebhook.password) {
    throw new PortalAuthError('EMAIL_NOT_CONFIGURED', 503, 'MemoryOS email delivery is not configured.');
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const webhookToken = process.env.MEMORYOS_AUTH_EMAIL_WEBHOOK_TOKEN?.trim();
  if (webhookToken) headers.authorization = `Bearer ${webhookToken}`;

  const response = await fetch(parsedWebhook, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      product: 'MemoryOS',
      identityRealm: 'MEMORYOS_STANDALONE',
      template: input.kind,
      to: input.to,
      actionUrl: url,
      organizationName: input.organizationName,
      inviterName: input.inviterName,
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });

  if (!response.ok) {
    throw new PortalAuthError(
      'EMAIL_DELIVERY_FAILED',
      503,
      'MemoryOS could not send the account email. Please retry shortly.',
    );
  }
  return { delivery: 'webhook' };
}
