/**
 * Stage 4 Budget Allocator
 * @module stages/stage4-analysis/phases/stage4-budget-allocator
 *
 * Allocates token budgets for Stage 4 Analysis using three-level priority:
 * - CORE: Single most important document (always full text)
 * - IMPORTANT: Key supporting documents (full text if fits, otherwise summary)
 * - SUPPLEMENTARY: Additional materials (always summary)
 *
 * Model selection uses 260K threshold (not 80K like Stage 3)
 */

import type { DocumentPriorityLevel } from '@megacampus/shared-types';
import {
  selectModelForStage4,
  STAGE4_HARD_TOKEN_LIMIT,
  STAGE4_MODELS,
  type Stage4ModelSelection,
} from '../../../shared/llm/model-selector';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Document info for Stage 4 budget calculation
 */
export interface Stage4DocumentInfo {
  /** Uploaded document UUID */
  file_id: string;

  /** Priority classification (CORE | IMPORTANT | SUPPLEMENTARY) */
  priority: DocumentPriorityLevel;

  /** Full text token count (from markdown_content) */
  original_tokens: number;

  /** Summary token count (from processed_content) */
  summary_tokens: number;

  /** Importance score for sorting IMPORTANT documents */
  importance_score?: number;
}

/**
 * Budget allocation result for a single document
 */
export interface Stage4DocumentBudget {
  /** Uploaded document UUID */
  file_id: string;

  /** Processing mode (full_text or summary) */
  mode: 'full_text' | 'summary';

  /** Tokens that will be used */
  tokens: number;

  /** Priority level */
  priority: DocumentPriorityLevel;
}

/**
 * Complete budget allocation result for Stage 4
 */
export interface Stage4BudgetAllocation {
  /** Selected model info */
  modelSelection: Stage4ModelSelection;

  /** Per-document allocations */
  documents: Stage4DocumentBudget[];

  /** Total tokens to be used */
  totalTokens: number;

