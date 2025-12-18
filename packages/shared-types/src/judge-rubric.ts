/**
 * OSCQR-based Evaluation Rubric Types for LLM Judge
 * @module judge-rubric
 *
 * Provides type definitions and Zod schemas for the LLM Judge evaluation system
 * based on OSCQR (Online Student Course Quality Rubric) standards.
 *
 * The judge uses 6 criteria with empirically-determined weights and reliability scores:
 * - Learning Objective Alignment (25%) - High reliability 80-85%
 * - Pedagogical Structure (20%) - High reliability 85%+
 * - Factual Accuracy (15%) - Low reliability without RAG, requires grounding
 * - Clarity/Readability (15%) - Very high reliability 90%+
 * - Engagement/Examples (15%) - High reliability 80%+
 * - Completeness (10%) - Moderate reliability 75-80%
 */

import { z } from 'zod';

// ============================================================================
// Bloom's Taxonomy and Depth Expectations
// ============================================================================

/**
 * Bloom's Taxonomy cognitive levels (revised 2001)
 * Ordered from lower-order to higher-order thinking skills
 */
export const BloomsTaxonomyLevelSchema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
]);

/**
 * Bloom's Taxonomy Level type
 */
export type BloomsTaxonomyLevel = z.infer<typeof BloomsTaxonomyLevelSchema>;

/**
 * Expected depth of content coverage
 */
export const DepthExpectationSchema = z.enum(['introductory', 'intermediate', 'advanced']);

/**
 * Depth Expectation type
 */
export type DepthExpectation = z.infer<typeof DepthExpectationSchema>;

// ============================================================================
// Judge Criteria
// ============================================================================

/**
 * Judge evaluation criteria based on OSCQR standards
 *
 * Each criterion maps to specific quality aspects:
 * - learning_objective_alignment: Content matches stated learning objectives
 * - pedagogical_structure: Logical flow, scaffolding, concept building
 * - factual_accuracy: Correctness of information (requires RAG grounding)
 * - clarity_readability: Clear language, appropriate level, accessibility
 * - engagement_examples: Practical examples, real-world applications
 * - completeness: Coverage of required topics, no gaps
 */
export const JudgeCriterionSchema = z.enum([
  'learning_objective_alignment',
  'pedagogical_structure',
  'factual_accuracy',
  'clarity_readability',
  'engagement_examples',
  'completeness',
]);

/**
 * Judge Criterion type
 */
export type JudgeCriterion = z.infer<typeof JudgeCriterionSchema>;

/**
 * Reliability level for criteria
 * Indicates how consistently LLMs can evaluate this criterion
 */
export const ReliabilityLevelSchema = z.enum(['very_high', 'high', 'moderate', 'low']);

/**
 * Reliability Level type
 */
export type ReliabilityLevel = z.infer<typeof ReliabilityLevelSchema>;

// ============================================================================
// Criterion Configuration
// ============================================================================

/**
 * Configuration for a single evaluation criterion
 */
export const CriterionConfigSchema = z.object({
  /** The criterion being configured */
  criterion: JudgeCriterionSchema,

  /** Weight of this criterion (0-1, all weights must sum to 1.0) */
  weight: z.number().min(0).max(1),

  /** Reliability level based on empirical LLM evaluation consistency */
  reliability: ReliabilityLevelSchema,

  /** Whether this criterion requires RAG grounding for accurate evaluation */
  requiresRag: z.boolean(),

  /** Human-readable description of what this criterion evaluates */
  description: z.string().min(10),

  /** Specific points to evaluate for this criterion */
  evaluationPoints: z.array(z.string().min(5)).min(2),
});

/**
 * Criterion Configuration type
 */
export type CriterionConfig = z.infer<typeof CriterionConfigSchema>;

/**
 * Criterion weight mapping type
 * Maps each criterion to its weight (0-1)
 */
export const CriterionWeightSchema = z.record(JudgeCriterionSchema, z.number().min(0).max(1));

/**
 * Criterion Weight type
 */
export type CriterionWeight = z.infer<typeof CriterionWeightSchema>;

// ============================================================================
// OSCQR Rubric
// ============================================================================

/**
 * Complete OSCQR-based rubric configuration
 */
