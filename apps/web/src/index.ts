import { MemoryApiClient, MemoryApiError, normalizeEndpoint } from './api.js';
import {
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
  PortalAuthSession,
  PortalSignupResult,
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

type AuthMode = 'login' | 'signup';
type AuthState = 'checking' | 'anonymous' | 'verification-sent' | 'authenticated';

interface AppState {
  authState: AuthState;
  authMode: AuthMode;
  session: PortalAuthSession | null;
  verification: PortalSignupResult | null;
  view: PortalView;
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
  notice: { tone: 'success' | 'error' | 'info'; message: string } | null;
  publicHealth: PublicHealth;
}

const rootElement = document.querySelector<HTMLElement>('#app');
if (!rootElement) throw new Error('MemoryOS portal root was not found.');
const root: HTMLElement = rootElement;

const runtimeConfig = window.__MEMORYOS_CONFIG__ ?? {};
const configuredEndpoint = runtimeConfig.apiBaseUrl?.trim() ?? '';
const statusRoute =
  window.location.pathname.replace(/\/+$/, '') === '/status' || window.location.hash === '#status';

let client: MemoryApiClient | null = null;
try {
  if (configuredEndpoint) client = new MemoryApiClient(normalizeEndpoint(configuredEndpoint));
} catch {
  client = null;
}

const state: AppState = {
  authState: 'checking',
  authMode: 'login',
  session: null,
  verification: null,
  view: 'home',
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
  notice: null,
  publicHealth: {
    portal: 'operational',
    api: configuredEndpoint ? 'checking' : 'not-configured',
    readiness: configuredEndpoint ? 'checking' : 'not-configured',
    checkedAt: null,
  },
};

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

function emptyState(title: string, message: string, action?: string): string {
  return `<div class="empty-state"><div class="empty-icon">M</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${action ?? ''}</div>`;
}

function hasPermission(permission: string): boolean {
  const permissions = state.identity?.permissions ?? [];
  return permissions.includes('memory:admin') || permissions.includes(permission);
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

function openCandidates(): MemoryCandidate[] {
  return state.candidates.filter((candidate) => !['APPROVED', 'REJECTED'].includes(candidate.status));
}

function activeMemories(): MemoryRecord[] {
  return state.memories.filter((memory) => memory.status === 'ACTIVE' && !memory.deletedAt);
}

function trustLabel(memory: MemoryRecord): string {
  if (memory.status === 'ACTIVE' && Number(memory.confidence) >= 0.9) return 'Verified';
  if (memory.status === 'SUPERSEDED') return 'Outdated';
  if (memory.status === 'CONFLICT') return 'Conflicting information';
  if (!memory.sourceArtifactId && collectSourceLinks(memory.metadata).length === 0) {
    return 'Working knowledge';
  }
  return 'Working knowledge';
}

function projectName(memory: MemoryRecord): string {
  const metadata = memory.metadata ?? {};
  const label =
    typeof metadata.projectName === 'string'
      ? metadata.projectName
      : typeof metadata.project === 'string'
        ? metadata.project
        : null;
  return label?.trim() || (memory.projectId ? `Project ${memory.projectId.slice(0, 8)}` : 'Organization-wide');
}

function projectGroups(): Array<{ name: string; memories: MemoryRecord[] }> {
  const groups = new Map<string, MemoryRecord[]>();
  for (const memory of activeMemories()) {
    const name = projectName(memory);
    const values = groups.get(name) ?? [];
    values.push(memory);
    groups.set(name, values);
  }
  return [...groups.entries()]
    .map(([name, memories]) => ({ name, memories }))
    .sort((left, right) => right.memories.length - left.memories.length);
}

function renderServiceUnavailable(): string {
  return `<main class="connect-page">
    <section class="connect-card">
      <div class="brand-lockup brand-lockup-large"><div class="brand-mark">M</div><div><strong>MemoryOS</strong><span>Standalone organizational intelligence</span></div></div>
      <div class="connect-copy"><h1>MemoryOS is not configured.</h1><p>The standalone portal requires its own approved MemoryOS API endpoint. No company user should enter an endpoint or API key.</p></div>
      <a class="button button-secondary button-large" href="/status">View service status</a>
    </section>
  </main>`;
}

function renderAuth(): string {
  if (!client) return renderServiceUnavailable();
  if (state.authState === 'checking') {
    return `<main class="connect-page"><section class="connect-card"><div class="brand-lockup brand-lockup-large"><div class="brand-mark">M</div><div><strong>MemoryOS</strong><span>Standalone organizational intelligence</span></div></div><div class="loading-panel"><span class="spinner"></span> Opening secure MemoryOS…</div></section></main>`;
  }
  if (state.authState === 'verification-sent') {
    return `<main class="connect-page">
      <a class="status-link status-link-floating" href="/status" target="_blank" rel="noopener">Service status</a>
      <section class="connect-card">
        <div class="brand-lockup brand-lockup-large"><div class="brand-mark">M</div><div><strong>MemoryOS</strong><span>Standalone organizational intelligence</span></div></div>
        ${noticeMarkup()}
        <div class="connect-copy">${badge('Email verification required', 'green')}<h1>Check your email to open MemoryOS.</h1><p>Use the MemoryOS-branded verification link to activate this separate account and enter your organization workspace.</p></div>
        ${state.verification?.developmentVerificationUrl ? `<a class="button button-primary button-large" href="${escapeAttribute(state.verification.developmentVerificationUrl)}">Open local verification link</a>` : ''}
        <button type="button" class="button button-secondary button-large" data-auth-mode="login">Return to sign in</button>
        <div class="trust-strip"><span>Separate MemoryOS identity</span><span>Private organization workspace</span><span>No API key required</span></div>
      </section>
      <p class="connect-footer">Intelligence belongs to those who create it.</p>
    </main>`;
  }

  const login = state.authMode === 'login';
  return `<main class="connect-page">
    <a class="status-link status-link-floating" href="/status" target="_blank" rel="noopener">Service status</a>
    <section class="connect-card">
      <div class="brand-lockup brand-lockup-large"><div class="brand-mark">M</div><div><strong>MemoryOS</strong><span>Standalone organizational intelligence</span></div></div>
      <div class="connect-copy">
        ${badge('Standalone MemoryOS', 'green')}
        <h1>${login ? 'Welcome back to your organization’s intelligence.' : 'Create your private MemoryOS organization.'}</h1>
        <p>${login ? 'Sign in with your separate MemoryOS account. This does not sign you into QuestorOS.' : 'Start with a distinct MemoryOS identity, verify your email, and enter a focused organizational-intelligence workspace.'}</p>
      </div>
      ${noticeMarkup()}
      <div class="auth-switch" role="tablist" aria-label="MemoryOS authentication">
        <button type="button" class="${login ? 'active' : ''}" data-auth-mode="login">Sign in</button>
        <button type="button" class="${!login ? 'active' : ''}" data-auth-mode="signup">Create account</button>
      </div>
      ${login ? renderLoginForm() : renderSignupForm()}
      <div class="trust-strip"><span>Separate from QuestorOS</span><span>Secure HttpOnly session</span><span>Organization-scoped access</span><span>No API key required</span></div>
    </section>
    <p class="connect-footer">Intelligence belongs to those who create it.</p>
  </main>`;
}

function renderLoginForm(): string {
  return `<form id="login-form" class="connect-form">
    <label><span>Email address</span><input name="email" type="email" required autocomplete="email" placeholder="you@company.com"></label>
    <label><span>Password</span><input name="password" type="password" required autocomplete="current-password" placeholder="Your MemoryOS password"></label>
    <button class="button button-primary button-large" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? '<span class="spinner"></span> Signing in…' : 'Sign in to MemoryOS'}</button>
    <p class="auth-help">Forgot-password and enterprise SSO routes are part of the standalone identity release and will remain separate from QuestorOS authentication.</p>
  </form>`;
}

function renderSignupForm(): string {
  return `<form id="signup-form" class="connect-form">
    <label><span>Your name</span><input name="displayName" type="text" required autocomplete="name" minlength="2" maxlength="100" placeholder="Full name"></label>
    <label><span>Work email</span><input name="email" type="email" required autocomplete="email" placeholder="you@company.com"></label>
    <label><span>Organization name</span><input name="organizationName" type="text" required autocomplete="organization" minlength="2" maxlength="120" placeholder="Your company or organization"></label>
    <label><span>Create password</span><input name="password" type="password" required autocomplete="new-password" minlength="12" maxlength="128" placeholder="12+ characters with upper, lower, and number"><small>This password belongs only to standalone MemoryOS.</small></label>
    <button class="button button-primary button-large" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? '<span class="spinner"></span> Creating account…' : 'Create MemoryOS account'}</button>
  </form>`;
}

function renderSidebar(): string {
  const items: Array<{ view: PortalView; label: string; icon: string }> = [
    { view: 'home', label: 'Home', icon: '⌂' },
    { view: 'ask', label: 'Ask', icon: '⌕' },
    { view: 'knowledge', label: 'Knowledge', icon: '▦' },
    { view: 'projects', label: 'Projects', icon: '▱' },
    { view: 'attention', label: 'Attention Required', icon: '!' },
  ];
  return `<aside class="sidebar">
    <div class="brand-lockup"><div class="brand-mark">M</div><div><strong>MemoryOS</strong><span>Standalone</span></div></div>
    <nav class="sidebar-nav" aria-label="MemoryOS">
      ${items
        .map(
          (item) => `<button type="button" class="nav-item ${state.view === item.view ? 'active' : ''}" data-view="${item.view}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span>${item.view === 'attention' && openCandidates().length > 0 ? `<em>${openCandidates().length}</em>` : ''}</button>`,
        )
        .join('')}
    </nav>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-card"><span class="eyebrow">Organization</span><strong>${escapeHtml(state.session?.organization.tenantName ?? 'MemoryOS')}</strong><span>${escapeHtml(humanize(state.session?.organization.role ?? 'READER'))}</span></div>
    <a class="sidebar-status" href="/status" target="_blank" rel="noopener"><span class="status-dot"></span> Public service status</a>
    <button type="button" class="signout-button" data-signout>Sign out of MemoryOS</button>
  </aside>`;
}

function renderTopbar(): string {
  return `<header class="topbar"><div><span class="eyebrow">${escapeHtml(state.session?.organization.workspaceName ?? 'Organization workspace')}</span><h1>${escapeHtml(state.view === 'attention' ? 'Attention Required' : humanize(state.view))}</h1></div><div class="topbar-actions">${badge(humanize(state.session?.organization.role ?? 'READER'), 'purple')}<span class="live-indicator"><span class="status-dot"></span> Secure session</span><button type="button" class="icon-button" data-refresh title="Refresh workspace" aria-label="Refresh workspace">↻</button></div></header>`;
}

function renderWorkspace(): string {
  return `<div class="app-shell">${renderSidebar()}<div class="workspace-shell">${renderTopbar()}${renderView()}</div>${renderMemoryModal()}${renderCreateModal()}</div>`;
}

function renderView(): string {
  if (state.view === 'ask') return renderAsk();
  if (state.view === 'knowledge') return renderKnowledge();
  if (state.view === 'projects') return renderProjects();
  if (state.view === 'attention') return renderAttention();
  return renderHome();
}

function renderMetric(label: string, value: string, description: string, tone: string): string {
  return `<article class="metric-card metric-${tone}"><span class="metric-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(description)}</p></article>`;
}

