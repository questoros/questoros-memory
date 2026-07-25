export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface MemoryApiClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
}

export class MemoryApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'MemoryApiError';
    this.status = status;
    this.body = body;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function toQuery(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Thin public REST client. Uses fetch only — never imports memory-service or database.
 */
export class MemoryApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: MemoryApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.fetchImpl =
      options.fetch ??
      globalThis.fetch ??
      (() => {
        throw new Error('No fetch implementation available. Pass options.fetch.');
      });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    const url = `${joinUrl(this.baseUrl, path)}${toQuery(query)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      const message =
        typeof parsed === 'object' &&
        parsed !== null &&
        'error' in parsed &&
        typeof (parsed as { error?: { message?: unknown } }).error?.message === 'string'
          ? (parsed as { error: { message: string } }).error.message
          : `Memory API request failed: ${response.status} ${response.statusText}`;
      throw new MemoryApiError(response.status, message, parsed);
    }

    return parsed as T;
  }

  whoami(): Promise<unknown> {
    return this.request('GET', '/v1/whoami');
  }

  createMemory(body: unknown): Promise<unknown> {
    return this.request('POST', '/v1/memories', body);
  }

  getMemory(memoryId: string, query?: { includeDeleted?: boolean }): Promise<unknown> {
    return this.request('GET', `/v1/memories/${encodeURIComponent(memoryId)}`, undefined, query);
  }

  listMemories(
    query?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<unknown> {
    return this.request('GET', '/v1/memories', undefined, query);
  }

  searchMemories(body: unknown): Promise<unknown> {
    return this.request('POST', '/v1/memories/search', body);
  }

  correctMemory(memoryId: string, body: unknown): Promise<unknown> {
    return this.request('POST', `/v1/memories/${encodeURIComponent(memoryId)}/corrections`, body);
  }

  getHistory(memoryId: string): Promise<unknown> {
    return this.request('GET', `/v1/memories/${encodeURIComponent(memoryId)}/revisions`);
  }

  generateEmbedding(memoryId: string, body?: unknown): Promise<unknown> {
    return this.request(
      'POST',
      `/v1/memories/${encodeURIComponent(memoryId)}/embedding/generate`,
      body ?? {},
    );
  }

  createHarvestRun(body: unknown): Promise<unknown> {
    return this.request('POST', '/v1/harvest/runs', body);
  }

  getHarvestRun(runId: string): Promise<unknown> {
    return this.request('GET', `/v1/harvest/runs/${encodeURIComponent(runId)}`);
  }

  listCandidates(
    query?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<unknown> {
    return this.request('GET', '/v1/candidates', undefined, query);
  }

  getCandidate(candidateId: string): Promise<unknown> {
    return this.request('GET', `/v1/candidates/${encodeURIComponent(candidateId)}`);
  }

  approveCandidate(candidateId: string, body?: unknown): Promise<unknown> {
    return this.request(
      'POST',
      `/v1/candidates/${encodeURIComponent(candidateId)}/approve`,
      body ?? {},
    );
  }

  rejectCandidate(candidateId: string, body?: unknown): Promise<unknown> {
    return this.request(
      'POST',
      `/v1/candidates/${encodeURIComponent(candidateId)}/reject`,
      body ?? {},
    );
  }

  createContextPackage(body: unknown): Promise<unknown> {
    return this.request('POST', '/v1/context/packages', body);
  }

  publishArtifact(body: unknown): Promise<unknown> {
    return this.request('POST', '/v1/publish/artifacts', body);
  }

  getPublishedArtifact(artifactId: string): Promise<unknown> {
    return this.request('GET', `/v1/publish/artifacts/${encodeURIComponent(artifactId)}`);
  }

  syncArtifact(artifactId: string, body?: unknown): Promise<unknown> {
    return this.request(
      'POST',
      `/v1/publish/artifacts/${encodeURIComponent(artifactId)}/sync`,
      body ?? {},
    );
  }
}
