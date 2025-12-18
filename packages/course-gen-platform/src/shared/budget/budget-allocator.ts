/**
 * Budget Allocator
 * @module shared/budget/budget-allocator
 *
 * Allocates token budgets for document summarization based on priorities
 * from Stage 2 document classification. Uses model selection logic to
 * determine optimal context window allocation.
 *
 * Model Selection Logic (from data-model.md):
 * - IF total_high_priority_tokens <= 80,000:
 *   - selected_model = 'oss-120b' (128K context)
 *   - high_budget = 80,000
 * - ELSE:
 *   - selected_model = 'gemini-flash' (1M context)
 *   - high_budget = 400,000
 *
 * @see specs/010-stages-456-pipeline/data-model.md
 * @see packages/shared-types/src/document-prioritization.ts
 */

import type {
  BudgetAllocation,
  AnalysisModel,
  PriorityLevel,
} from '@megacampus/shared-types';
import {
  BudgetAllocationSchema,
  DEFAULT_HIGH_BUDGET_OSS,
  selectAnalysisModel,
  getDefaultHighBudget,
} from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../supabase/admin';
import logger from '../logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Minimum budget for LOW priority documents (tokens)
 * Even low-priority docs get at least this much context
 */
export const MIN_LOW_BUDGET = 20_000;

/**
 * Default LOW priority budget when HIGH doesn't consume full allocation
 */
export const DEFAULT_LOW_BUDGET = 40_000;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Document with priority and token information for budget calculation
 */
export interface DocumentPriorityInfo {
  file_id: string;
  priority: PriorityLevel;
  token_count: number;
}

/**
 * Individual document budget allocation
 */
export interface DocumentBudget {
  /** Token budget allocated for this document */
  budget: number;
  /** Processing mode based on budget vs document size */
  mode: 'full_text' | 'summary';
}

/**
 * Result of budget calculation before validation
 */
