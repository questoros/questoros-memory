import { MemoryApiClient, MemoryApiError, normalizeEndpoint } from './api.js';
import {
  asRecord,
  collectSourceLinks,
  escapeAttribute,
  escapeHtml,
  formatDate,
  formatPercent,
  humanize,
  icareStage,
  memoryTitle,
  statusTone,
  truncate,
  typeTone,
} from './format.js';
import type {
  MemoryCandidate,
  MemoryRecord,
  MemoryRevision,
  PortalView,
  PublicHealth,
  RuntimeConfig,
  SearchResult,
  SourceLink,
  WhoAmI,
} from './types.js';

declare global {
  interface Window {
    __MEMORYOS_CONFIG__?: RuntimeConfig;
  }
}

interface AppState {
  view: PortalView;
  endpoint: string;
  apiKey: string;
  connected: boolean;
  loading: boolean;
  identity: WhoAmI | null;
  memories: MemoryRecord[];
  candidates: MemoryCandidate[];
  searchResults: SearchResult[];
  lastQuestion: string;
  selectedMemoryId: string | null;
  revisions: MemoryRevision[];
  revisionsLoading: boolean;
  showCreate: boolean;
  correctionMode: boolean;
  knowledgeQuery: string;
  knowledgeType: string;
  reviewFilter: string;
  notice: { tone: 'success' | 'error' | 'info'; message: string } | null;
  publicHealth: PublicHealth;
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('MemoryOS portal root was not found.');

const runtimeConfig = window.__MEMORYOS_CONFIG__ ?? {};
const configuredEndpoint = runtimeConfig.apiBaseUrl?.trim() ?? '';
const rememberedEndpoint = window.localStorage.getItem('memoryos.endpoint') ?? '';
const sessionKey = window.sessionStorage.getItem('memoryos.apiKey') ?? '';

const state: AppState = {
  view: 'overview',
  endpoint: configuredEndpoint || rememberedEndpoint,
  apiKey: sessionKey,
  connected: false,
  loading: false,
  identity: null,
  memories: [],
  candidates: [],
  searchResults: [],
  lastQuestion: '',
  selectedMemoryId: null,
  revisions: [],
  revisionsLoading: false,
  showCreate: false,
  correctionMode: false,
  knowledgeQuery: '',
  knowledgeType: 'ALL',
  reviewFilter: 'OPEN',
  notice: null,
  publicHealth: {
    portal: 'operational',
    api: 'checking',
    readiness: 'checking',
    checkedAt: null,
  },
};

let client: MemoryApiClient | null = null;
const statusRoute = window.location.pathname.replace(/\/+$/, '') === '/status' || window.location.hash === '#status';

function hasPermission(permission: string): boolean {
  const permissions = state.identity?.permissions ?? [];
  return permissions.includes('memory:admin') || permissions.includes(permission);
}

function scopeLabel(identity: WhoAmI): string {
  const scope = identity.credentialScope;
  if (scope.scopeType === 'PROJECT') return 'Project workspace';
  if (scope.scopeType === 'WORKSPACE') return 'Company workspace';
  return 'Organization';
}

function scopePayload(): Record<string, unknown> {
  const scope = state.identity?.credentialScope;
  if (!scope) return {};
  return {
    scopeType: scope.scopeType,
    ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
  };
}

function scopeQuery(): string {
  const scope = state.identity?.credentialScope;
  if (!scope) return '';
  const params = new URLSearchParams({ scopeType: scope.scopeType, status: 'ACTIVE', limit: '100' });
  if (scope.workspaceId) params.set('workspaceId', scope.workspaceId);
  if (scope.projectId) params.set('projectId', scope.projectId);
  return params.toString();
}

function setNotice(tone: 'success' | 'error' | 'info', message: string): void {
  state.notice = { tone, message };
}

function clearNotice(): void {
  state.notice = null;
}

function describeError(error: unknown): string {
  if (error instanceof MemoryApiError) {
    const request = error.requestId ? ` Reference: ${error.requestId}.` : '';
    return `${error.message}${request}`;
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

async function connect(endpoint: string, apiKey: string): Promise<void> {
  clearNotice();
  state.loading = true;
  render();
  try {
    const normalized = normalizeEndpoint(endpoint);
    const nextClient = new MemoryApiClient(normalized, apiKey);
    await nextClient.health();
    const identity = await nextClient.whoami();
    state.endpoint = normalized;
    state.apiKey = apiKey.trim();
    state.identity = identity;
    state.connected = true;
    client = nextClient;
    window.localStorage.setItem('memoryos.endpoint', normalized);
    window.sessionStorage.setItem('memoryos.apiKey', state.apiKey);
    await loadWorkspace();
    setNotice('success', 'MemoryOS is connected to the authorized company workspace.');
  } catch (error) {
    state.connected = false;
    state.identity = null;
    client = null;
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function loadWorkspace(): Promise<void> {
  if (!client || !state.identity) return;
  const memories = await client.listMemories(scopeQuery());
  state.memories = memories.items;
  if (hasPermission('memory:review')) {
    try {
      state.candidates = await client.listCandidates();
    } catch (error) {
      state.candidates = [];
      setNotice('info', `Knowledge loaded. Review queue could not be loaded: ${describeError(error)}`);
    }
  } else {
    state.candidates = [];
  }
}

async function refreshWorkspace(): Promise<void> {
  if (!state.connected) return;
  state.loading = true;
  render();
  try {
    await loadWorkspace();
    setNotice('success', 'Workspace intelligence is up to date.');
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

function signOut(): void {
  window.sessionStorage.removeItem('memoryos.apiKey');
  state.apiKey = '';
  state.connected = false;
  state.identity = null;
  state.memories = [];
  state.candidates = [];
  state.searchResults = [];
  state.selectedMemoryId = null;
  client = null;
  setNotice('info', 'The controlled client session has been closed.');
  render();
}

function noticeMarkup(): string {
  if (!state.notice) return '';
  return `<div class="notice notice-${state.notice.tone}" role="status">
    <span>${state.notice.tone === 'success' ? '✓' : state.notice.tone === 'error' ? '!' : 'i'}</span>
    <p>${escapeHtml(state.notice.message)}</p>
    <button type="button" class="notice-close" data-dismiss-notice aria-label="Dismiss">×</button>
  </div>`;
}

function badge(label: string, tone = 'slate'): string {
  return `<span class="badge badge-${escapeAttribute(tone)}">${escapeHtml(label)}</span>`;
}

function sourceLinksMarkup(links: SourceLink[]): string {
  if (links.length === 0) return '';
  return `<div class="source-links">${links
    .map(
      (link) => `<a class="source-link" href="${escapeAttribute(link.url)}" target="_blank" rel="noopener noreferrer">
        <span>${link.kind === 'folder' ? '▱' : link.kind === 'meeting' ? '◉' : link.kind === 'message' ? '✉' : '↗'}</span>
        ${escapeHtml(link.label)}
      </a>`,
    )
    .join('')}</div>`;
}

function renderConnect(): string {
  const endpointLocked = Boolean(configuredEndpoint);
  return `<main class="connect-page">
    <a class="status-link status-link-floating" href="/status" target="_blank" rel="noopener">Service status</a>
    <section class="connect-card">
      <div class="brand-lockup brand-lockup-large">
        <div class="brand-mark">M</div>
        <div>
          <strong>MemoryOS</strong>
          <span>by QuestorOS</span>
        </div>
      </div>
      <div class="connect-copy">
        ${badge('Controlled company pilot', 'green')}
        <h1>Your organization’s intelligence foundation.</h1>
        <p>Ask what the company knows, review the supporting evidence, and strengthen trusted organizational intelligence without replacing the systems your team already uses.</p>
      </div>
      ${noticeMarkup()}
      <form id="connect-form" class="connect-form">
        <label>
          <span>MemoryOS service</span>
          <input id="endpoint" name="endpoint" type="url" required autocomplete="url" value="${escapeAttribute(state.endpoint)}" ${endpointLocked ? 'readonly' : ''} placeholder="https://api.memory.questoros.ai/staging">
          <small>${endpointLocked ? 'Configured for this client portal.' : 'Use the approved MemoryOS API endpoint for this pilot.'}</small>
        </label>
        <label>
          <span>Workspace access key</span>
          <input id="api-key" name="apiKey" type="password" required autocomplete="off" value="${escapeAttribute(state.apiKey)}" placeholder="Temporary project-scoped access key">
          <small>The key is held only in this browser tab and is removed when you sign out.</small>
        </label>
        <button class="button button-primary button-large" type="submit" ${state.loading ? 'disabled' : ''}>
          ${state.loading ? '<span class="spinner"></span> Connecting…' : 'Open MemoryOS'}
        </button>
      </form>
      <div class="trust-strip">
        <span>Scoped access</span><span>Source-linked answers</span><span>Immutable corrections</span><span>Human-governed review</span>
      </div>
    </section>
    <p class="connect-footer">Intelligence belongs to those who create it.</p>
  </main>`;
}

function renderSidebar(): string {
  const items: Array<{ view: PortalView; label: string; icon: string }> = [
    { view: 'overview', label: 'Overview', icon: '◈' },
    { view: 'ask', label: 'Ask', icon: '⌕' },
    { view: 'knowledge', label: 'Knowledge', icon: '▦' },
    { view: 'review', label: 'Review', icon: '✓' },
  ];
  return `<aside class="sidebar">
    <div class="brand-lockup">
      <div class="brand-mark">M</div>
      <div><strong>MemoryOS</strong><span>by QuestorOS</span></div>
    </div>
    <nav class="sidebar-nav" aria-label="MemoryOS">
      ${items
        .map(
          (item) => `<button type="button" class="nav-item ${state.view === item.view ? 'active' : ''}" data-view="${item.view}">
            <span class="nav-icon">${item.icon}</span><span>${item.label}</span>
            ${item.view === 'review' && openCandidates().length > 0 ? `<em>${openCandidates().length}</em>` : ''}
          </button>`,
        )
        .join('')}
    </nav>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-card">
      <span class="eyebrow">Authorized scope</span>
      <strong>${state.identity ? escapeHtml(scopeLabel(state.identity)) : 'Workspace'}</strong>
      <span>${state.identity ? escapeHtml(state.identity.credentialScope.scopeType) : ''}</span>
    </div>
    <a class="sidebar-status" href="/status" target="_blank" rel="noopener"><span class="status-dot"></span> Public service status</a>
    <button type="button" class="signout-button" data-signout>Close session</button>
  </aside>`;
}

function renderTopbar(): string {
  const permissionLabel = hasPermission('memory:review')
    ? 'Reviewer access'
    : hasPermission('memory:write')
      ? 'Contributor access'
      : 'Read-only access';
  return `<header class="topbar">
    <div>
      <span class="eyebrow">${escapeHtml(scopeLabel(state.identity as WhoAmI))}</span>
      <h1>${escapeHtml(humanize(state.view))}</h1>
    </div>
    <div class="topbar-actions">
      ${badge(permissionLabel, hasPermission('memory:review') ? 'purple' : hasPermission('memory:write') ? 'blue' : 'slate')}
      <span class="live-indicator"><span class="status-dot"></span> Connected</span>
      <button type="button" class="icon-button" data-refresh title="Refresh workspace" aria-label="Refresh workspace">↻</button>
    </div>
  </header>`;
}

function renderMetric(label: string, value: string, description: string, tone: string): string {
  return `<article class="metric-card metric-${tone}">
    <span class="metric-label">${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <p>${escapeHtml(description)}</p>
  </article>`;
}

function openCandidates(): MemoryCandidate[] {
  return state.candidates.filter((candidate) => !['APPROVED', 'REJECTED'].includes(candidate.status));
}

function renderOverview(): string {
  const active = state.memories.filter((memory) => memory.status === 'ACTIVE');
  const sourceBacked = active.filter(
    (memory) => Boolean(memory.sourceArtifactId) || collectSourceLinks(memory.metadata).length > 0,
  );
  const averageConfidence =
    active.length === 0
      ? 0
      : active.reduce((sum, memory) => sum + Number(memory.confidence || 0), 0) / active.length;
  const recent = [...active]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 5);
  const typeCounts = new Map<string, number>();
  for (const memory of active) typeCounts.set(memory.memoryType, (typeCounts.get(memory.memoryType) ?? 0) + 1);
  const topTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return `<section class="page-content overview-page">
    ${noticeMarkup()}
    <div class="hero-panel">
      <div>
        <span class="eyebrow">Organizational intelligence</span>
        <h2>Build on what your organization has already learned.</h2>
        <p>MemoryOS preserves approved knowledge, decisions, context, outcomes, and lessons so every future person and AI can work from a stronger foundation.</p>
      </div>
      <button type="button" class="button button-primary" data-view="ask">Ask MemoryOS</button>
    </div>
    <div class="metric-grid">
      ${renderMetric('Active intelligence', String(active.length), 'Current authorized records in this scope.', 'blue')}
      ${renderMetric('Source-backed', String(sourceBacked.length), 'Records connected to original evidence.', 'green')}
      ${renderMetric('Average confidence', formatPercent(averageConfidence), 'Visible confidence across active intelligence.', 'purple')}
      ${renderMetric('Needs attention', String(openCandidates().length), 'Exceptions waiting for human review.', 'amber')}
    </div>
    <div class="two-column-grid">
      <article class="panel">
        <div class="panel-heading"><div><span class="eyebrow">Recent</span><h3>Latest organizational intelligence</h3></div><button class="text-button" data-view="knowledge">View all</button></div>
        <div class="compact-list">
          ${recent.length > 0 ? recent.map(renderCompactMemory).join('') : emptyState('No active intelligence yet', 'Connect an authorized source or add the first trusted record.')}
        </div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><span class="eyebrow">Foundation</span><h3>What the organization is retaining</h3></div></div>
        <div class="distribution-list">
          ${topTypes.length > 0 ? topTypes.map(([type, count]) => `<div><span>${badge(humanize(type), typeTone(type))}</span><strong>${count}</strong></div>`).join('') : emptyState('No categories yet', 'Memory types will appear as knowledge is preserved.')}
        </div>
      </article>
    </div>
    <article class="panel pipeline-panel">
      <div class="panel-heading"><div><span class="eyebrow">How it works</span><h3>Complex underneath. Simple for the team.</h3></div></div>
      <div class="pipeline">
        <div><span>1</span><strong>Preserve</strong><p>Authorized files, messages, meetings, and system records retain provenance.</p></div>
        <div><span>2</span><strong>Understand</strong><p>MemoryOS extracts knowledge, reconstructs projects, and identifies conflicts.</p></div>
        <div><span>3</span><strong>Govern</strong><p>Policies promote routine intelligence and send exceptions for review.</p></div>
        <div><span>4</span><strong>Improve</strong><p>People and AI reuse trusted decisions, outcomes, and lessons.</p></div>
      </div>
    </article>
  </section>`;
}

function renderCompactMemory(memory: MemoryRecord): string {
  return `<button type="button" class="compact-memory" data-memory-id="${escapeAttribute(memory.id)}">
    <span class="memory-type-dot tone-${typeTone(memory.memoryType)}"></span>
    <span><strong>${escapeHtml(memoryTitle(memory))}</strong><small>${escapeHtml(truncate(memory.content, 100))}</small></span>
    <time>${escapeHtml(formatDate(memory.updatedAt))}</time>
  </button>`;
}

function renderAsk(): string {
  const suggestions = [
    'What important decisions should the team know?',
    'What did we learn from previous projects?',
    'What risks or unresolved conflicts exist?',
  ];
  return `<section class="page-content ask-page">
    ${noticeMarkup()}
    <div class="ask-intro">
      <span class="eyebrow">Grounded organizational answers</span>
      <h2>Ask what the organization knows.</h2>
      <p>Results remain linked to the original intelligence and supporting evidence.</p>
    </div>
    <form id="ask-form" class="ask-box">
      <textarea id="ask-query" name="query" rows="3" required placeholder="Ask about a project, decision, policy, outcome, or lesson…">${escapeHtml(state.lastQuestion)}</textarea>
      <div class="ask-actions">
        <span>Searches only your authorized scope</span>
        <button class="button button-primary" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Searching…' : 'Ask MemoryOS'}</button>
      </div>
    </form>
    <div class="suggestion-row">${suggestions.map((question) => `<button type="button" class="suggestion-chip" data-question="${escapeAttribute(question)}">${escapeHtml(question)}</button>`).join('')}</div>
    ${renderSearchResults()}
  </section>`;
}

function renderSearchResults(): string {
  if (!state.lastQuestion) return `<div class="ask-empty"><div class="ask-orb">M</div><p>MemoryOS will return the strongest matching intelligence with its confidence, reasoning, and evidence.</p></div>`;
  if (state.searchResults.length === 0 && !state.loading) return emptyState('No matching intelligence found', 'Try a broader question or review the Knowledge library.');
  if (state.searchResults.length === 0) return '<div class="loading-panel"><span class="spinner"></span> Searching organizational intelligence…</div>';

  const strongest = state.searchResults.slice(0, 3);
  return `<div class="results-section">
    <div class="grounded-summary">
      <span class="eyebrow">Grounded findings</span>
      <h3>${escapeHtml(state.lastQuestion)}</h3>
      <p>MemoryOS found ${state.searchResults.length} relevant record${state.searchResults.length === 1 ? '' : 's'}. The highest-ranked evidence is shown below without hiding uncertainty or provenance.</p>
    </div>
    <div class="result-list">${strongest.map(renderSearchResult).join('')}</div>
  </div>`;
}

function renderSearchResult(result: SearchResult, index: number): string {
  const memory = result.memory;
  const links = collectSourceLinks(memory.metadata);
  const score = Number(result.explanation?.finalScore ?? 0);
  const reasons = Array.isArray(result.explanation?.reasons) ? result.explanation.reasons : [];
  return `<article class="search-result">
    <div class="search-rank">${index + 1}</div>
    <div class="search-result-body">
      <div class="memory-card-meta">
        ${badge(humanize(memory.memoryType), typeTone(memory.memoryType))}
        ${badge(humanize(memory.status), statusTone(memory.status))}
        ${icareStage(memory) ? badge(`ICARE³ · ${humanize(icareStage(memory))}`, 'slate') : ''}
      </div>
      <h4>${escapeHtml(memoryTitle(memory))}</h4>
      <p class="memory-content">${escapeHtml(memory.content)}</p>
      <div class="result-explanation">
        <strong>${formatPercent(score)} relevance</strong>
        <span>${escapeHtml(reasons.slice(0, 2).join(' · ') || 'Ranked by scope, content, confidence, and recency.')}</span>
      </div>
      ${sourceLinksMarkup(links)}
      <button type="button" class="text-button" data-memory-id="${escapeAttribute(memory.id)}">View intelligence and history</button>
    </div>
  </article>`;
}

function filteredMemories(): MemoryRecord[] {
  const query = state.knowledgeQuery.trim().toLowerCase();
  return state.memories
    .filter((memory) => state.knowledgeType === 'ALL' || memory.memoryType === state.knowledgeType)
    .filter((memory) => {
      if (!query) return true;
      return [memoryTitle(memory), memory.content, memory.memoryType, icareStage(memory) ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function renderKnowledge(): string {
  const types = [...new Set(state.memories.map((memory) => memory.memoryType))].sort();
  const results = filteredMemories();
  return `<section class="page-content knowledge-page">
    ${noticeMarkup()}
    <div class="page-heading-row">
      <div><span class="eyebrow">Unified intelligence library</span><h2>Knowledge</h2><p>Raw evidence, extracted knowledge, decisions, outcomes, and lessons remain searchable in one place.</p></div>
      ${hasPermission('memory:write') ? '<button type="button" class="button button-primary" data-create-memory>+ Add knowledge</button>' : ''}
    </div>
    <form id="knowledge-filter-form" class="filter-bar">
      <label class="search-field"><span>⌕</span><input name="query" value="${escapeAttribute(state.knowledgeQuery)}" placeholder="Search titles, content, projects, or stages"></label>
      <select name="type" aria-label="Memory type">
        <option value="ALL">All intelligence</option>
        ${types.map((type) => `<option value="${escapeAttribute(type)}" ${state.knowledgeType === type ? 'selected' : ''}>${escapeHtml(humanize(type))}</option>`).join('')}
      </select>
      <button class="button button-secondary" type="submit">Filter</button>
    </form>
    <div class="library-summary"><span>${results.length} record${results.length === 1 ? '' : 's'}</span><span>Scope: ${escapeHtml(state.identity?.credentialScope.scopeType ?? '')}</span></div>
    <div class="knowledge-grid">
      ${results.length > 0 ? results.map(renderMemoryCard).join('') : emptyState('No intelligence matches these filters', 'Clear the search or choose another category.')}
    </div>
  </section>`;
}

function renderMemoryCard(memory: MemoryRecord): string {
  const links = collectSourceLinks(memory.metadata);
  return `<article class="memory-card">
    <button type="button" class="memory-card-open" data-memory-id="${escapeAttribute(memory.id)}" aria-label="Open ${escapeAttribute(memoryTitle(memory))}"></button>
    <div class="memory-card-meta">
      ${badge(humanize(memory.memoryType), typeTone(memory.memoryType))}
      ${badge(humanize(memory.status), statusTone(memory.status))}
    </div>
    <h3>${escapeHtml(memoryTitle(memory))}</h3>
    <p>${escapeHtml(truncate(memory.content, 220))}</p>
    <div class="memory-card-stats">
      <span>Confidence <strong>${formatPercent(memory.confidence)}</strong></span>
      <span>${icareStage(memory) ? `ICARE³ ${escapeHtml(humanize(icareStage(memory)))}` : 'Organizational memory'}</span>
    </div>
    <footer>
      <span>${links.length > 0 || memory.sourceArtifactId ? '↗ Evidence linked' : 'Source reference pending'}</span>
      <time>${escapeHtml(formatDate(memory.updatedAt))}</time>
    </footer>
  </article>`;
}

function renderReview(): string {
  if (!hasPermission('memory:review')) {
    return `<section class="page-content review-page">${noticeMarkup()}<div class="permission-panel"><div class="permission-icon">✓</div><h2>Review is restricted</h2><p>Your current role can read organizational intelligence but cannot approve or reject proposed knowledge.</p>${badge('Read-only access', 'slate')}</div></section>`;
  }
  const candidates = state.candidates.filter((candidate) => {
    if (state.reviewFilter === 'ALL') return true;
    if (state.reviewFilter === 'OPEN') return !['APPROVED', 'REJECTED'].includes(candidate.status);
    return candidate.status === state.reviewFilter;
  });
  return `<section class="page-content review-page">
    ${noticeMarkup()}
    <div class="page-heading-row">
      <div><span class="eyebrow">Review by exception</span><h2>Review</h2><p>Routine knowledge can follow approved policy. Conflicts, sensitive items, and material proposals come here for human judgment.</p></div>
      <select id="review-filter" aria-label="Review status">
        ${['OPEN', 'PENDING', 'CONFLICT', 'DUPLICATE', 'NEAR_DUPLICATE', 'APPROVED', 'REJECTED', 'ALL'].map((value) => `<option value="${value}" ${state.reviewFilter === value ? 'selected' : ''}>${humanize(value)}</option>`).join('')}
      </select>
    </div>
    <div class="review-summary">
      ${renderMetric('Open exceptions', String(openCandidates().length), 'Items requiring a human decision.', 'amber')}
      ${renderMetric('Conflicts', String(state.candidates.filter((item) => item.status === 'CONFLICT').length), 'Potential corrections to existing intelligence.', 'red')}
      ${renderMetric('Reviewed', String(state.candidates.filter((item) => ['APPROVED', 'REJECTED'].includes(item.status)).length), 'Completed human evaluations.', 'green')}
    </div>
    <div class="review-list">
      ${candidates.length > 0 ? candidates.map(renderCandidate).join('') : emptyState('No items in this review view', 'MemoryOS will surface exceptions here when human attention is required.')}
    </div>
  </section>`;
}

function renderCandidate(candidate: MemoryCandidate): string {
  const metadata = asRecord(candidate.metadata);
  const links = collectSourceLinks(metadata);
  const open = !['APPROVED', 'REJECTED'].includes(candidate.status);
  const related = Array.isArray(candidate.relatedMemoryIds) ? candidate.relatedMemoryIds : [];
  return `<article class="review-card">
    <div class="review-card-top">
      <div class="memory-card-meta">${badge(humanize(candidate.memoryType), typeTone(candidate.memoryType))}${badge(humanize(candidate.status), statusTone(candidate.status))}</div>
      <span>Confidence <strong>${formatPercent(candidate.confidence)}</strong></span>
    </div>
    <h3>${escapeHtml(typeof metadata.title === 'string' ? metadata.title : truncate(candidate.content, 84))}</h3>
    <p>${escapeHtml(candidate.content)}</p>
    <div class="candidate-analysis">
      <span><strong>Recommendation</strong>${escapeHtml(humanize(metadata.harvestRecommendation ?? 'review'))}</span>
      <span><strong>Related intelligence</strong>${related.length}</span>
      <span><strong>Reasoning</strong>${escapeHtml(humanize(metadata.analysisStatus ?? candidate.status))}</span>
    </div>
    ${sourceLinksMarkup(links)}
    ${open ? `<div class="review-actions"><button type="button" class="button button-secondary" data-reject-candidate="${escapeAttribute(candidate.id)}">Reject</button><button type="button" class="button button-primary" data-approve-candidate="${escapeAttribute(candidate.id)}">Approve${['DUPLICATE', 'NEAR_DUPLICATE'].includes(candidate.status) ? ' merge' : ''}</button></div>` : `<div class="review-outcome">${candidate.status === 'APPROVED' ? '✓ Approved into organizational intelligence' : 'Rejected after human evaluation'}${candidate.reviewReason ? ` · ${escapeHtml(candidate.reviewReason)}` : ''}</div>`}
  </article>`;
}

function emptyState(title: string, description: string): string {
  return `<div class="empty-state"><div>◇</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
}

function selectedMemory(): MemoryRecord | null {
  return state.memories.find((memory) => memory.id === state.selectedMemoryId) ??
    state.searchResults.find((result) => result.memory.id === state.selectedMemoryId)?.memory ??
    null;
}

function renderModal(): string {
  if (state.showCreate) return renderCreateModal();
  const memory = selectedMemory();
  if (!memory) return '';
  const links = collectSourceLinks(memory.metadata);
  const metadata = asRecord(memory.metadata);
  return `<div class="modal-backdrop" data-modal-backdrop>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-label="Memory details">
      <button type="button" class="modal-close" data-close-modal aria-label="Close">×</button>
      <div class="modal-scroll">
        <div class="memory-card-meta">${badge(humanize(memory.memoryType), typeTone(memory.memoryType))}${badge(humanize(memory.status), statusTone(memory.status))}${icareStage(memory) ? badge(`ICARE³ · ${humanize(icareStage(memory))}`, 'slate') : ''}</div>
        <h2>${escapeHtml(memoryTitle(memory))}</h2>
        ${state.correctionMode ? renderCorrectionForm(memory) : `<p class="modal-content">${escapeHtml(memory.content)}</p>`}
        <div class="detail-grid">
          <div><span>Confidence</span><strong>${formatPercent(memory.confidence)}</strong></div>
          <div><span>Sensitivity</span><strong>${escapeHtml(humanize(memory.sensitivity))}</strong></div>
          <div><span>Updated</span><strong>${escapeHtml(formatDate(memory.updatedAt, true))}</strong></div>
          <div><span>Scope</span><strong>${escapeHtml(humanize(memory.scopeType))}</strong></div>
        </div>
        <section class="modal-section"><div class="panel-heading"><div><span class="eyebrow">Evidence</span><h3>Supporting sources</h3></div></div>${links.length > 0 ? sourceLinksMarkup(links) : memory.sourceArtifactId ? '<p class="muted">A preserved source artifact supports this record. A direct source link has not yet been published to this portal.</p>' : '<p class="muted">No direct source link is available for this record.</p>'}</section>
        <section class="modal-section"><div class="panel-heading"><div><span class="eyebrow">History</span><h3>Immutable revisions</h3></div>${state.revisions.length === 0 ? '<button type="button" class="text-button" data-load-revisions>Load history</button>' : ''}</div>${state.revisionsLoading ? '<div class="loading-panel"><span class="spinner"></span> Loading history…</div>' : state.revisions.length > 0 ? `<div class="revision-list">${state.revisions.map((revision) => `<div><span>Revision ${revision.revisionNumber}</span><strong>${escapeHtml(formatDate(revision.createdAt, true))}</strong><p>${escapeHtml(revision.reason ?? 'Original retained version')}</p></div>`).join('')}</div>` : '<p class="muted">Revision history is available on request.</p>'}</section>
        <details class="metadata-details"><summary>Technical provenance</summary><pre>${escapeHtml(JSON.stringify(metadata, null, 2))}</pre></details>
      </div>
      <footer class="modal-footer">
        <button type="button" class="button button-secondary" data-close-modal>Close</button>
        ${hasPermission('memory:correct') && !state.correctionMode ? '<button type="button" class="button button-primary" data-correct-memory>Correct intelligence</button>' : ''}
      </footer>
    </section>
  </div>`;
}

function renderCorrectionForm(memory: MemoryRecord): string {
  return `<form id="correction-form" class="stacked-form correction-form">
    <label><span>Corrected intelligence</span><textarea name="content" rows="8" required>${escapeHtml(memory.content)}</textarea></label>
    <label><span>Reason for correction</span><input name="reason" required maxlength="500" placeholder="Explain what changed and why"></label>
    <div class="inline-actions"><button type="button" class="button button-secondary" data-cancel-correction>Cancel</button><button class="button button-primary" type="submit">Save new revision</button></div>
  </form>`;
}

function renderCreateModal(): string {
  return `<div class="modal-backdrop" data-modal-backdrop>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-label="Add organizational knowledge">
      <button type="button" class="modal-close" data-close-modal aria-label="Close">×</button>
      <div class="modal-scroll">
        <span class="eyebrow">Authorized contribution</span><h2>Add organizational knowledge</h2><p class="muted">Create a source-aware working record within your current authorized scope.</p>
        <form id="create-memory-form" class="stacked-form">
          <label><span>Title</span><input name="title" required maxlength="200" placeholder="Clear, specific title"></label>
          <div class="form-grid">
            <label><span>Type</span><select name="memoryType"><option>FACT</option><option>DECISION</option><option>GOAL</option><option>CONSTRAINT</option><option>TASK</option><option>CHECKPOINT</option><option>SUMMARY</option><option>ACTION_RESULT</option></select></label>
            <label><span>ICARE³ stage</span><select name="icareStage"><option value="">Not assigned</option><option value="ISSUE">Issue</option><option value="CONTEXT">Context</option><option value="ANALYSIS">Analysis</option><option value="RECOMMENDATIONS">Recommendations</option><option value="RECOMMENDATION_EVALUATION">Human evaluation</option><option value="EXECUTION">Execution</option><option value="EXECUTION_EVALUATION">Outcome evaluation</option></select></label>
          </div>
          <label><span>Knowledge</span><textarea name="content" rows="8" required placeholder="Preserve the relevant fact, decision, outcome, or lesson."></textarea></label>
          <div class="form-grid"><label><span>Confidence</span><input name="confidence" type="number" min="0" max="1" step="0.05" value="0.8"></label><label><span>Sensitivity</span><select name="sensitivity"><option value="STANDARD">Standard</option><option value="SENSITIVE">Sensitive</option><option value="RESTRICTED">Restricted</option></select></label></div>
          <div class="inline-actions"><button type="button" class="button button-secondary" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Add knowledge</button></div>
        </form>
      </div>
    </section>
  </div>`;
}

function renderShell(): string {
  const viewMarkup =
    state.view === 'overview'
      ? renderOverview()
      : state.view === 'ask'
        ? renderAsk()
        : state.view === 'knowledge'
          ? renderKnowledge()
          : renderReview();
  return `<div class="app-shell">${renderSidebar()}<main class="main-shell">${renderTopbar()}${viewMarkup}</main>${renderModal()}</div>`;
}

function serviceStateLabel(value: PublicHealth['api']): string {
  if (value === 'operational') return 'Operational';
  if (value === 'degraded') return 'Degraded performance';
  if (value === 'unavailable') return 'Unavailable';
  if (value === 'not-configured') return 'Not configured';
  return 'Checking';
}

function serviceStateTone(value: PublicHealth['api']): string {
  if (value === 'operational') return 'green';
  if (value === 'degraded') return 'amber';
  if (value === 'unavailable') return 'red';
  return 'slate';
}

function renderStatusPage(): string {
  const health = state.publicHealth;
  const overall = health.api === 'operational' && health.readiness === 'operational' ? 'operational' : health.api === 'checking' || health.readiness === 'checking' ? 'checking' : health.api === 'not-configured' ? 'not-configured' : 'degraded';
  return `<main class="status-page">
    <header class="status-header"><div class="brand-lockup"><div class="brand-mark">M</div><div><strong>MemoryOS</strong><span>Service status</span></div></div><a class="button button-secondary" href="/">Open MemoryOS</a></header>
    <section class="status-container">
      <div class="status-hero"><span class="eyebrow">Live public health</span><h1>${overall === 'operational' ? 'All monitored MemoryOS services are operational.' : overall === 'checking' ? 'Checking MemoryOS services…' : overall === 'not-configured' ? 'Public monitoring is not configured.' : 'Some MemoryOS services need attention.'}</h1><p>This page performs independent public checks without exposing customer names, tenant identifiers, credentials, or private diagnostics.</p></div>
      <div class="overall-status tone-${serviceStateTone(overall as PublicHealth['api'])}"><span class="large-status-dot"></span><strong>${serviceStateLabel(overall as PublicHealth['api'])}</strong><span>${health.checkedAt ? `Last checked ${escapeHtml(formatDate(health.checkedAt, true))}` : 'Awaiting first check'}</span></div>
      <div class="status-components">
        ${statusComponent('Customer portal', health.portal, 'Public MemoryOS workspace and status interface.')}
        ${statusComponent('Memory API', health.api, 'Authenticated organizational-memory service.')}
        ${statusComponent('Database and readiness', health.readiness, 'Core storage connectivity and service readiness.')}
      </div>
      ${health.message ? `<div class="notice notice-info"><span>i</span><p>${escapeHtml(health.message)}</p></div>` : ''}
      <div class="status-note"><h2>Customer-specific health</h2><p>Authorized administrators receive private organization diagnostics for connectors, synchronization, indexing, permissions, and failed jobs inside the product. Those details never appear on this public page.</p></div>
      <button type="button" class="button button-primary" data-status-refresh>Refresh status</button>
    </section>
    <footer class="status-footer">MemoryOS by QuestorOS · Intelligence belongs to those who create it.</footer>
  </main>`;
}

function statusComponent(name: string, status: PublicHealth['api'], description: string): string {
  return `<article><div><span class="component-dot tone-${serviceStateTone(status)}"></span><div><strong>${escapeHtml(name)}</strong><p>${escapeHtml(description)}</p></div></div>${badge(serviceStateLabel(status), serviceStateTone(status))}</article>`;
}

async function refreshPublicStatus(): Promise<void> {
  state.publicHealth = { portal: 'operational', api: 'checking', readiness: 'checking', checkedAt: null };
  render();
  if (!configuredEndpoint) {
    state.publicHealth = {
      portal: 'operational',
      api: 'not-configured',
      readiness: 'not-configured',
      checkedAt: new Date().toISOString(),
      message: 'Set MEMORYOS_PUBLIC_API_BASE_URL during portal deployment to enable live public health checks.',
    };
    render();
    return;
  }
  try {
    const statusClient = new MemoryApiClient(configuredEndpoint, '');
    const apiOperational = await statusClient.health();
    let ready = false;
    try {
      ready = await statusClient.ready();
    } catch {
      ready = false;
    }
    state.publicHealth = {
      portal: 'operational',
      api: apiOperational ? 'operational' : 'degraded',
      readiness: ready ? 'operational' : 'degraded',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    state.publicHealth = {
      portal: 'operational',
      api: 'unavailable',
      readiness: 'unavailable',
      checkedAt: new Date().toISOString(),
      message: describeError(error),
    };
  }
  render();
}

function render(): void {
  root.innerHTML = statusRoute ? renderStatusPage() : state.connected ? renderShell() : renderConnect();
  bindEvents();
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((element) => {
    element.addEventListener('click', () => {
      const next = element.dataset.view as PortalView | undefined;
      if (!next) return;
      state.view = next;
      state.selectedMemoryId = null;
      state.showCreate = false;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-dismiss-notice]').forEach((element) => {
    element.addEventListener('click', () => {
      clearNotice();
      render();
    });
  });

  document.querySelector<HTMLFormElement>('#connect-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void connect(String(form.get('endpoint') ?? ''), String(form.get('apiKey') ?? ''));
  });

  document.querySelector<HTMLElement>('[data-signout]')?.addEventListener('click', signOut);
  document.querySelectorAll<HTMLElement>('[data-refresh]').forEach((element) => element.addEventListener('click', () => void refreshWorkspace()));

  document.querySelector<HTMLFormElement>('#ask-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void askMemory(String(form.get('query') ?? ''));
  });
  document.querySelectorAll<HTMLElement>('[data-question]').forEach((element) => {
    element.addEventListener('click', () => void askMemory(element.dataset.question ?? ''));
  });

  document.querySelector<HTMLFormElement>('#knowledge-filter-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.knowledgeQuery = String(form.get('query') ?? '');
    state.knowledgeType = String(form.get('type') ?? 'ALL');
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-memory-id]').forEach((element) => {
    element.addEventListener('click', () => {
      state.selectedMemoryId = element.dataset.memoryId ?? null;
      state.revisions = [];
      state.correctionMode = false;
      render();
    });
  });

  document.querySelector<HTMLElement>('[data-create-memory]')?.addEventListener('click', () => {
    state.showCreate = true;
    render();
  });
  document.querySelectorAll<HTMLElement>('[data-close-modal]').forEach((element) => element.addEventListener('click', closeModal));
  document.querySelector<HTMLElement>('[data-modal-backdrop]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });

  document.querySelector<HTMLElement>('[data-load-revisions]')?.addEventListener('click', () => void loadRevisions());
  document.querySelector<HTMLElement>('[data-correct-memory]')?.addEventListener('click', () => {
    state.correctionMode = true;
    render();
  });
  document.querySelector<HTMLElement>('[data-cancel-correction]')?.addEventListener('click', () => {
    state.correctionMode = false;
    render();
  });
  document.querySelector<HTMLFormElement>('#correction-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitCorrection(new FormData(event.currentTarget));
  });
  document.querySelector<HTMLFormElement>('#create-memory-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitCreateMemory(new FormData(event.currentTarget));
  });

  document.querySelector<HTMLSelectElement>('#review-filter')?.addEventListener('change', (event) => {
    state.reviewFilter = event.currentTarget.value;
    render();
  });
  document.querySelectorAll<HTMLElement>('[data-approve-candidate]').forEach((element) => {
    element.addEventListener('click', () => void approveCandidate(element.dataset.approveCandidate ?? ''));
  });
  document.querySelectorAll<HTMLElement>('[data-reject-candidate]').forEach((element) => {
    element.addEventListener('click', () => void rejectCandidate(element.dataset.rejectCandidate ?? ''));
  });
  document.querySelector<HTMLElement>('[data-status-refresh]')?.addEventListener('click', () => void refreshPublicStatus());
}

function closeModal(): void {
  state.selectedMemoryId = null;
  state.showCreate = false;
  state.correctionMode = false;
  state.revisions = [];
  render();
}

async function askMemory(question: string): Promise<void> {
  if (!client || !state.identity || !question.trim()) return;
  state.lastQuestion = question.trim();
  state.searchResults = [];
  state.loading = true;
  clearNotice();
  render();
  try {
    state.searchResults = await client.searchMemories({ ...scopePayload(), queryText: state.lastQuestion, limit: 12 });
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function loadRevisions(): Promise<void> {
  if (!client || !state.selectedMemoryId) return;
  state.revisionsLoading = true;
  render();
  try {
    state.revisions = await client.getRevisions(state.selectedMemoryId);
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.revisionsLoading = false;
    render();
  }
}

async function submitCorrection(form: FormData): Promise<void> {
  if (!client || !state.selectedMemoryId) return;
  state.loading = true;
  render();
  try {
    await client.correctMemory(state.selectedMemoryId, {
      content: String(form.get('content') ?? ''),
      reason: String(form.get('reason') ?? ''),
    });
    await loadWorkspace();
    state.correctionMode = false;
    state.revisions = await client.getRevisions(state.selectedMemoryId);
    setNotice('success', 'The correction was saved as a new immutable revision.');
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function submitCreateMemory(form: FormData): Promise<void> {
  if (!client) return;
  state.loading = true;
  render();
  try {
    const icare = String(form.get('icareStage') ?? '');
    await client.createMemory({
      ...scopePayload(),
      title: String(form.get('title') ?? ''),
      memoryType: String(form.get('memoryType') ?? 'FACT'),
      content: String(form.get('content') ?? ''),
      confidence: Number(form.get('confidence') ?? 0.8),
      sensitivity: String(form.get('sensitivity') ?? 'STANDARD'),
      ...(icare ? { icareStage: icare } : {}),
      metadata: { createdFrom: 'memoryos-client-portal' },
    });
    await loadWorkspace();
    state.showCreate = false;
    setNotice('success', 'Organizational knowledge was added to the authorized scope.');
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function approveCandidate(candidateId: string): Promise<void> {
  if (!client || !candidateId) return;
  const candidate = state.candidates.find((item) => item.id === candidateId);
  if (!candidate) return;
  const reason = window.prompt('Record the reason for approval:', 'Reviewed and approved for organizational use.');
  if (reason === null || !reason.trim()) return;
  const body: Record<string, unknown> = { reason: reason.trim() };
  if (['DUPLICATE', 'NEAR_DUPLICATE'].includes(candidate.status)) {
    const mergeTarget = candidate.relatedMemoryIds?.[0];
    if (!mergeTarget) {
      setNotice('error', 'This duplicate requires an explicit related memory before it can be merged.');
      render();
      return;
    }
    body.mergeIntoMemoryId = mergeTarget;
  }
  state.loading = true;
  render();
  try {
    await client.approveCandidate(candidateId, body);
    await loadWorkspace();
    setNotice('success', 'The proposal was approved and the audit history was preserved.');
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function rejectCandidate(candidateId: string): Promise<void> {
  if (!client || !candidateId) return;
  const reason = window.prompt('Record the reason for rejection:');
  if (reason === null || !reason.trim()) return;
  state.loading = true;
  render();
  try {
    await client.rejectCandidate(candidateId, reason.trim());
    await loadWorkspace();
    setNotice('success', 'The proposal was rejected and retained in the audit history.');
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

render();
if (statusRoute) {
  void refreshPublicStatus();
} else if (state.endpoint && state.apiKey) {
  void connect(state.endpoint, state.apiKey);
}

export {};