function renderAskBox(compact = false): string {
  return `<form id="ask-form" class="ask-box ${compact ? 'ask-box-compact' : ''}"><textarea id="ask-query" name="query" rows="${compact ? '2' : '3'}" required placeholder="Ask about a project, decision, policy, commitment, outcome, or lesson…">${escapeHtml(state.lastQuestion)}</textarea><div class="ask-actions"><span>Answers only from your authorized organizational intelligence</span><button class="button button-primary" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Searching…' : 'Ask MemoryOS'}</button></div></form>`;
}

function renderHome(): string {
  const active = activeMemories();
  const sourceBacked = active.filter(
    (memory) => Boolean(memory.sourceArtifactId) || collectSourceLinks(memory.metadata).length > 0,
  );
  const recent = [...active]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 5);
  const projects = projectGroups();
  return `<section class="page-content overview-page">
    ${noticeMarkup()}
    <div class="hero-panel"><div><span class="eyebrow">Ask MemoryOS</span><h2>What would you like to know about your organization?</h2><p>Find decisions, context, commitments, outcomes, and reusable lessons with the evidence and trust state kept visible.</p></div></div>
    ${renderAskBox(true)}
    <div class="metric-grid">
      ${renderMetric('Verified and working knowledge', String(active.length), 'Current intelligence in your authorized workspace.', 'blue')}
      ${renderMetric('Evidence linked', String(sourceBacked.length), 'Knowledge connected to original sources.', 'green')}
      ${renderMetric('Active projects', String(projects.length), 'Organizational stories reconstructed from evidence.', 'purple')}
      ${renderMetric('Attention required', String(openCandidates().length), 'Business questions waiting for human judgment.', 'amber')}
    </div>
    <div class="two-column-grid">
      <article class="panel"><div class="panel-heading"><div><span class="eyebrow">What changed</span><h3>Recent organizational intelligence</h3></div><button class="text-button" data-view="knowledge">View all</button></div><div class="compact-list">${recent.length ? recent.map(renderCompactMemory).join('') : emptyState('No knowledge yet', 'Add an approved source or create the first organizational record.', hasPermission('memory:write') ? '<button class="button button-primary" data-create-memory>Add knowledge</button>' : '')}</div></article>
      <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Projects</span><h3>Reconstructed organizational stories</h3></div><button class="text-button" data-view="projects">View projects</button></div><div class="compact-list">${projects.length ? projects.slice(0, 5).map((project) => `<button class="compact-memory" data-project-name="${escapeAttribute(project.name)}"><span class="memory-type-dot tone-purple"></span><span><strong>${escapeHtml(project.name)}</strong><small>${project.memories.length} connected intelligence record${project.memories.length === 1 ? '' : 's'}</small></span><time>›</time></button>`).join('') : emptyState('No projects reconstructed yet', 'Connect or add project evidence so MemoryOS can reveal the objective, decisions, actions, outcomes, and lessons.')}</div></article>
    </div>
    <article class="panel pipeline-panel"><div class="panel-heading"><div><span class="eyebrow">How it helps</span><h3>A trusted organizational advisor, not a database.</h3></div></div><div class="pipeline"><div><span>1</span><strong>Ask</strong><p>Start with a real organizational question.</p></div><div><span>2</span><strong>Verify</strong><p>Open the supporting evidence and trust state.</p></div><div><span>3</span><strong>Improve</strong><p>Correct outdated information without erasing history.</p></div><div><span>4</span><strong>Reuse</strong><p>Carry decisions and lessons into the next project.</p></div></div></article>
  </section>`;
}

