import {
  MockReasoningProvider,
  type ReasoningProvider,
} from '@questoros-memory/reasoning-provider';
import { analyzeAgainstMemories } from './analysis.js';
import type {
  AgenticHarvestInput,
  AgenticHarvestResult,
  AgenticHarvester,
  GovernedCandidateProposal,
} from './contracts.js';
import { DeterministicExtractor } from './extractor.js';

const MAX_LIVE_BEDROCK_CANDIDATES = 3;

function mapLegacyStatusToClassification(
  status: string,
): GovernedCandidateProposal['analysisClassification'] {
  switch (status) {
    case 'DUPLICATE':
      return 'EXACT_DUPLICATE';
    case 'NEAR_DUPLICATE':
      return 'NEAR_DUPLICATE';
    case 'CONFLICT':
      return 'UNRESOLVED_CONTRADICTION';
    default:
      return 'NEW_DURABLE';
  }
}

function mapLegacyStatusToDisposition(
  status: string,
): GovernedCandidateProposal['recommendedDisposition'] {
  switch (status) {
    case 'DUPLICATE':
      return 'IGNORE';
    case 'NEAR_DUPLICATE':
      return 'MERGE';
    case 'CONFLICT':
      return 'CORRECT';
    default:
      return 'CREATE';
  }
}

/**
 * Model-backed Harvester orchestration.
 * Reasoning output is proposal-only; deterministic analysis + policy gates still apply.
 * DeterministicExtractor remains available as offline/test fallback.
 */
export class ModelBackedHarvester implements AgenticHarvester {
  private readonly reasoning: ReasoningProvider;
  private readonly deterministic = new DeterministicExtractor();

  constructor(options?: { reasoning?: ReasoningProvider }) {
    this.reasoning = options?.reasoning ?? new MockReasoningProvider();
  }

