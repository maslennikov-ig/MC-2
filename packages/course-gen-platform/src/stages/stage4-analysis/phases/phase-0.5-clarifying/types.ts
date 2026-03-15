import { z } from 'zod';
import { createLLMEnumSchema } from '@megacampus/shared-types';
import type { Phase1Output } from '@megacampus/shared-types/analysis-result';
import type { Stage4BudgetAllocation } from '../stage4-budget-allocator.js';

/**
 * Question type determines UI rendering and answer validation
 * - open: Free text with AI recommendation
 * - single_choice: Select one option (radio buttons)
 * - multi_choice: Select multiple options (checkboxes)
 */
export const QuestionTypeSchema = z.enum(['open', 'single_choice', 'multi_choice']);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * Suggested answer for a clarifying question
 */
export const SuggestedAnswerSchema = z.object({
  text: z.string().min(5).max(500),
  rationale: z.string().min(10).max(300).default('Auto-generated rationale for this answer option'),
  is_recommended: z.boolean().optional(), // For open type: marks the AI-recommended answer
});

export type SuggestedAnswer = z.infer<typeof SuggestedAnswerSchema>;

/**
 * Normalize a single suggested answer from LLM output.
 * Handles strings, arrays, and malformed objects that LLMs sometimes produce.
 */
export function normalizeSuggestedAnswer(val: unknown): unknown {
  if (val && typeof val === 'object' && !Array.isArray(val) && 'text' in val) {
    const obj = val as Record<string, unknown>;
    // Ensure rationale exists — LLMs sometimes omit it
    if (!obj.rationale || typeof obj.rationale !== 'string' || obj.rationale.length < 10) {
      return {
        ...obj,
        rationale:
          obj.rationale && typeof obj.rationale === 'string'
            ? `${obj.rationale} (auto-completed rationale)`
            : 'Auto-generated rationale for this answer option',
      };
    }
    return val;
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const text = val.length >= 5 ? val : `${val} (вариант ответа)`;
    return { text, rationale: 'Auto-generated rationale', is_recommended: false };
  }
  if (Array.isArray(val) && val.length > 0) {
    const raw = String(val[0]);
    const text = raw.length >= 5 ? raw : `${raw} (вариант ответа)`;
    return { text, rationale: 'Auto-generated rationale', is_recommended: false };
  }
  return null;
}

/**
 * Single clarifying question with metadata
 */
export const ClarifyingQuestionSchema = z.object({
  question_text: z.string().min(10).max(500),
  question_type: z.preprocess(
    val => (val === null || val === undefined ? undefined : val),
    QuestionTypeSchema.default('open')
  ),
  question_priority: z.preprocess(
    val => (val === null || val === undefined ? 'important' : val),
    createLLMEnumSchema(
      ['critical', 'important', 'nice_to_have'] as const,
      {
        essential: 'critical',
        'must-have': 'critical',
        urgent: 'critical',
        high: 'critical',
        mandatory: 'critical',
        significant: 'important',
        needed: 'important',
        medium: 'important',
        useful: 'important',
        optional: 'nice_to_have',
        low: 'nice_to_have',
        bonus: 'nice_to_have',
        supplementary: 'nice_to_have',
        extra: 'nice_to_have',
      },
      'questionPriority'
    )
  ),
  question_category: z.preprocess(
    val => (val === null || val === undefined ? 'content_structure' : val),
    createLLMEnumSchema(
      [
        'company_context',
        'audience',
        'expected_outcomes',
        'content_structure',
        'focus_priorities',
        'business_goals',
        'practical_application',
        'constraints',
      ] as const,
      {
        company: 'company_context',
        organization: 'company_context',
        corporate: 'company_context',
        employer: 'company_context',
        learners: 'audience',
        students: 'audience',
        users: 'audience',
        target: 'audience',
        outcomes: 'expected_outcomes',
        results: 'expected_outcomes',
        goals: 'expected_outcomes',
        objectives: 'expected_outcomes',
        structure: 'content_structure',
        format: 'content_structure',
        layout: 'content_structure',
        arrangement: 'content_structure',
        focus: 'focus_priorities',
        priorities: 'focus_priorities',
        emphasis: 'focus_priorities',
        key_areas: 'focus_priorities',
        business: 'business_goals',
        commercial: 'business_goals',
        revenue: 'business_goals',
        roi: 'business_goals',
        practical: 'practical_application',
        'hands-on': 'practical_application',
        'real-world': 'practical_application',
        applied: 'practical_application',
        limits: 'constraints',
        restrictions: 'constraints',
        requirements: 'constraints',
        boundaries: 'constraints',
      },
      'questionCategory'
    )
  ),
  suggested_answers: z.preprocess(val => {
    if (val === null || val === undefined) return [];
    if (!Array.isArray(val)) return val;
    return val
      .map(normalizeSuggestedAnswer)
      .filter(a => a !== null)
      .slice(0, 6);
  }, z.array(SuggestedAnswerSchema).min(2).max(6)),
});

export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

/**
 * LLM output schema for clarifying questions generation
 */
export const ClarifyingOutputSchema = z.object({
  questions: z.array(ClarifyingQuestionSchema).min(3).max(50),
});

export type ClarifyingOutput = z.infer<typeof ClarifyingOutputSchema>;

/**
 * Course context schema
 */
export const CourseContextSchema = z.object({
  title: z.string().min(1, 'Course title is required'),
  description: z.string().optional(),
  target_audience: z.string().optional(),
});

/**
 * Input schema for Phase 0.5 Clarifying Questions
 */
export const Phase05InputSchema = z.object({
  /** Course UUID */
  course_id: z.string().uuid('Invalid course UUID'),

  /** Budget allocation from Stage 4 budget allocator (nullable when no documents) */
  budgetAllocation: z
    .custom<Stage4BudgetAllocation | null>(
      val => val === null || (typeof val === 'object' && 'documents' in val),
      { message: 'Invalid budget allocation object' }
    )
    .nullable(),

  /** Course context */
  courseContext: CourseContextSchema,

  /** Language code (ISO 639-1) */
  language: z.string().min(2).max(5),

  /** Document summaries from Stage 3 (reused from orchestrator, no extra DB calls) */
  document_summaries: z
    .array(
      z.object({
        file_name: z.string(),
        processed_content: z.string(),
      })
    )
    .optional(),

  /** Phase 1 classification output for data-driven question generation */
  phase1_output: z.custom<Phase1Output>().optional(),
});

export type Phase05Input = z.infer<typeof Phase05InputSchema>;

/**
 * Sufficiency verdict from LLM analysis of user answers
 */
export interface SufficiencyVerdict {
  /** Whether gathered information is sufficient to proceed */
  is_sufficient: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Identified information gaps */
  gaps: string[];
  /** Follow-up questions if not sufficient */
  follow_up_questions?: ClarifyingQuestion[];
}

export const SufficiencyVerdictSchema = z.object({
  is_sufficient: z.boolean(),
  confidence: z.number().min(0).max(1),
  gaps: z.array(z.string()),
  follow_up_questions: z.array(ClarifyingQuestionSchema).optional(),
});
