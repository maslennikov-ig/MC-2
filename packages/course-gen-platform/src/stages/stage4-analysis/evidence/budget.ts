import type { DocumentEvidenceMode } from '@megacampus/shared-types';
import { STAGE4_HARD_TOKEN_LIMIT } from '@/shared/llm/model-selector';

export interface EvidenceBudgetDocument {
  documentId: string;
  priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  originalTokens: number;
  summaryTokens: number;
  hasFullText: boolean;
  hasSummary: boolean;
  importanceScore?: number;
}

export interface EvidenceBudgetOptions {
  modelContext: number;
  promptReserve: number;
  outputReserve: number;
  maxBatchTokens: number;
}

export interface EvidenceDocumentAllocation {
  documentId: string;
  priority: EvidenceBudgetDocument['priority'];
  mode: DocumentEvidenceMode;
  allocatedTokens: number;
  reason:
    | 'core_full_text_fits'
    | 'core_requires_hierarchical_summary'
    | 'validated_summary'
    | 'targeted_retrieval_required'
    | 'budget_exhausted_metadata_only'
    | 'content_unavailable'
    | 'invalid_token_metadata';
}

export interface EvidenceBudgetBatch {
  batchIndex: number;
  documentIds: string[];
  allocatedTokens: number;
  tokenLimit: number;
}

export interface EvidenceBudgetPlan {
  effectiveBudget: number;
  totalAllocatedTokens: number;
  promptReserve: number;
  outputReserve: number;
  allocations: EvidenceDocumentAllocation[];
  batches: EvidenceBudgetBatch[];
}

const PRIORITY_ORDER: Record<EvidenceBudgetDocument['priority'], number> = {
  CORE: 0,
  IMPORTANT: 1,
  SUPPLEMENTARY: 2,
};

function validateOptions(options: EvidenceBudgetOptions): number {
  const values = [
    options.modelContext,
    options.promptReserve,
    options.outputReserve,
    options.maxBatchTokens,
  ];
  if (values.some(value => !Number.isInteger(value) || value < 0)) {
    throw new Error('Evidence budget values must be non-negative integers');
  }
  if (options.maxBatchTokens === 0) {
    throw new Error('Evidence maxBatchTokens must be positive');
  }
  const effective =
    Math.min(options.modelContext, STAGE4_HARD_TOKEN_LIMIT) -
    options.promptReserve -
    options.outputReserve;
  if (effective < 0) {
    throw new Error('Evidence reserves exceed the available model context');
  }
  return effective;
}

function hasValidTokenMetadata(document: EvidenceBudgetDocument): boolean {
  return (
    Number.isInteger(document.originalTokens) &&
    document.originalTokens >= 0 &&
    Number.isInteger(document.summaryTokens) &&
    document.summaryTokens >= 0 &&
    document.summaryTokens <= document.originalTokens
  );
}

function sortDocuments(documents: EvidenceBudgetDocument[]): EvidenceBudgetDocument[] {
  return [...documents].sort((left, right) => {
    const priority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (priority !== 0) return priority;
    const importance = (right.importanceScore ?? 0) - (left.importanceScore ?? 0);
    if (importance !== 0) return importance;
    return left.documentId.localeCompare(right.documentId);
  });
}

function desiredAllocation(
  document: EvidenceBudgetDocument,
  maxBatchTokens: number
): Omit<EvidenceDocumentAllocation, 'documentId' | 'priority'> {
  if (!hasValidTokenMetadata(document)) {
    return { mode: 'metadata_only', allocatedTokens: 0, reason: 'invalid_token_metadata' };
  }
  if (!document.hasFullText && !document.hasSummary) {
    return { mode: 'metadata_only', allocatedTokens: 0, reason: 'content_unavailable' };
  }

  if (document.priority === 'CORE') {
    if (document.hasFullText && document.originalTokens <= maxBatchTokens) {
      return {
        mode: 'full_text',
        allocatedTokens: document.originalTokens,
        reason: 'core_full_text_fits',
      };
    }
    const hierarchicalTokens = document.hasSummary
      ? Math.min(document.summaryTokens, maxBatchTokens)
      : Math.min(document.originalTokens, maxBatchTokens);
    return {
      mode: 'hierarchical_summary',
      allocatedTokens: hierarchicalTokens,
      reason: 'core_requires_hierarchical_summary',
    };
  }

  if (document.hasSummary) {
    return {
      mode: 'summary',
      allocatedTokens: Math.min(document.summaryTokens, maxBatchTokens),
      reason: 'validated_summary',
    };
  }

  return {
    mode: 'targeted_retrieval',
    allocatedTokens: Math.min(document.originalTokens, maxBatchTokens),
    reason: 'targeted_retrieval_required',
  };
}

function buildBatches(
  allocations: EvidenceDocumentAllocation[],
  maxBatchTokens: number
): EvidenceBudgetBatch[] {
  const batches: EvidenceBudgetBatch[] = [];
  let documentIds: string[] = [];
  let allocatedTokens = 0;

  const flush = () => {
    if (documentIds.length === 0) return;
    batches.push({
      batchIndex: batches.length,
      documentIds,
      allocatedTokens,
      tokenLimit: maxBatchTokens,
    });
    documentIds = [];
    allocatedTokens = 0;
  };

  for (const allocation of allocations) {
    if (allocation.allocatedTokens === 0) continue;
    if (allocatedTokens + allocation.allocatedTokens > maxBatchTokens) flush();
    documentIds.push(allocation.documentId);
    allocatedTokens += allocation.allocatedTokens;
  }
  flush();
  return batches;
}

/**
 * Builds a stable final-context plan plus deterministic map batches. Each
 * source remains present even when its only safe representation is metadata.
 */
export function allocateEvidenceBudget(
  documents: EvidenceBudgetDocument[],
  options: EvidenceBudgetOptions
): EvidenceBudgetPlan {
  const effectiveBudget = validateOptions(options);
  let remaining = effectiveBudget;

  const allocations = sortDocuments(documents).map(document => {
    const desired = desiredAllocation(document, options.maxBatchTokens);
    if (desired.allocatedTokens <= remaining) {
      remaining -= desired.allocatedTokens;
      return { documentId: document.documentId, priority: document.priority, ...desired };
    }
    if (remaining > 0 && desired.allocatedTokens > 0) {
      const allocatedTokens = Math.min(remaining, options.maxBatchTokens);
      remaining -= allocatedTokens;
      return {
        documentId: document.documentId,
        priority: document.priority,
        mode: 'targeted_retrieval' as const,
        allocatedTokens,
        reason: 'targeted_retrieval_required' as const,
      };
    }
    return {
      documentId: document.documentId,
      priority: document.priority,
      mode: 'metadata_only' as const,
      allocatedTokens: 0,
      reason: 'budget_exhausted_metadata_only' as const,
    };
  });

  const totalAllocatedTokens = allocations.reduce(
    (total, allocation) => total + allocation.allocatedTokens,
    0
  );

  return {
    effectiveBudget,
    totalAllocatedTokens,
    promptReserve: options.promptReserve,
    outputReserve: options.outputReserve,
    allocations,
    batches: buildBatches(allocations, options.maxBatchTokens),
  };
}