function renderCompactMemory(memory: MemoryRecord): string {
  return `<button type="button" class="compact-memory" data-memory-id="${escapeAttribute(memory.id)}"><span class="memory-type-dot tone-${typeTone(memory.memoryType)}"></span><span><strong>${escapeHtml(memoryTitle(memory))}</strong><small>${escapeHtml(truncate(memory.content, 100))}</small></span><time>${escapeHtml(formatDate(memory.updatedAt))}</time></button>`;
}

function renderAsk(): string {
  const suggestions = [
    'What decisions were made on this project?',
    'What commitments are still outstanding?',
    'What changed recently?',
    'What lessons should we reuse?',
    'Which sources disagree?',
    'Where did this information come from?',
  ];
  return `<section class="page-content ask-page">${noticeMarkup()}<div class="ask-intro"><span class="eyebrow">Grounded organizational answers</span><h2>What would you like to know about your organization?</h2><p>MemoryOS answers from authorized intelligence and keeps the reasons, evidence, confidence, and uncertainty visible.</p></div>${renderAskBox()}<div class="suggestion-row">${suggestions.map((question) => `<button type="button" class="suggestion-chip" data-question="${escapeAttribute(question)}">${escapeHtml(question)}</button>`).join('')}</div>${renderSearchResults()}</section>`;
}

