/**
 * Document Prioritization Types and Schemas
 * @module @megacampus/shared-types/document-prioritization
 *
 * Provides types and Zod validation schemas for document classification
 * and token budget allocation in the Stage 2-3 pipeline.
 *
 * Key entities:
 * - DocumentPriority: Classification result for uploaded documents
 * - BudgetAllocation: Token budget allocation for document processing
 */

import { z } from 'zod';

// ============================================================================
// Enums and Literal Types
// ============================================================================

/**
 * Priority level based on importance score
 *
 * Threshold: importance_score >= 0.7 = HIGH, otherwise LOW
 */
export const PriorityLevelSchema = z.enum(['HIGH', 'LOW']);

export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;

/**
 * Document priority level for comparative classification
 *
 * Priority levels for comparative document ranking:
 * - CORE: The single most important document (exactly 1 per course)
 * - IMPORTANT: Key supporting documents (up to 30% of total documents)
 * - SUPPLEMENTARY: Additional materials (remaining documents)
 *
 * This schema is used for comparative classification where documents
 * are ranked against each other, rather than independently scored.
 */
export const DocumentPriorityLevelSchema = z.enum(['CORE', 'IMPORTANT', 'SUPPLEMENTARY']);

export type DocumentPriorityLevel = z.infer<typeof DocumentPriorityLevelSchema>;

/**
 * Analysis model selection based on token budget
 *
 * Model selection logic:
 * - oss-120b: When HIGH priority total <= 80K tokens (128K context window)
 * - gemini-flash: When HIGH priority total > 80K tokens (1M context window)
 */
export const AnalysisModelSchema = z.enum(['oss-120b', 'gemini-flash']);

export type AnalysisModel = z.infer<typeof AnalysisModelSchema>;

// ============================================================================
// Constants
// ============================================================================

/**
 * Importance score threshold for HIGH priority classification
 */
export const HIGH_PRIORITY_THRESHOLD = 0.7;

/**
 * Token threshold for model selection (80K tokens)
 */
export const MODEL_SELECTION_THRESHOLD_TOKENS = 80_000;

/**
 * Default token budgets by model
 */
export const DEFAULT_HIGH_BUDGET_OSS = 80_000;
export const DEFAULT_HIGH_BUDGET_GEMINI = 400_000;

// ============================================================================
// Document Priority Schema
// ============================================================================

/**
 * Base Document Priority Zod Schema (without refinements)
 *
 * Validates classification result for uploaded documents.
 *
 * Validation rules:
 * - importance_score: Must be in [0.0, 1.0]
 * - priority: HIGH (>= 0.7) or LOW (< 0.7)
 * - order: Must be positive integer (unique within course)
 * - classification_rationale: Non-empty string explaining LLM reasoning
 */
const DocumentPriorityBaseSchema = z.object({
  /** Foreign key to uploaded_documents table */
  file_id: z.string().uuid('file_id must be a valid UUID'),

  /** Classification result: HIGH (>= 0.7) or LOW (< 0.7) */
  priority: PriorityLevelSchema,

  /**
   * Comparative priority level: CORE | IMPORTANT | SUPPLEMENTARY
   * Used for UI display and stored in file_catalog.priority column
   * Optional for backward compatibility with independent classification
   */
  priority_level: DocumentPriorityLevelSchema.optional(),

  /**
   * Importance score from LLM classification
   * Range: 0.0 to 1.0
   * HIGH threshold: >= 0.7
   */
  importance_score: z
    .number()
    .min(0.0, 'importance_score must be >= 0.0')
    .max(1.0, 'importance_score must be <= 1.0'),

  /**
   * Processing order within course (1-N)
   * Must be unique within course (enforced at application level)
   */
  order: z.number().int().positive('order must be a positive integer'),

  /** LLM reasoning for classification decision */
  classification_rationale: z
    .string()
    .min(10, 'classification_rationale must be at least 10 characters'),

  /** Timestamp when classification was performed */
  classified_at: z.coerce.date(),
});

/**
 * Document Priority Zod Schema with validation refinement
 *
 * Includes refinement to validate priority matches importance_score threshold
 */
export const DocumentPrioritySchema = DocumentPriorityBaseSchema.refine(
  (data) => {
    // Validate priority matches importance_score threshold
    const expectedPriority = data.importance_score >= HIGH_PRIORITY_THRESHOLD ? 'HIGH' : 'LOW';
    return data.priority === expectedPriority;
  },
  {
    message: `priority must match importance_score threshold (>= ${HIGH_PRIORITY_THRESHOLD} = HIGH, < ${HIGH_PRIORITY_THRESHOLD} = LOW)`,
    path: ['priority'],
  }
);

/**
 * Document Priority interface
 * Inferred from Zod schema for type safety
 */
export type DocumentPriority = z.infer<typeof DocumentPrioritySchema>;

/**
 * Document Priority input schema (without classified_at for creation)
 *
 * Uses base schema to allow omit/extend operations
 */
export const DocumentPriorityInputSchema = DocumentPriorityBaseSchema.omit({
  classified_at: true,
})
  .extend({
    classified_at: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      const expectedPriority = data.importance_score >= HIGH_PRIORITY_THRESHOLD ? 'HIGH' : 'LOW';
      return data.priority === expectedPriority;
    },
    {
      message: `priority must match importance_score threshold (>= ${HIGH_PRIORITY_THRESHOLD} = HIGH, < ${HIGH_PRIORITY_THRESHOLD} = LOW)`,
      path: ['priority'],
    }
  );

