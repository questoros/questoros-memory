export interface IntelligenceBriefMemory {
  id: string;
  content: string;
  memoryType: string;
  icareStage?: string;
  revisionId?: string;
}

export interface IntelligenceBriefInput {
  title: string;
  projectName: string;
  memories: IntelligenceBriefMemory[];
  contradictionNotes?: string[];
  openTasks?: string[];
  reasoningChainId?: string;
}

/**
 * Render a Project Intelligence Brief for publication.
 * Content hash and provenance are computed by the publisher caller.
 */
export function renderIntelligenceBrief(input: IntelligenceBriefInput): string {
  const byStage = new Map<string, IntelligenceBriefMemory[]>();
  for (const memory of input.memories) {
    const stage = memory.icareStage ?? 'CONTEXT';
    const list = byStage.get(stage) ?? [];
    list.push(memory);
    byStage.set(stage, list);
  }

  const lines = [
    `# ${input.title}`,
    '',
    `Project: ${input.projectName}`,
    `ICARE³ lifecycle: Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation`,
    input.reasoningChainId ? `Reasoning chain: ${input.reasoningChainId}` : null,
    '',
    '## Authoritative intelligence',
  ].filter((line): line is string => line !== null);

  for (const [stage, memories] of byStage) {
    lines.push('', `### ${stage}`);
    for (const memory of memories) {
      lines.push(`- (${memory.memoryType}) ${memory.content} \`memory:${memory.id}\``);
      if (memory.revisionId) {
        lines.push(`  - revision: ${memory.revisionId}`);
      }
    }
  }

  if (input.contradictionNotes && input.contradictionNotes.length > 0) {
    lines.push('', '## Detected contradictions / corrections');
    for (const note of input.contradictionNotes) {
      lines.push(`- ${note}`);
    }
  }

  if (input.openTasks && input.openTasks.length > 0) {
    lines.push('', '## Open tasks');
    for (const task of input.openTasks) {
      lines.push(`- ${task}`);
    }
  }

  lines.push(
    '',
    '## Governance',
    '- External Drive edits create reviewed candidates; never silent overwrite.',
    '- SYNC_CONFLICT requires human recommendation evaluation before republish.',
    '',
  );

  return lines.join('\n');
}