function renderSearchResults(): string {
  if (!state.lastQuestion) return `<div class="ask-empty"><div class="ask-orb">M</div><p>Ask about a project, decision, policy, commitment, outcome, or lesson.</p></div>`;
  if (state.searchResults.length === 0 && !state.loading) return emptyState('MemoryOS found a knowledge gap', 'It did not fill the answer with unsupported information. Try a broader question or add an authorized source.');
  if (state.searchResults.length === 0) return '<div class="loading-panel"><span class="spinner"></span> Searching organizational intelligence…</div>';
  return `<div class="results-section"><div class="grounded-summary"><span class="eyebrow">Grounded findings</span><h3>${escapeHtml(state.lastQuestion)}</h3><p>MemoryOS found ${state.searchResults.length} relevant record${state.searchResults.length === 1 ? '' : 's'}. Open any result to inspect the evidence and preserved history.</p></div><div class="result-list">${state.searchResults.slice(0, 6).map(renderSearchResult).join('')}</div></div>`;
}

function renderSearchResult(result: SearchResult, index: number): string {
  const memory = result.memory;
  const links = collectSourceLinks(memory.metadata);
  const score = Number(result.explanation?.finalScore ?? 0);
  const reasons = Array.isArray(result.explanation?.reasons) ? result.explanation.reasons : [];
  return `<article class="search-result"><div class="search-rank">${index + 1}</div><div class="search-result-body"><div class="memory-card-meta">${badge(humanize(memory.memoryType), typeTone(memory.memoryType))}${badge(trustLabel(memory), statusTone(memory.status))}${icareStage(memory) ? badge(`ICARE³ · ${humanize(icareStage(memory))}`, 'slate') : ''}</div><h4>${escapeHtml(memoryTitle(memory))}</h4><p class="memory-content">${escapeHtml(memory.content)}</p><div class="result-explanation"><strong>${formatPercent(score)} relevance</strong><span>${escapeHtml(reasons.slice(0, 2).join(' · ') || 'Ranked by authorized scope, content, confidence, and recency.')}</span></div>${sourceLinksMarkup(links)}<button type="button" class="text-button" data-memory-id="${escapeAttribute(memory.id)}">View evidence and history</button></div></article>`;
}