export const OSCQRRubricSchema = z.object({
  /** Rubric version for tracking changes */
  version: z.string().min(1),

  /** Human-readable rubric name */
  name: z.string().min(1),

  /** Rubric description */
  description: z.string().min(10),

  /** Configuration for each criterion */
  criteria: z.array(CriterionConfigSchema).min(1),

  /** Minimum overall score to pass (0-1) */
  passingThreshold: z.number().min(0).max(1),

  /** Minimum score per criterion to pass (0-1) */
  criterionPassingThreshold: z.number().min(0).max(1),
});

/**
 * OSCQR Rubric type
 */
export type OSCQRRubric = z.infer<typeof OSCQRRubricSchema>;

// ============================================================================
// Default OSCQR Rubric Configuration
// ============================================================================

/**
 * Default OSCQR-based evaluation rubric
 *
 * Weights and reliability scores are based on empirical research:
 * - Learning Objective Alignment (25%) - High reliability 80-85%
 * - Pedagogical Structure (20%) - High reliability 85%+
 * - Factual Accuracy (15%) - Low reliability without RAG
 * - Clarity/Readability (15%) - Very high reliability 90%+
 * - Engagement/Examples (15%) - High reliability 80%+
 * - Completeness (10%) - Moderate reliability 75-80%
 */
export const DEFAULT_OSCQR_RUBRIC: OSCQRRubric = {
  version: '1.0.0',
  name: 'OSCQR-Based Content Evaluation Rubric',
  description:
    'Evaluation rubric for AI-generated educational content based on OSCQR (Online Student Course Quality Rubric) standards with empirically-determined weights.',
  criteria: [
    {
      criterion: 'learning_objective_alignment',
      weight: 0.25,
      reliability: 'high',
      requiresRag: false,
      description:
        'Evaluates how well the generated content aligns with stated learning objectives and outcomes.',
      evaluationPoints: [
        'Content directly addresses each stated learning objective',
        'Examples and exercises reinforce learning objectives',
        'Assessment activities measure stated outcomes',
        'No significant deviations from intended learning goals',
        'Appropriate cognitive level alignment (Blooms Taxonomy)',
      ],
    },
    {
      criterion: 'pedagogical_structure',
      weight: 0.2,
      reliability: 'high',
      requiresRag: false,
      description:
        'Assesses the logical flow, scaffolding, and concept building throughout the content.',
      evaluationPoints: [
        'Clear introduction establishes context and relevance',
        'Concepts build logically from simple to complex',
        'Appropriate scaffolding supports learning progression',
        'Smooth transitions between topics and sections',
        'Summary or review reinforces key concepts',
        'Prerequisites are addressed or acknowledged',
      ],
    },
    {
      criterion: 'factual_accuracy',
      weight: 0.15,
      reliability: 'low',
      requiresRag: true,
      description:
        'Verifies correctness of information against source materials. Requires RAG grounding for reliable evaluation.',
      evaluationPoints: [
        'Technical facts are correct and up-to-date',
        'No contradictions with source materials',
        'Terminology used correctly and consistently',
        'Claims are supported by provided evidence',
        'No hallucinated or fabricated information',
      ],
    },
    {
      criterion: 'clarity_readability',
      weight: 0.15,
      reliability: 'very_high',
      requiresRag: false,
      description:
        'Evaluates clear language usage, appropriate level, and accessibility of the content.',
      evaluationPoints: [
        'Language is clear and unambiguous',
        'Vocabulary appropriate for target audience',
        'Sentence structure supports comprehension',
        'Technical terms are defined when introduced',
        'Content is well-organized with clear headings',
        'Paragraphs focus on single ideas',
      ],
    },
    {
      criterion: 'engagement_examples',
      weight: 0.15,
      reliability: 'high',
      requiresRag: false,
      description:
        'Assesses use of practical examples, real-world applications, and engagement strategies.',
      evaluationPoints: [
        'Relevant real-world examples illustrate concepts',
        'Examples are relatable to target audience',
        'Variety of example types (scenarios, case studies, demonstrations)',
        'Interactive elements encourage active learning',
        'Examples progress in complexity appropriately',
      ],
    },
    {
      criterion: 'completeness',
      weight: 0.1,
      reliability: 'moderate',
      requiresRag: false,
      description: 'Checks coverage of required topics with no significant gaps in content.',
      evaluationPoints: [
        'All specified topics are covered',
        'No unexplained gaps in content',
        'Appropriate depth for each topic',
        'Edge cases and exceptions addressed where relevant',
        'Content meets minimum length/duration requirements',
      ],
    },
  ],
  passingThreshold: 0.7,
  criterionPassingThreshold: 0.5,
} as const;