export type DocumentPriorityInput = z.infer<typeof DocumentPriorityInputSchema>;

// ============================================================================
// Budget Allocation Schema
// ============================================================================

/**
 * Base Budget Allocation Zod Schema (without refinements)
 *
 * Validates token budget allocation for document processing.
 *
 * Model selection logic:
 * - IF total_high_priority_tokens <= 80,000:
 *   - selected_model = 'oss-120b'
 *   - high_budget = 80,000
 * - ELSE:
 *   - selected_model = 'gemini-flash'
 *   - high_budget = 400,000
 */
const BudgetAllocationBaseSchema = z.object({
  /** Course UUID */
  course_id: z.string().uuid('course_id must be a valid UUID'),

  /** Sum of tokens from HIGH priority documents */
  total_high_priority_tokens: z
    .number()
    .int()
    .nonnegative('total_high_priority_tokens must be >= 0'),

  /** Sum of tokens from LOW priority documents */
  total_low_priority_tokens: z
    .number()
    .int()
    .nonnegative('total_low_priority_tokens must be >= 0'),

  /**
   * Selected analysis model based on 80K threshold
   * - oss-120b: HIGH total <= 80K (128K context)
   * - gemini-flash: HIGH total > 80K (1M context)
   */
  selected_model: AnalysisModelSchema,

  /** Token budget allocated to HIGH priority documents */
  high_budget: z.number().int().nonnegative('high_budget must be >= 0'),

  /** Token budget allocated to LOW priority documents */
  low_budget: z.number().int().nonnegative('low_budget must be >= 0'),

  /** Timestamp when allocation was performed */
  allocated_at: z.coerce.date(),
});

/**
 * Budget Allocation Zod Schema with validation refinement
 *
 * Includes refinement to validate model selection matches token threshold
 */
export const BudgetAllocationSchema = BudgetAllocationBaseSchema.refine(
  (data) => {
    // Validate model selection matches token threshold
    const expectedModel =
      data.total_high_priority_tokens <= MODEL_SELECTION_THRESHOLD_TOKENS
        ? 'oss-120b'
        : 'gemini-flash';
    return data.selected_model === expectedModel;
  },
  {
    message: `selected_model must match token threshold (HIGH total <= ${MODEL_SELECTION_THRESHOLD_TOKENS} = oss-120b, > ${MODEL_SELECTION_THRESHOLD_TOKENS} = gemini-flash)`,
    path: ['selected_model'],
  }
);

/**
 * Budget Allocation interface
 * Inferred from Zod schema for type safety
 */
export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;

/**
 * Budget Allocation input schema (without allocated_at for creation)
 *
 * Uses base schema to allow omit/extend operations
 */
export const BudgetAllocationInputSchema = BudgetAllocationBaseSchema.omit({
  allocated_at: true,
})
  .extend({
    allocated_at: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      const expectedModel =
        data.total_high_priority_tokens <= MODEL_SELECTION_THRESHOLD_TOKENS
          ? 'oss-120b'
          : 'gemini-flash';
      return data.selected_model === expectedModel;
    },
    {
      message: `selected_model must match token threshold (HIGH total <= ${MODEL_SELECTION_THRESHOLD_TOKENS} = oss-120b, > ${MODEL_SELECTION_THRESHOLD_TOKENS} = gemini-flash)`,
      path: ['selected_model'],
    }
  );

export type BudgetAllocationInput = z.infer<typeof BudgetAllocationInputSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determines priority level from importance score
 *
 * @param importanceScore - Score from 0.0 to 1.0
 * @returns 'HIGH' if score >= 0.7, 'LOW' otherwise
 */
export function getPriorityLevel(importanceScore: number): PriorityLevel {
  return importanceScore >= HIGH_PRIORITY_THRESHOLD ? 'HIGH' : 'LOW';
}

/**
 * Selects analysis model based on total HIGH priority tokens
 *
 * @param totalHighPriorityTokens - Sum of tokens from HIGH priority docs
 * @returns 'oss-120b' if <= 80K, 'gemini-flash' otherwise
 */
export function selectAnalysisModel(totalHighPriorityTokens: number): AnalysisModel {
  return totalHighPriorityTokens <= MODEL_SELECTION_THRESHOLD_TOKENS ? 'oss-120b' : 'gemini-flash';
}

/**
 * Calculates default high budget based on selected model
 *
 * @param model - Selected analysis model
 * @returns Default high budget (80K for oss-120b, 400K for gemini-flash)
 */
export function getDefaultHighBudget(model: AnalysisModel): number {
  return model === 'oss-120b' ? DEFAULT_HIGH_BUDGET_OSS : DEFAULT_HIGH_BUDGET_GEMINI;
}

/**
 * Creates a BudgetAllocation object with automatic model selection
 *
 * @param courseId - Course UUID
 * @param totalHighTokens - Total tokens from HIGH priority documents
 * @param totalLowTokens - Total tokens from LOW priority documents
 * @param lowBudget - Budget for LOW priority documents
 * @returns Complete BudgetAllocation object
 */
export function createBudgetAllocation(
  courseId: string,
  totalHighTokens: number,
  totalLowTokens: number,
  lowBudget: number
): BudgetAllocation {
  const selectedModel = selectAnalysisModel(totalHighTokens);
  const highBudget = getDefaultHighBudget(selectedModel);

  return {
    course_id: courseId,
    total_high_priority_tokens: totalHighTokens,
    total_low_priority_tokens: totalLowTokens,
    selected_model: selectedModel,
    high_budget: highBudget,
    low_budget: lowBudget,
    allocated_at: new Date(),
  };
}