function filteredMemories(): MemoryRecord[] {
  const query = state.knowledgeQuery.trim().toLowerCase();
  return activeMemories()
    .filter((memory) => !query || [memoryTitle(memory), memory.content, memory.memoryType, projectName(memory)].join(' ').toLowerCase().includes(query))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function renderKnowledge(): string {
  const results = filteredMemories();
  return `<section class="page-content knowledge-page">${noticeMarkup()}<div class="page-heading-row"><div><span class="eyebrow">Organizational knowledge</span><h2>What the organization knows</h2><p>Search knowledge, inspect why it is trusted, open supporting evidence, and preserve every correction.</p></div>${hasPermission('memory:write') ? '<button type="button" class="button button-primary" data-create-memory>+ Add knowledge</button>' : ''}</div><form id="knowledge-filter-form" class="filter-bar"><label class="search-field"><span>⌕</span><input name="query" value="${escapeAttribute(state.knowledgeQuery)}" placeholder="Search knowledge, projects, decisions, or lessons"></label><button class="button button-secondary" type="submit">Search</button></form><div class="library-summary"><span>${results.length} record${results.length === 1 ? '' : 's'}</span><span>Trust and evidence remain visible</span></div><div class="knowledge-grid">${results.length ? results.map(renderMemoryCard).join('') : emptyState('No knowledge matches this search', 'Try a broader term or add an approved source.')}</div></section>`;
}

function renderMemoryCard(memory: MemoryRecord): string {
  const links = collectSourceLinks(memory.metadata);
  return `<article class="memory-card"><button type="button" class="memory-card-open" data-memory-id="${escapeAttribute(memory.id)}" aria-label="Open ${escapeAttribute(memoryTitle(memory))}"></button><div class="memory-card-meta">${badge(humanize(memory.memoryType), typeTone(memory.memoryType))}${badge(trustLabel(memory), statusTone(memory.status))}</div><h3>${escapeHtml(memoryTitle(memory))}</h3><p>${escapeHtml(truncate(memory.content, 220))}</p><div class="memory-card-stats"><span>Confidence <strong>${formatPercent(memory.confidence)}</strong></span><span>${escapeHtml(projectName(memory))}</span></div><footer><span>${links.length || memory.sourceArtifactId ? '↗ Evidence linked' : 'Source reference pending'}</span><time>${escapeHtml(formatDate(memory.updatedAt))}</time></footer></article>`;
}

function renderProjects(): string {
  const projects = projectGroups();
  return `<section class="page-content knowledge-page">${noticeMarkup()}<div class="page-heading-row"><div><span class="eyebrow">Reconstructed projects</span><h2>Understand the complete organizational story</h2><p>MemoryOS connects fragmented evidence into objectives, context, decisions, actions, current status, outcomes, lessons, and open questions.</p></div></div><div class="project-story-grid">${projects.length ? projects.map(renderProjectStory).join('') : emptyState('No projects yet', 'Add an approved project source so MemoryOS can reconstruct the first organizational story.')}</div></section>`;
}

function projectSection(memories: MemoryRecord[], types: string[]): MemoryRecord[] {
  return memories.filter((memory) => types.includes(memory.memoryType.toUpperCase()));
}

function renderProjectStory(project: { name: string; memories: MemoryRecord[] }): string {
  const sections = [
    ['Objective', ['GOAL', 'OBJECTIVE']],
    ['Context', ['CONTEXT', 'SUMMARY', 'PROJECT']],
    ['Key decisions', ['DECISION']],
    ['Actions', ['TASK', 'ACTION', 'ACTION_RESULT']],
    ['Current status', ['CHECKPOINT', 'STATUS']],
    ['Outcomes', ['OUTCOME', 'ACTION_RESULT']],
    ['Lessons', ['LESSON']],
    ['Open questions', ['QUESTION', 'OPEN_QUESTION', 'CONSTRAINT']],
  ] as const;
  return `<article class="panel project-story"><div class="panel-heading"><div><span class="eyebrow">Reconstructed project</span><h3>${escapeHtml(project.name)}</h3></div>${badge(`${project.memories.length} records`, 'purple')}</div><div class="project-sections">${sections.map(([label, types]) => { const items = projectSection(project.memories, [...types]); return `<section><div class="project-section-heading"><strong>${label}</strong><span>${items.length ? `${items.length} found` : 'Missing'}</span></div>${items.length ? items.slice(0, 4).map((memory) => `<button type="button" class="project-evidence" data-memory-id="${escapeAttribute(memory.id)}"><span>${escapeHtml(memoryTitle(memory))}</span>${badge(trustLabel(memory), statusTone(memory.status))}<small>${escapeHtml(truncate(memory.content, 140))}</small></button>`).join('') : '<p>MemoryOS has not found enough evidence for this section yet.</p>'}</section>`; }).join('')}</div></article>`;
}

function renderAttention(): string {
  const candidates = openCandidates();
  if (!hasPermission('memory:review')) return `<section class="page-content review-page">${noticeMarkup()}<div class="permission-panel"><div class="permission-icon">!</div><h2>Attention Required</h2><p>You can see that business questions need review, but an authorized reviewer must verify or reject them.</p>${badge('Reader access', 'slate')}</div></section>`;
  return `<section class="page-content review-page">${noticeMarkup()}<div class="page-heading-row"><div><span class="eyebrow">Human judgment</span><h2>Business questions that need a person</h2><p>Resolve conflicts, duplicates, uncertain knowledge, and material proposals before people or AI rely on them.</p></div></div><div class="review-summary">${renderMetric('Open questions', String(candidates.length), 'Items requiring a human decision.', 'amber')}${renderMetric('Conflicts', String(candidates.filter((item) => item.status === 'CONFLICT').length), 'Sources or records that appear to disagree.', 'red')}${renderMetric('Potential duplicates', String(candidates.filter((item) => ['DUPLICATE', 'NEAR_DUPLICATE'].includes(item.status)).length), 'Knowledge that may describe the same thing.', 'purple')}</div><div class="review-list">${candidates.length ? candidates.map(renderCandidate).join('') : emptyState('Nothing requires attention', 'MemoryOS has not found conflicts, duplicates, uncertain knowledge, or missing review requiring a decision.')}</div></section>`;
}

function renderCandidate(candidate: MemoryCandidate): string {
  const question = candidate.status === 'CONFLICT' ? 'Two sources may disagree. Which information should the organization trust?' : ['DUPLICATE', 'NEAR_DUPLICATE'].includes(candidate.status) ? 'Several records may describe the same knowledge. Should they be consolidated?' : 'Should this proposed knowledge become trusted organizational intelligence?';
  return `<article class="review-card"><div class="review-card-main"><div class="memory-card-meta">${badge(humanize(candidate.status), statusTone(candidate.status))}${badge(humanize(candidate.memoryType), typeTone(candidate.memoryType))}</div><h3>${escapeHtml(question)}</h3><p>${escapeHtml(candidate.content)}</p><div class="review-confidence"><span>Confidence</span><strong>${formatPercent(candidate.confidence)}</strong></div></div><div class="review-actions"><button type="button" class="button button-primary" data-approve-candidate="${escapeAttribute(candidate.id)}">Verify</button><button type="button" class="button button-danger" data-reject-candidate="${escapeAttribute(candidate.id)}">Reject</button></div></article>`;
}

function selectedMemory(): MemoryRecord | null {
  return state.memories.find((memory) => memory.id === state.selectedMemoryId) ?? null;
}

function renderMemoryModal(): string {
  const memory = selectedMemory();
  if (!memory) return '';
  const links = collectSourceLinks(memory.metadata);
  return `<div class="modal-backdrop" data-modal-backdrop><section class="modal memory-modal" role="dialog" aria-modal="true" aria-label="Organizational intelligence details"><button type="button" class="modal-close" data-close-modal aria-label="Close">×</button><div class="memory-card-meta">${badge(humanize(memory.memoryType), typeTone(memory.memoryType))}${badge(trustLabel(memory), statusTone(memory.status))}</div><h2>${escapeHtml(memoryTitle(memory))}</h2><p class="memory-detail-content">${escapeHtml(memory.content)}</p><div class="detail-grid"><div><span>Confidence</span><strong>${formatPercent(memory.confidence)}</strong></div><div><span>Project</span><strong>${escapeHtml(projectName(memory))}</strong></div><div><span>Updated</span><strong>${escapeHtml(formatDate(memory.updatedAt))}</strong></div></div><div class="evidence-panel"><span class="eyebrow">Supporting evidence</span><h3>Why MemoryOS believes this</h3>${sourceLinksMarkup(links) || '<p>No direct source link is available yet. Treat this as working knowledge until evidence is attached.</p>'}</div>${state.correctionMode ? `<form id="correction-form" class="correction-form"><label><span>Corrected information</span><textarea name="content" rows="5" required>${escapeHtml(memory.content)}</textarea></label><label><span>Reason for correction</span><input name="reason" required placeholder="What changed and why?"></label><div class="modal-actions"><button class="button button-primary" type="submit">Save correction</button><button class="button button-secondary" type="button" data-cancel-correction>Cancel</button></div></form>` : `<div class="modal-actions">${hasPermission('memory:correct') ? '<button class="button button-primary" type="button" data-correct-memory>Correct</button>' : ''}<button class="button button-secondary" type="button" data-load-revisions>View preserved history</button></div>`}${state.revisionsLoading ? '<div class="loading-panel"><span class="spinner"></span> Loading history…</div>' : ''}${state.revisions.length ? `<div class="revision-list"><h3>Preserved history</h3>${state.revisions.map((revision) => `<article><div><strong>Version ${revision.revisionNumber}</strong><time>${escapeHtml(formatDate(revision.createdAt))}</time></div><p>${escapeHtml(revision.content)}</p>${revision.reason ? `<small>${escapeHtml(revision.reason)}</small>` : ''}</article>`).join('')}</div>` : ''}</section></div>`;
}

function renderCreateModal(): string {
  if (!state.showCreate) return '';
  return `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-label="Add organizational knowledge"><button type="button" class="modal-close" data-close-modal aria-label="Close">×</button><span class="eyebrow">Contributor action</span><h2>Add organizational knowledge</h2><p>New knowledge remains scoped to this organization and retains its author, confidence, and future corrections.</p><form id="create-memory-form" class="connect-form"><label><span>Title</span><input name="title" required maxlength="160" placeholder="What should the team recognize?"></label><label><span>Type</span><select name="memoryType"><option value="FACT">Fact</option><option value="DECISION">Decision</option><option value="POLICY">Policy</option><option value="PROCEDURE">Procedure</option><option value="LESSON">Lesson</option><option value="PROJECT">Project</option><option value="TASK">Action</option><option value="OUTCOME">Outcome</option></select></label><label><span>Knowledge</span><textarea name="content" rows="6" required placeholder="Record the context, decision, commitment, outcome, or lesson."></textarea></label><label><span>Confidence</span><input name="confidence" type="number" min="0" max="1" step="0.05" value="0.8"></label><div class="modal-actions"><button class="button button-primary" type="submit">Add knowledge</button><button class="button button-secondary" type="button" data-close-modal>Cancel</button></div></form></section></div>`;
}

function renderStatus(): string {
  const service = (value: string) => badge(humanize(value), value === 'operational' ? 'green' : value === 'checking' ? 'blue' : 'amber');
  return `<main class="status-page"><section class="status-shell"><div class="brand-lockup brand-lockup-large"><div class="brand-mark">M</div><div><strong>MemoryOS</strong><span>Standalone service status</span></div></div><div class="status-hero"><span class="eyebrow">Public status</span><h1>MemoryOS service health</h1><p>No company data, credentials, tenant identifiers, or private diagnostics are exposed here.</p></div>${noticeMarkup()}<div class="status-grid"><article><span>Portal</span>${service(state.publicHealth.portal)}</article><article><span>Memory API</span>${service(state.publicHealth.api)}</article><article><span>Readiness</span>${service(state.publicHealth.readiness)}</article></div><button class="button button-secondary" type="button" data-status-refresh>Refresh status</button><a class="text-button" href="/">Return to MemoryOS</a></section></main>`;
}

function render(): void {
  root.innerHTML = statusRoute ? renderStatus() : state.authState === 'authenticated' ? renderWorkspace() : renderAuth();
  bindEvents();
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-dismiss-notice]').forEach((element) => element.addEventListener('click', () => { clearNotice(); render(); }));
  document.querySelectorAll<HTMLElement>('[data-auth-mode]').forEach((element) => element.addEventListener('click', () => { state.authMode = element.dataset.authMode === 'signup' ? 'signup' : 'login'; state.authState = 'anonymous'; state.verification = null; clearNotice(); render(); }));
  document.querySelector<HTMLFormElement>('#login-form')?.addEventListener('submit', (event) => { event.preventDefault(); void submitLogin(new FormData(event.currentTarget)); });
  document.querySelector<HTMLFormElement>('#signup-form')?.addEventListener('submit', (event) => { event.preventDefault(); void submitSignup(new FormData(event.currentTarget)); });
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((element) => element.addEventListener('click', () => { state.view = (element.dataset.view ?? 'home') as PortalView; render(); }));
  document.querySelector<HTMLElement>('[data-refresh]')?.addEventListener('click', () => void refreshWorkspace());
  document.querySelector<HTMLElement>('[data-signout]')?.addEventListener('click', () => void signOut());
  document.querySelectorAll<HTMLElement>('[data-question]').forEach((element) => element.addEventListener('click', () => { state.lastQuestion = element.dataset.question ?? ''; state.view = 'ask'; render(); document.querySelector<HTMLTextAreaElement>('#ask-query')?.focus(); }));
  document.querySelector<HTMLFormElement>('#ask-form')?.addEventListener('submit', (event) => { event.preventDefault(); void askMemory(String(new FormData(event.currentTarget).get('query') ?? '')); });
  document.querySelector<HTMLFormElement>('#knowledge-filter-form')?.addEventListener('submit', (event) => { event.preventDefault(); state.knowledgeQuery = String(new FormData(event.currentTarget).get('query') ?? ''); render(); });
  document.querySelectorAll<HTMLElement>('[data-memory-id]').forEach((element) => element.addEventListener('click', () => { state.selectedMemoryId = element.dataset.memoryId ?? null; state.revisions = []; state.correctionMode = false; render(); }));
  document.querySelectorAll<HTMLElement>('[data-project-name]').forEach((element) => element.addEventListener('click', () => { state.knowledgeQuery = element.dataset.projectName ?? ''; state.view = 'projects'; render(); }));
  document.querySelector<HTMLElement>('[data-create-memory]')?.addEventListener('click', () => { state.showCreate = true; render(); });
  document.querySelectorAll<HTMLElement>('[data-close-modal]').forEach((element) => element.addEventListener('click', closeModal));
  document.querySelector<HTMLElement>('[data-modal-backdrop]')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });
  document.querySelector<HTMLElement>('[data-load-revisions]')?.addEventListener('click', () => void loadRevisions());
  document.querySelector<HTMLElement>('[data-correct-memory]')?.addEventListener('click', () => { state.correctionMode = true; render(); });
  document.querySelector<HTMLElement>('[data-cancel-correction]')?.addEventListener('click', () => { state.correctionMode = false; render(); });
  document.querySelector<HTMLFormElement>('#correction-form')?.addEventListener('submit', (event) => { event.preventDefault(); void submitCorrection(new FormData(event.currentTarget)); });
  document.querySelector<HTMLFormElement>('#create-memory-form')?.addEventListener('submit', (event) => { event.preventDefault(); void submitCreateMemory(new FormData(event.currentTarget)); });
  document.querySelectorAll<HTMLElement>('[data-approve-candidate]').forEach((element) => element.addEventListener('click', () => void approveCandidate(element.dataset.approveCandidate ?? '')));
  document.querySelectorAll<HTMLElement>('[data-reject-candidate]').forEach((element) => element.addEventListener('click', () => void rejectCandidate(element.dataset.rejectCandidate ?? '')));
  document.querySelector<HTMLElement>('[data-status-refresh]')?.addEventListener('click', () => void refreshPublicStatus());
}

