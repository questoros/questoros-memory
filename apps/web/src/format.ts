import type { MemoryRecord, SourceLink } from './types.js';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function memoryTitle(
  memory: Pick<MemoryRecord, 'memoryType' | 'metadata' | 'content'>,
): string {
  const title = memory.metadata.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  const firstLine = memory.content.split(/\r?\n/)[0]?.trim();
  return firstLine ? truncate(firstLine, 84) : humanize(memory.memoryType);
}

export function icareStage(memory: Pick<MemoryRecord, 'metadata'>): string | null {
  const icare = asRecord(memory.metadata.icare);
  return typeof icare.icareStage === 'string' ? icare.icareStage : null;
}

export function humanize(value: unknown): string {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function truncate(value: string, maximum = 180): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

export function formatDate(value: unknown, includeTime = false): string {
  if (!value) return 'Not available';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatPercent(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%` : '—';
}

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function collectSourceLinks(metadataValue: unknown): SourceLink[] {
  const metadata = asRecord(metadataValue);
  const links: SourceLink[] = [];
  const seen = new Set<string>();
  const add = (label: string, value: unknown, kind: SourceLink['kind']) => {
    const url = safeExternalUrl(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ label, url, kind });
  };

  add('Open source', metadata.sourceUrl ?? metadata.sourceUri ?? metadata.externalUrl, 'source');
  add('Open file', metadata.fileUrl ?? metadata.sourceFileUrl ?? metadata.webUrl, 'file');
  add('Open folder', metadata.folderUrl ?? metadata.sourceFolderUrl, 'folder');
  add('Open message', metadata.messageUrl, 'message');
  add('Open meeting', metadata.meetingUrl ?? metadata.recordingUrl, 'meeting');

  const nested = asRecord(metadata.source);
  add('Open source', nested.url ?? nested.sourceUrl, 'source');
  add('Open file', nested.fileUrl ?? nested.webUrl, 'file');
  add('Open folder', nested.folderUrl, 'folder');

  if (Array.isArray(metadata.sourceLinks)) {
    for (const item of metadata.sourceLinks) {
      const record = asRecord(item);
      const rawKind = typeof record.kind === 'string' ? record.kind.toLowerCase() : 'source';
      const kind: SourceLink['kind'] = ['file', 'folder', 'message', 'meeting'].includes(rawKind)
        ? (rawKind as SourceLink['kind'])
        : 'source';
      const label = typeof record.label === 'string' ? record.label : 'Open source';
      add(label, record.url, kind);
    }
  }
  return links;
}

export function typeTone(value: string): string {
  if (value === 'DECISION') return 'purple';
  if (value === 'FACT') return 'blue';
  if (value === 'GOAL') return 'green';
  if (value === 'CONSTRAINT') return 'amber';
  if (value === 'TASK' || value === 'ACTION_RESULT') return 'cyan';
  return 'slate';
}

export function statusTone(value: string): string {
  if (value === 'ACTIVE' || value === 'APPROVED') return 'green';
  if (value === 'PENDING') return 'amber';
  if (value === 'CONFLICT') return 'red';
  if (value === 'DUPLICATE' || value === 'NEAR_DUPLICATE') return 'purple';
  return 'slate';
}