// ============================================================================
// Evaluation Result Types
// ============================================================================

/**
 * Individual criterion evaluation result
 */
export const CriterionEvaluationResultSchema = z.object({
  /** The criterion evaluated */
  criterion: JudgeCriterionSchema,

  /** Score for this criterion (0-1) */
  score: z.number().min(0).max(1),

  /** Whether this criterion passed the threshold */
  passed: z.boolean(),

  /** Detailed feedback for this criterion */
  feedback: z.string().min(10),

  /** Specific issues found (if any) */
  issues: z.array(z.string()).optional(),

  /** Specific strengths found (if any) */
  strengths: z.array(z.string()).optional(),

  /** Whether RAG grounding was used for this evaluation */
  ragGrounded: z.boolean().optional(),
});

/**
 * Criterion Evaluation Result type
 */
export type CriterionEvaluationResult = z.infer<typeof CriterionEvaluationResultSchema>;

/**
 * Complete evaluation result from the Judge
 */
export const JudgeEvaluationResultSchema = z.object({
  /** Overall weighted score (0-1) */
  overallScore: z.number().min(0).max(1),

  /** Whether the content passed overall */
  passed: z.boolean(),

  /** Individual criterion results */
  criterionResults: z.array(CriterionEvaluationResultSchema),

  /** Overall feedback summary */
  overallFeedback: z.string().min(20),

  /** Recommendations for improvement */
  recommendations: z.array(z.string()).optional(),

  /** Rubric version used for evaluation */
  rubricVersion: z.string(),

  /** Evaluation metadata */
  metadata: z.object({
    /** Evaluation duration in milliseconds */
    durationMs: z.number().int().nonnegative(),
    /** Model used for evaluation */
    modelUsed: z.string(),
    /** Token usage */
    tokens: z.object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    /** Timestamp of evaluation */
    evaluatedAt: z.string().datetime(),
  }),
});

/**
 * Judge Evaluation Result type
 */
export type JudgeEvaluationResult = z.infer<typeof JudgeEvaluationResultSchema>;

// ============================================================================
// Evaluation Input Types
// ============================================================================

/**
 * Input for Judge evaluation
 */
export const JudgeEvaluationInputSchema = z.object({
  /** Content to evaluate */
  content: z.string().min(100),

  /** Learning objectives the content should align with */
  learningObjectives: z.array(z.string().min(5)).min(1),

  /** Expected Bloom's Taxonomy level */
  expectedBloomsLevel: BloomsTaxonomyLevelSchema.optional(),

  /** Expected depth of coverage */
  expectedDepth: DepthExpectationSchema.optional(),

  /** Target audience level */
  targetAudience: z.enum(['beginner', 'intermediate', 'advanced', 'mixed']).optional(),

  /** Source materials for RAG grounding (file_catalog IDs or content) */
  sourceMaterials: z.array(z.string()).optional(),

  /** Custom rubric (uses default if not provided) */
  customRubric: OSCQRRubricSchema.optional(),

  /** Specific criteria to evaluate (evaluates all if not provided) */
  criteriaToEvaluate: z.array(JudgeCriterionSchema).optional(),
});

/**
 * Judge Evaluation Input type
 */
export type JudgeEvaluationInput = z.infer<typeof JudgeEvaluationInputSchema>;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates that criterion weights sum to 1.0 (with tolerance for floating point)
 */
export function validateCriteriaWeights(criteria: CriterionConfig[]): boolean {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  return Math.abs(totalWeight - 1.0) < 0.001;
}

/**
 * Gets the default weight for a criterion from DEFAULT_OSCQR_RUBRIC
 */
export function getDefaultCriterionWeight(criterion: JudgeCriterion): number {
  const config = DEFAULT_OSCQR_RUBRIC.criteria.find((c) => c.criterion === criterion);
  return config?.weight ?? 0;
}

/**
 * Checks if a criterion requires RAG grounding
 */
export function criterionRequiresRag(criterion: JudgeCriterion): boolean {
  const config = DEFAULT_OSCQR_RUBRIC.criteria.find((c) => c.criterion === criterion);
  return config?.requiresRag ?? false;
}