  async harvest(input: AgenticHarvestInput): Promise<AgenticHarvestResult> {
    if (input.useDeterministicFallback) {
      return this.harvestDeterministic(input);
    }

    const extracted = await this.reasoning.extract({
      sourceText: input.sourceText,
      sourceLocator: input.sourceLocator ?? 'inline-source',
      relatedMemories: input.relatedMemories.map((m) => ({
        id: m.id,
        content: m.content,
        memoryType: m.memoryType,
        scopeType: m.scopeType,
        sensitivity: m.sensitivity,
        status: m.status,
      })),
    });

    // Each accepted proposal requires conflict and policy reasoning calls. Keep
    // live Bedrock harvests bounded inside the 30-second staging Lambda and the
    // approved $5 budget. Mock/offline acceptance remains unchanged.
    const proposals =
      this.reasoning.providerName === 'amazon-bedrock'
        ? extracted.candidates.slice(0, MAX_LIVE_BEDROCK_CANDIDATES)
        : extracted.candidates;
    const candidates: GovernedCandidateProposal[] = [];

    for (const proposal of proposals) {
      // Deterministic gate: never promote PRIVATE to organization scope.
      if (
        proposal.ownershipClassification === 'PRIVATE' &&
        proposal.scopeRecommendation === 'TENANT'
      ) {
        continue;
      }

      const analysis = await this.reasoning.analyze({
        candidateContent: proposal.content,
        candidateMemoryType: proposal.memoryType,
        relatedMemories: input.relatedMemories,
        sourceEvidenceSpan: proposal.sourceEvidenceSpan,
      });

      // Deterministic conflict checks still win for exact duplicates / date conflicts.
      const [legacy] = analyzeAgainstMemories(
        [
          {
            content: proposal.content,
            memoryType: proposal.memoryType,
            confidence: proposal.confidence,
          },
        ],
        input.relatedMemories,
      );

      let disposition = analysis.disposition;
      let classification = analysis.classification;
      let relatedMemoryIds = analysis.relatedMemoryIds;

      if (legacy?.status === 'DUPLICATE') {
        disposition = 'IGNORE';
        classification = 'EXACT_DUPLICATE';
        relatedMemoryIds = legacy.relatedMemoryIds;
      } else if (legacy?.status === 'CONFLICT') {
        disposition = 'CORRECT';
        classification = 'SUPERSEDING_CORRECTION';
        relatedMemoryIds = legacy.relatedMemoryIds;
      } else if (proposal.ownershipClassification === 'PRIVATE') {
        disposition = 'IGNORE';
        classification = 'PRIVATE_INFORMATION';
        relatedMemoryIds = [];
      }

      const policy = await this.reasoning.evaluate({
        candidateContent: proposal.content,
        ownershipClassification: proposal.ownershipClassification,
        scopeRecommendation: proposal.scopeRecommendation,
        confidence: proposal.confidence,
        disposition,
        permissions: input.permissions,
      });

      candidates.push({
        content: proposal.content,
        memoryType: proposal.memoryType,
        icareStage: proposal.icareStage,
        confidence: proposal.confidence,
        importance: proposal.importance,
        ownershipClassification: proposal.ownershipClassification,
        scopeRecommendation: proposal.scopeRecommendation,
        sourceEvidenceSpan: proposal.sourceEvidenceSpan,
        sourceLocator: proposal.sourceLocator,
        reasonForDurability: proposal.reasonForDurability,
        relatedEntityOrProject: proposal.relatedEntityOrProject,
        recommendedDisposition: disposition,
        analysisClassification: classification,
        relatedMemoryIds,
        requiresApproval: policy.requiresApproval && disposition !== 'IGNORE',
        policyAllowed: policy.allowed || disposition === 'IGNORE',
        metadata: {
          extractedBy: 'model-backed-harvester',
          harvestRecommendation: disposition.toLowerCase(),
          analysisStatus:
            disposition === 'CORRECT'
              ? 'CONFLICT'
              : disposition === 'IGNORE' && classification === 'EXACT_DUPLICATE'
                ? 'DUPLICATE'
                : disposition === 'MERGE'
                  ? 'NEAR_DUPLICATE'
                  : 'PENDING',
          analysisClassification: classification,
          ownershipClassification: proposal.ownershipClassification,
          sourceEvidenceSpan: proposal.sourceEvidenceSpan,
          sourceLocator: proposal.sourceLocator,
          reasonForDurability: proposal.reasonForDurability,
          relatedEntityOrProject: proposal.relatedEntityOrProject,
          importance: proposal.importance,
          policyRationale: policy.rationale,
          analysisRationale: analysis.rationale,
        },
      });
    }

    const truncated = proposals.length < extracted.candidates.length;
    return {
      candidates,
      extractorMode: 'model',
      providerName: this.reasoning.providerName,
      modelId: this.reasoning.modelId,
      rationale: truncated
        ? `${extracted.rationale} Live Bedrock processing was capped at ${MAX_LIVE_BEDROCK_CANDIDATES} candidates for latency and cost control.`
        : extracted.rationale,
    };
  }

  private async harvestDeterministic(input: AgenticHarvestInput): Promise<AgenticHarvestResult> {
    await Promise.resolve();
    const extracted = this.deterministic.extract(input.sourceText);
    const analyzed = analyzeAgainstMemories(extracted, input.relatedMemories);
    const candidates: GovernedCandidateProposal[] = analyzed.map((item) => {
      const disposition = mapLegacyStatusToDisposition(item.status);
      const classification = mapLegacyStatusToClassification(item.status);
      return {
        content: item.content,
        memoryType: item.memoryType,
        icareStage: 'RECOMMENDATIONS',
        confidence: item.confidence,
        importance: item.confidence,
        ownershipClassification: 'PROJECT',
        scopeRecommendation: 'PROJECT',
        sourceEvidenceSpan: item.content,
        sourceLocator: input.sourceLocator ?? 'inline-source',
        reasonForDurability: 'Deterministic fixture extraction fallback.',
        relatedEntityOrProject: 'active-project',
        recommendedDisposition: disposition,
        analysisClassification: classification,
        relatedMemoryIds: item.relatedMemoryIds,
        requiresApproval: disposition !== 'IGNORE',
        policyAllowed: true,
        metadata: {
          ...(item.metadata ?? {}),
          extractedBy: 'deterministic-fallback',
          harvestRecommendation: disposition.toLowerCase(),
          analysisStatus: item.status,
          analysisClassification: classification,
        },
      };
    });

    return {
      candidates,
      extractorMode: 'deterministic-fallback',
      providerName: 'deterministic',
      modelId: 'deterministic-extractor-v1',
      rationale: 'Used DeterministicExtractor as offline/test fallback.',
    };
  }
}
