import type {
  ApiErrorBody,
  MemoryCandidate,
  MemoryRecord,
  MemoryRevision,
  SearchResult,
  WhoAmI,
} from './types.js';

const REQUEST_TIMEOUT_MS = 20_000;

export class MemoryApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(message: string, status: number, code = 'REQUEST_FAILED', requestId?: string) {
    super(message);
    this.name = 'MemoryApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface RequestOptions extends RequestInit {
  authenticated?: boolean;
}

export class MemoryApiClient {
  readonly baseUrl: string;
  readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = normalizeEndpoint(baseUrl);
    this.apiKey = apiKey.trim();
  }

  async health(): Promise<boolean> {
    const result = await this.request<{ status?: string }>('/healthz', { authenticated: false });
    return result.status === 'ok';
  }

  async ready(): Promise<boolean> {
    const result = await this.request<{ status?: string }>('/readyz', { authenticated: false });
    return result.status === 'ok';
  }

  async whoami(): Promise<WhoAmI> {
    return this.request<WhoAmI>('/v1/whoami');
  }

  async listMemories(query = ''): Promise<{ items: MemoryRecord[]; nextCursor: string | null }> {
    const suffix = query ? `?${query}` : '';
    return this.request<{ items: MemoryRecord[]; nextCursor: string | null }>(
      `/v1/memories${suffix}`,
    );
  }

  async searchMemories(body: Record<string, unknown>): Promise<SearchResult[]> {
    return this.request<SearchResult[]>('/v1/memories/search', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async createMemory(body: Record<string, unknown>): Promise<MemoryRecord> {
    return this.request<MemoryRecord>('/v1/memories', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async correctMemory(
    memoryId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; revisionNumber: number; embeddingInvalidated: boolean }> {
    return this.request(`/v1/memories/${encodeURIComponent(memoryId)}/corrections`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getRevisions(memoryId: string): Promise<MemoryRevision[]> {
    const payload = await this.request<unknown>(
      `/v1/memories/${encodeURIComponent(memoryId)}/revisions`,
    );
    if (Array.isArray(payload)) return payload as MemoryRevision[];
    if (isRecord(payload) && Array.isArray(payload.revisions)) {
      return payload.revisions as MemoryRevision[];
    }
    return [];
  }

  async listCandidates(): Promise<MemoryCandidate[]> {
    const payload = await this.request<unknown>('/v1/candidates?limit=100');
    if (Array.isArray(payload)) return payload as MemoryCandidate[];
    if (isRecord(payload) && Array.isArray(payload.candidates)) {
      return payload.candidates as MemoryCandidate[];
    }
    return [];
  }

  async approveCandidate(candidateId: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request(`/v1/candidates/${encodeURIComponent(candidateId)}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async rejectCandidate(candidateId: string, reason: string): Promise<unknown> {
    return this.request(`/v1/candidates/${encodeURIComponent(candidateId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = new Headers(options.headers);
    headers.set('accept', 'application/json');
    headers.set('x-request-id', createRequestId());

    const authenticated = options.authenticated !== false;
    if (authenticated) {
      if (!this.apiKey) {
        window.clearTimeout(timeout);
        throw new MemoryApiError('An API key is required.', 401, 'AUTH_REQUIRED');
      }
      headers.set('authorization', `Bearer ${this.apiKey}`);
    }
    if (options.body !== undefined) headers.set('content-type', 'application/json');

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        redirect: 'error',
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? ((await response.json()) as unknown)
        : await response.text();

      if (!response.ok) {
        const errorBody = isRecord(payload) ? (payload as ApiErrorBody) : undefined;
        const message =
          errorBody?.error?.message ?? `Request failed with status ${response.status}.`;
        const code = errorBody?.error?.code ?? 'REQUEST_FAILED';
        const requestId =
          errorBody?.error?.requestId ?? response.headers.get('x-request-id') ?? undefined;
        throw new MemoryApiError(message, response.status, code, requestId);
      }

      return payload as T;
    } catch (error) {
      if (error instanceof MemoryApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new MemoryApiError('The request timed out.', 408, 'REQUEST_TIMEOUT');
      }
      throw new MemoryApiError(
        'MemoryOS could not reach the configured service. Check the endpoint and allowed portal origin.',
        0,
        'NETWORK_ERROR',
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

export function normalizeEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) throw new MemoryApiError('The MemoryOS service endpoint is required.', 400);
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new MemoryApiError('Enter a valid MemoryOS service endpoint.', 400);
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new MemoryApiError('The service endpoint must use HTTP or HTTPS.', 400);
  }
  if (parsed.username || parsed.password) {
    throw new MemoryApiError('Credentials must not be embedded in the service URL.', 400);
  }
  return parsed.toString().replace(/\/$/, '');
}

function createRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return `portal-${crypto.randomUUID()}`;
  return `portal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