  /** Breakdown by priority */
  breakdown: {
    core: {
      count: number;
      tokens: number;
      mode: 'full_text';
    };
    important: {
      count: number;
      fullTextCount: number;
      summaryCount: number;
      tokens: number;
    };
    supplementary: {
      count: number;
      tokens: number;
      mode: 'summary';
    };
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Allocate token budget for Stage 4 Analysis.
 *
 * Algorithm:
 * 1. CORE document ALWAYS uses full text
 * 2. SUPPLEMENTARY documents ALWAYS use summary
 * 3. Calculate minimum: CORE_full + all_summaries
 * 4. Select model based on minimum (260K threshold)
 * 5. Fill remaining budget with IMPORTANT documents (greedy by importance_score)
 *
 * @param documents - Documents with token counts and priorities
 * @param language - Content language ('ru' | 'en')
 * @returns Stage4BudgetAllocation with model and per-document budgets
 *
 * @example
 * ```typescript
 * const allocation = allocateStage4Budget(documents, 'ru');
 * // allocation.modelSelection.modelId === 'qwen/qwen3-235b-a22b-2507'
 * // allocation.documents[0].mode === 'full_text' (CORE)
 * ```
 */
export function allocateStage4Budget(
  documents: Stage4DocumentInfo[],
  language: 'ru' | 'en'
): Stage4BudgetAllocation {
  // Step 1: Separate documents by priority
  const core = documents.filter((d) => d.priority === 'CORE');
  const important = documents.filter((d) => d.priority === 'IMPORTANT');
  const supplementary = documents.filter((d) => d.priority === 'SUPPLEMENTARY');

  // Validate: exactly 1 CORE document expected
  if (core.length !== 1) {
    throw new Error(`Expected exactly 1 CORE document, got ${core.length}`);
  }

  const coreDoc = core[0];

  // Step 2: Calculate minimum budget (CORE full + ALL summaries)
  const coreFullTokens = coreDoc.original_tokens;
  const importantSummaryTokens = important.reduce((sum, d) => sum + d.summary_tokens, 0);
  const supplementarySummaryTokens = supplementary.reduce((sum, d) => sum + d.summary_tokens, 0);

  const minimumTokens = coreFullTokens + importantSummaryTokens + supplementarySummaryTokens;

  // Step 3: Select model based on minimum
  const modelSelection = selectModelForStage4(minimumTokens, language);

  // Step 4: Determine effective max context (respect hard limit)
  const effectiveMaxContext = Math.min(modelSelection.maxContext, STAGE4_HARD_TOKEN_LIMIT);

  // Step 5: Calculate available budget for IMPORTANT full-text upgrades
  // available = max_context - CORE_full - SUPPLEMENTARY_summary
  const availableForImportant = effectiveMaxContext - coreFullTokens - supplementarySummaryTokens;

  // Step 6: Greedy allocation for IMPORTANT documents
  // Sort by importance_score DESC
  const sortedImportant = [...important].sort(
    (a, b) => (b.importance_score || 0) - (a.importance_score || 0)
  );

  const importantAllocations: Stage4DocumentBudget[] = [];
  let remainingBudget = availableForImportant;
  let importantFullTextCount = 0;
  let importantTotalTokens = 0;

  for (const doc of sortedImportant) {
    if (doc.original_tokens <= remainingBudget) {
      // Document fits - use full text
      importantAllocations.push({
        file_id: doc.file_id,
        mode: 'full_text',
        tokens: doc.original_tokens,
        priority: 'IMPORTANT',
      });
      remainingBudget -= doc.original_tokens;
      importantFullTextCount++;
      importantTotalTokens += doc.original_tokens;
    } else {
      // Document doesn't fit - use summary
      importantAllocations.push({
        file_id: doc.file_id,
        mode: 'summary',
        tokens: doc.summary_tokens,
        priority: 'IMPORTANT',
      });
      remainingBudget -= doc.summary_tokens;
      importantTotalTokens += doc.summary_tokens;
    }
  }

  // Step 7: Build final allocation
  const documentAllocations: Stage4DocumentBudget[] = [
    // CORE first
    {
      file_id: coreDoc.file_id,
      mode: 'full_text',
      tokens: coreFullTokens,
      priority: 'CORE',
    },
    // IMPORTANT next
    ...importantAllocations,
    // SUPPLEMENTARY last
    ...supplementary.map((doc) => ({
      file_id: doc.file_id,
      mode: 'summary' as const,
      tokens: doc.summary_tokens,
      priority: 'SUPPLEMENTARY' as const,
    })),
  ];

  const totalTokens = documentAllocations.reduce((sum, d) => sum + d.tokens, 0);

  return {
    modelSelection,
    documents: documentAllocations,
    totalTokens,
    breakdown: {
      core: {
        count: 1,
        tokens: coreFullTokens,
        mode: 'full_text',
      },
      important: {
        count: important.length,
        fullTextCount: importantFullTextCount,
        summaryCount: important.length - importantFullTextCount,
        tokens: importantTotalTokens,
      },
      supplementary: {
        count: supplementary.length,
        tokens: supplementarySummaryTokens,
        mode: 'summary',
      },
    },
  };
}

/**
 * Validate that budget allocation fits within model constraints.
 *
 * Checks:
 * - Total tokens <= model max context
 * - Total tokens <= hard limit (700K)
 *
 * @param allocation - Budget allocation to validate
 * @returns true if valid, throws error if invalid
 *
 * @example
 * ```typescript
 * const allocation = allocateStage4Budget(documents, 'ru');
 * validateStage4Budget(allocation); // true or throws
 * ```
 */
export function validateStage4Budget(allocation: Stage4BudgetAllocation): boolean {
  const { modelSelection, totalTokens } = allocation;

  if (totalTokens > modelSelection.maxContext) {
    throw new Error(
      `Budget allocation ${totalTokens} exceeds model context ${modelSelection.maxContext}`
    );
  }

  if (totalTokens > STAGE4_HARD_TOKEN_LIMIT) {
    throw new Error(
      `Budget allocation ${totalTokens} exceeds hard limit ${STAGE4_HARD_TOKEN_LIMIT}`
    );
  }

  return true;
}

/**
 * Calculate minimum token requirement for Stage 4 (CORE full + all summaries)
 *
 * This is the minimum budget needed to run Stage 4 Analysis:
 * - 1 CORE document (full text)
 * - All IMPORTANT documents (summary)
 * - All SUPPLEMENTARY documents (summary)
 *
 * @param documents - Documents with token counts and priorities
 * @returns Minimum token requirement
 *
 * @example
 * ```typescript
 * const minimum = calculateMinimumTokens(documents);
 * // minimum = 150_000 (CORE full + all summaries)
 * ```
 */
export function calculateMinimumTokens(documents: Stage4DocumentInfo[]): number {
  const core = documents.filter((d) => d.priority === 'CORE');
  const important = documents.filter((d) => d.priority === 'IMPORTANT');
  const supplementary = documents.filter((d) => d.priority === 'SUPPLEMENTARY');

  if (core.length !== 1) {
    throw new Error(`Expected exactly 1 CORE document, got ${core.length}`);
  }

  const coreFullTokens = core[0].original_tokens;
  const importantSummaryTokens = important.reduce((sum, d) => sum + d.summary_tokens, 0);
  const supplementarySummaryTokens = supplementary.reduce((sum, d) => sum + d.summary_tokens, 0);

  return coreFullTokens + importantSummaryTokens + supplementarySummaryTokens;
}

/**
 * Calculate maximum token usage for Stage 4 (all documents full text)
 *
 * This is the maximum budget that would be needed if all documents used full text:
 * - 1 CORE document (full text)
 * - All IMPORTANT documents (full text)
 * - All SUPPLEMENTARY documents (full text)
 *
 * Used for logging and budget planning purposes.
 *
 * @param documents - Documents with token counts and priorities
 * @returns Maximum token requirement
 *
 * @example
 * ```typescript
 * const maximum = calculateMaximumTokens(documents);
 * // maximum = 800_000 (all full text)
 * ```
 */
export function calculateMaximumTokens(documents: Stage4DocumentInfo[]): number {
  return documents.reduce((sum, d) => sum + d.original_tokens, 0);
}

/**
 * Get detailed allocation summary for logging
 *
 * Returns a human-readable summary of the budget allocation with:
 * - Model selection details
 * - Per-priority breakdowns
 * - Total usage vs capacity
 * - Savings from summaries
 *
 * @param allocation - Budget allocation to summarize
 * @param documents - Original documents (for max tokens calculation)
 * @returns Summary object with detailed breakdown
 *
 * @example
 * ```typescript
 * const summary = getAllocationSummary(allocation, documents);
 * console.log(summary.utilizationPercent); // 65
 * console.log(summary.savingsPercent); // 35
 * ```
 */
export function getAllocationSummary(
  allocation: Stage4BudgetAllocation,
  documents: Stage4DocumentInfo[]
) {
  const maxPossibleTokens = calculateMaximumTokens(documents);
  const { modelSelection, totalTokens, breakdown } = allocation;

  const utilizationPercent = Math.round((totalTokens / modelSelection.maxContext) * 100);
  const savingsPercent = Math.round(((maxPossibleTokens - totalTokens) / maxPossibleTokens) * 100);

  return {
    model: {
      id: modelSelection.modelId,
      tier: modelSelection.tier,
      maxContext: modelSelection.maxContext,
      cacheReadEnabled: modelSelection.cacheReadEnabled,
    },
    usage: {
      totalTokens,
      maxPossibleTokens,
      utilizationPercent,
      savingsPercent,
    },
    breakdown: {
      core: {
        count: breakdown.core.count,
        tokens: breakdown.core.tokens,
        mode: breakdown.core.mode,
      },
      important: {
        count: breakdown.important.count,
        fullTextCount: breakdown.important.fullTextCount,
        summaryCount: breakdown.important.summaryCount,
        tokens: breakdown.important.tokens,
      },
      supplementary: {
        count: breakdown.supplementary.count,
        tokens: breakdown.supplementary.tokens,
        mode: breakdown.supplementary.mode,
      },
    },
  };
}

/**
 * Recalculate budget allocation with extended tier after context overflow.
 *
 * When a context_length_exceeded error occurs, this function recalculates
 * the budget using the extended tier model to provide larger context window.
 * This is used in conjunction with the context overflow handler to retry
 * operations with appropriate model selection.
 *
 * @param allocation - Original budget allocation that failed
 * @param language - Content language ('ru' | 'en')
 * @returns Updated allocation with extended tier model
 *
 * @example
 * ```typescript
 * try {
 *   await runPhase(allocation);
 * } catch (error) {
 *   if (isContextOverflowError(error)) {
 *     const newAllocation = recalculateBudgetForExtendedTier(allocation, 'ru');
 *     await runPhase(newAllocation);
 *   }
 * }
 * ```
 */
export function recalculateBudgetForExtendedTier(
  allocation: Stage4BudgetAllocation,
  language: 'ru' | 'en'
): Stage4BudgetAllocation {
  const extendedConfig = STAGE4_MODELS[language].extended;

  return {
    ...allocation,
    modelSelection: {
      modelId: extendedConfig.primary,
      fallbackModelId: extendedConfig.fallback,
      tier: 'extended',
      maxContext: extendedConfig.maxContext,
      cacheReadEnabled: 'cacheRead' in extendedConfig ? extendedConfig.cacheRead : false,
    },
  };
}