interface BudgetCalculationResult {
  total_high_priority_tokens: number;
  total_low_priority_tokens: number;
  selected_model: AnalysisModel;
  high_budget: number;
  low_budget: number;
  high_priority_count: number;
  low_priority_count: number;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Calculate budget allocation for a course based on document priorities.
 *
 * Retrieves document priorities from Stage 2 classification and file_catalog
 * token counts to determine optimal model and budget distribution.
 *
 * @param courseId - Course UUID
 * @returns BudgetAllocation with model selection and token budgets
 * @throws Error if database queries fail or no documents found
 *
 * @example
 * ```typescript
 * const allocation = await calculateBudgetAllocation('course-uuid');
 * // allocation.selected_model === 'oss-120b' (if HIGH total <= 80K)
 * // allocation.high_budget === 80_000
 * ```
 */
export async function calculateBudgetAllocation(
  courseId: string
): Promise<BudgetAllocation> {
  const startTime = Date.now();

  logger.info(
    { courseId },
    '[BudgetAllocator] Starting budget calculation'
  );

  const supabase = getSupabaseAdmin();

  // Step 1: Get document priorities from Stage 2 classification
  // NOTE: document_priorities table will be added in future migration
  // Using type assertion until DB types are regenerated
  const { data: priorities, error: prioritiesError } = await supabase
    .from('document_priorities' as 'file_catalog') // Type assertion for missing table
    .select('file_id, priority, importance_score')
    .eq('course_id', courseId) as unknown as {
      data: Array<{ file_id: string; priority: string; importance_score: number }> | null;
      error: Error | null;
    };

  if (prioritiesError) {
    logger.error(
      { courseId, error: prioritiesError },
      '[BudgetAllocator] Failed to fetch document priorities'
    );
    throw new Error(`Failed to fetch document priorities: ${prioritiesError.message}`);
  }

  if (!priorities || priorities.length === 0) {
    logger.warn(
      { courseId },
      '[BudgetAllocator] No document priorities found - returning default allocation'
    );
    return createDefaultAllocation(courseId);
  }

  // Step 2: Get file_catalog entries for token counts
  // NOTE: token_count column will be added in future migration
  const fileIds = priorities.map((p) => p.file_id);
  const { data: files, error: filesError } = await supabase
    .from('file_catalog')
    .select('id, token_count')
    .in('id', fileIds) as unknown as {
      data: Array<{ id: string; token_count: number | null }> | null;
      error: Error | null;
    };

  if (filesError) {
    logger.error(
      { courseId, error: filesError },
      '[BudgetAllocator] Failed to fetch file catalog'
    );
    throw new Error(`Failed to fetch file catalog: ${filesError.message}`);
  }

  // Step 3: Build token map
  const tokenMap = new Map<string, number>();
  for (const file of files || []) {
    tokenMap.set(file.id, file.token_count || 0);
  }

  // Step 4: Calculate totals by priority
  const calculation = calculateBudgets(priorities, tokenMap);

  logger.debug(
    {
      courseId,
      highPriorityCount: calculation.high_priority_count,
      lowPriorityCount: calculation.low_priority_count,
      totalHighTokens: calculation.total_high_priority_tokens,
      totalLowTokens: calculation.total_low_priority_tokens,
      selectedModel: calculation.selected_model,
    },
    '[BudgetAllocator] Budget calculation completed'
  );

  // Step 5: Build and validate allocation
  const allocation: BudgetAllocation = {
    course_id: courseId,
    total_high_priority_tokens: calculation.total_high_priority_tokens,
    total_low_priority_tokens: calculation.total_low_priority_tokens,
    selected_model: calculation.selected_model,
    high_budget: calculation.high_budget,
    low_budget: calculation.low_budget,
    allocated_at: new Date(),
  };

  // Validate with Zod schema
  const validated = BudgetAllocationSchema.parse(allocation);

  const durationMs = Date.now() - startTime;

  logger.info(
    {
      courseId,
      selectedModel: validated.selected_model,
      highBudget: validated.high_budget,
      lowBudget: validated.low_budget,
      totalHighTokens: validated.total_high_priority_tokens,
      totalLowTokens: validated.total_low_priority_tokens,
      durationMs,
    },
    '[BudgetAllocator] Budget allocation complete'
  );

  return validated;
}

/**
 * Get individual document budget based on course allocation.
 *
 * Determines whether a document should be processed in full_text mode
 * (fits in budget) or summary mode (needs compression).
 *
 * @param allocation - Course budget allocation from calculateBudgetAllocation
 * @param priority - Document priority level (HIGH or LOW)
 * @param docTokenCount - Token count of the document
 * @returns DocumentBudget with allocated tokens and processing mode
 *
 * @example
 * ```typescript
 * const docBudget = getDocumentBudget(allocation, 'HIGH', 15000);
 * // docBudget.mode === 'full_text' (if doc fits in HIGH budget)
 *
 * const docBudget = getDocumentBudget(allocation, 'LOW', 50000);
 * // docBudget.mode === 'summary' (doc exceeds LOW budget)
 * ```
 */
export function getDocumentBudget(
  allocation: BudgetAllocation,
  priority: PriorityLevel,
  docTokenCount: number
): DocumentBudget {
  const budgetPool = priority === 'HIGH' ? allocation.high_budget : allocation.low_budget;

  // If document fits within its priority budget pool, use full text
  // Otherwise, need to summarize to fit within budget constraints
  const canFitFullText = docTokenCount <= budgetPool;

  if (canFitFullText) {
    return {
      budget: docTokenCount,
      mode: 'full_text',
    };
  }

  // Document exceeds budget - allocate what we can and mark for summary
  return {
    budget: budgetPool,
    mode: 'summary',
  };
}

/**
 * Calculate per-document budget for a set of documents.
 *
 * Distributes the budget pool across documents, prioritizing
 * documents based on their importance_score within the priority tier.
 *
 * @param allocation - Course budget allocation
 * @param documents - Documents with priority and token info
 * @returns Map of file_id to DocumentBudget
 *
 * @example
 * ```typescript
 * const budgets = calculatePerDocumentBudgets(allocation, documents);
 * for (const [fileId, budget] of budgets) {
 *   console.log(`${fileId}: ${budget.budget} tokens (${budget.mode})`);
 * }
 * ```
 */
export function calculatePerDocumentBudgets(
  allocation: BudgetAllocation,
  documents: DocumentPriorityInfo[]
): Map<string, DocumentBudget> {
  const budgets = new Map<string, DocumentBudget>();

  for (const doc of documents) {
    const budget = getDocumentBudget(allocation, doc.priority, doc.token_count);
    budgets.set(doc.file_id, budget);
  }

  logger.debug(
    {
      courseId: allocation.course_id,
      documentCount: documents.length,
      fullTextCount: Array.from(budgets.values()).filter((b) => b.mode === 'full_text').length,
      summaryCount: Array.from(budgets.values()).filter((b) => b.mode === 'summary').length,
    },
    '[BudgetAllocator] Per-document budgets calculated'
  );

  return budgets;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate budget totals and model selection from priorities and tokens.
 */
function calculateBudgets(
  priorities: Array<{ file_id: string; priority: string; importance_score: number }>,
  tokenMap: Map<string, number>
): BudgetCalculationResult {
  let totalHighTokens = 0;
  let totalLowTokens = 0;
  let highCount = 0;
  let lowCount = 0;

  for (const doc of priorities) {
    const tokens = tokenMap.get(doc.file_id) || 0;

    if (doc.priority === 'HIGH') {
      totalHighTokens += tokens;
      highCount++;
    } else {
      totalLowTokens += tokens;
      lowCount++;
    }
  }

  // Select model based on HIGH priority total
  const selectedModel = selectAnalysisModel(totalHighTokens);

  // Get budget for HIGH priority based on model
  const highBudget = getDefaultHighBudget(selectedModel);

  // Calculate LOW budget
  // LOW gets minimum budget or remainder, whichever is greater
  const lowBudget = calculateLowBudget(selectedModel, totalLowTokens);

  return {
    total_high_priority_tokens: totalHighTokens,
    total_low_priority_tokens: totalLowTokens,
    selected_model: selectedModel,
    high_budget: highBudget,
    low_budget: lowBudget,
    high_priority_count: highCount,
    low_priority_count: lowCount,
  };
}

/**
 * Calculate LOW priority budget based on model and document total.
 *
 * Strategy:
 * - Always allocate at least MIN_LOW_BUDGET (20K)
 * - If LOW docs are small, use DEFAULT_LOW_BUDGET (40K)
 * - If LOW docs exceed default, allocate up to their total (capped by model limits)
 */
function calculateLowBudget(model: AnalysisModel, totalLowTokens: number): number {
  // Minimum floor for LOW priority
  if (totalLowTokens <= MIN_LOW_BUDGET) {
    return MIN_LOW_BUDGET;
  }

  // Default allocation for reasonable LOW totals
  if (totalLowTokens <= DEFAULT_LOW_BUDGET) {
    return DEFAULT_LOW_BUDGET;
  }

  // For larger LOW totals, cap based on model context
  // oss-120b: max 48K for LOW (128K - 80K HIGH)
  // gemini-flash: max 600K for LOW (1M - 400K HIGH)
  const maxLowBudget = model === 'oss-120b' ? 48_000 : 600_000;

  return Math.min(totalLowTokens, maxLowBudget);
}

/**
 * Create default allocation when no priorities exist.
 * Uses conservative defaults with oss-120b model.
 */
function createDefaultAllocation(courseId: string): BudgetAllocation {
  return {
    course_id: courseId,
    total_high_priority_tokens: 0,
    total_low_priority_tokens: 0,
    selected_model: 'oss-120b',
    high_budget: DEFAULT_HIGH_BUDGET_OSS,
    low_budget: MIN_LOW_BUDGET,
    allocated_at: new Date(),
  };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Check if a document should use full-text processing.
 *
 * @param docTokenCount - Document token count
 * @param budget - Allocated budget for the document
 * @returns true if document fits within budget
 */
export function shouldUseFullText(docTokenCount: number, budget: number): boolean {
  return docTokenCount <= budget;
}

/**
 * Get model context window size.
 *
 * @param model - Analysis model type
 * @returns Maximum context window in tokens
 */
export function getModelContextWindow(model: AnalysisModel): number {
  return model === 'oss-120b' ? 128_000 : 1_000_000;
}

/**
 * Estimate compression ratio needed to fit document in budget.
 *
 * @param docTokenCount - Original document token count
 * @param budget - Target budget
 * @returns Compression ratio (0.0-1.0), 1.0 means no compression needed
 */
export function estimateCompressionRatio(docTokenCount: number, budget: number): number {
  if (docTokenCount <= budget) {
    return 1.0;
  }
  return budget / docTokenCount;
}