async function submitLogin(form: FormData): Promise<void> {
  if (!client) return;
  state.loading = true;
  clearNotice();
  render();
  try {
    state.session = await client.login(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
    state.authState = 'authenticated';
    await loadWorkspace();
    setNotice('success', 'Welcome back to your standalone MemoryOS organization.');
  } catch (error) {
    state.authState = 'anonymous';
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function submitSignup(form: FormData): Promise<void> {
  if (!client) return;
  state.loading = true;
  clearNotice();
  render();
  try {
    state.verification = await client.signup({
      displayName: String(form.get('displayName') ?? ''),
      email: String(form.get('email') ?? ''),
      organizationName: String(form.get('organizationName') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    state.authState = 'verification-sent';
    setNotice('success', 'The MemoryOS verification email was requested.');
  } catch (error) {
    state.authState = 'anonymous';
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function verifyFromUrl(token: string): Promise<void> {
  if (!client) return;
  state.authState = 'checking';
  render();
  try {
    state.session = await client.verifyEmail(token);
    state.authState = 'authenticated';
    window.history.replaceState({}, '', '/');
    await loadWorkspace();
    setNotice('success', 'Email verified. Your standalone MemoryOS organization is ready.');
  } catch (error) {
    state.authState = 'anonymous';
    state.authMode = 'login';
    setNotice('error', describeError(error));
  }
  render();
}

async function restoreSession(): Promise<void> {
  if (!client) {
    state.authState = 'anonymous';
    render();
    return;
  }
  const token = new URL(window.location.href).searchParams.get('token');
  if (window.location.pathname.replace(/\/+$/, '') === '/verify' && token) {
    await verifyFromUrl(token);
    return;
  }
  try {
    state.session = await client.currentSession();
    state.authState = 'authenticated';
    await loadWorkspace();
  } catch {
    state.authState = 'anonymous';
  }
  render();
}

async function loadWorkspace(): Promise<void> {
  if (!client) return;
  const identity = await client.whoami();
  state.identity = identity;
  const memories = await client.listMemories(scopeQuery());
  state.memories = memories.items;
  if (hasPermission('memory:review')) {
    try {
      state.candidates = await client.listCandidates();
    } catch {
      state.candidates = [];
    }
  } else {
    state.candidates = [];
  }
}

async function refreshWorkspace(): Promise<void> {
  if (!client || state.authState !== 'authenticated') return;
  state.loading = true;
  render();
  try {
    await loadWorkspace();
    setNotice('success', 'Organizational intelligence is up to date.');
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function signOut(): Promise<void> {
  if (client) {
    try {
      await client.logout();
    } catch {
      // The browser state is still cleared; server-side sessions expire and remain revocable.
    }
  }
  state.authState = 'anonymous';
  state.authMode = 'login';
  state.session = null;
  state.identity = null;
  state.memories = [];
  state.candidates = [];
  state.searchResults = [];
  state.selectedMemoryId = null;
  setNotice('info', 'You signed out of standalone MemoryOS. Your QuestorOS session was not changed.');
  render();
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
  state.view = 'ask';
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
    await client.correctMemory(state.selectedMemoryId, { content: String(form.get('content') ?? ''), reason: String(form.get('reason') ?? '') });
    await loadWorkspace();
    state.correctionMode = false;
    state.revisions = await client.getRevisions(state.selectedMemoryId);
    setNotice('success', 'The correction was saved and the previous version remains preserved.');
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
    await client.createMemory({ ...scopePayload(), title: String(form.get('title') ?? ''), memoryType: String(form.get('memoryType') ?? 'FACT'), content: String(form.get('content') ?? ''), confidence: Number(form.get('confidence') ?? 0.8), sensitivity: 'STANDARD', metadata: { createdFrom: 'memoryos-standalone-portal' } });
    await loadWorkspace();
    state.showCreate = false;
    setNotice('success', 'Organizational knowledge was added to the authorized workspace.');
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
  const reason = window.prompt('Why should the organization verify this information?', 'Reviewed against the supporting evidence.');
  if (!reason?.trim()) return;
  const body: Record<string, unknown> = { reason: reason.trim() };
  if (['DUPLICATE', 'NEAR_DUPLICATE'].includes(candidate.status)) {
    const mergeTarget = candidate.relatedMemoryIds?.[0];
    if (!mergeTarget) {
      setNotice('error', 'This duplicate needs an explicit related record before it can be consolidated.');
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
    setNotice('success', 'The information is now verified and its audit history was preserved.');
  } catch (error) {
    setNotice('error', describeError(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function rejectCandidate(candidateId: string): Promise<void> {
  if (!client || !candidateId) return;
  const reason = window.prompt('Why should the organization reject this proposal?');
  if (!reason?.trim()) return;
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

async function refreshPublicStatus(): Promise<void> {
  if (!client) {
    state.publicHealth = { portal: 'operational', api: 'not-configured', readiness: 'not-configured', checkedAt: new Date().toISOString() };
    render();
    return;
  }
  state.publicHealth = { ...state.publicHealth, api: 'checking', readiness: 'checking' };
  render();
  const [health, ready] = await Promise.allSettled([client.health(), client.ready()]);
  state.publicHealth = {
    portal: 'operational',
    api: health.status === 'fulfilled' && health.value ? 'operational' : 'unavailable',
    readiness: ready.status === 'fulfilled' && ready.value ? 'operational' : 'degraded',
    checkedAt: new Date().toISOString(),
  };
  render();
}

render();
if (statusRoute) void refreshPublicStatus();
else void restoreSession();

export {};
