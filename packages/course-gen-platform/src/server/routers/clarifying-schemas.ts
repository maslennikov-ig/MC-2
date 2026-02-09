/**
 * Clarifying Questions Router - Zod Schemas & Rate Limit Config
 * @module server/routers/clarifying-schemas
 *
 * Extracted from clarifying.router.ts to keep the router file under 500 code lines.
 * Contains all Zod input schemas and rate limit configuration for
 * Stage 4 clarifying questions endpoints.
 */

import { z } from 'zod';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * MEDIUM-005: Text sanitization constants
 */
export const MAX_ANSWER_LENGTH = 5000;
export const MAX_WORD_COUNT = 1000;

// ============================================================================
// SANITIZATION
// ============================================================================

/**
 * MEDIUM-005: Text sanitization for answer inputs
 *
 * - Trims whitespace
 * - Collapses multiple spaces to single
 * - Removes control characters (except newlines for multi-line answers)
 * - Enforces hard character limit
 */
export function sanitizeAnswerText(text: string): string {
  return (
    text
      .trim()
      .replace(/[^\S\n]+/g, ' ') // Collapse spaces (preserve newlines)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n \r \t
      .slice(0, MAX_ANSWER_LENGTH)
  );
}

// ============================================================================
// RATE LIMIT CONFIG
// ============================================================================

/**
 * LOW-002: Rate limit configuration with documented rationale
 *
 * These values are tuned based on:
 * - Typical user behavior during clarifying questions phase
 * - Prevention of accidental DoS from UI bugs
 * - Balance between usability and server protection
 */
export const CLARIFYING_RATE_LIMITS = {
  /** Read operations - frequent polling allowed */
  GET_QUESTIONS: {
    requests: 60,
    windowSeconds: 60,
    rationale: 'Read-heavy endpoint, allow frequent polling for real-time updates',
  },
  /** Single answer submission */
  SUBMIT_ANSWER: {
    requests: 30,
    windowSeconds: 60,
    rationale: 'User typically answers 3-7 questions, allow burst with buffer for edits',
  },
  /** Batch answer submission */
  SUBMIT_BATCH: {
    requests: 10,
    windowSeconds: 60,
    rationale: 'Batch replaces multiple single calls, stricter limit',
  },
  /** Skip question */
  SKIP_QUESTION: {
    requests: 30,
    windowSeconds: 60,
    rationale: 'Same as submit - users may skip multiple questions',
  },
  /** Job creation endpoint */
  APPROVE_AND_PROCEED: {
    requests: 10,
    windowSeconds: 60,
    rationale: 'Job creation endpoint - very strict to prevent duplicate jobs',
  },
} as const;

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for getQuestions endpoint
 */
export const getQuestionsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Schema for submitAnswer endpoint
 *
 * Supports three answer modes:
 * - suggested: User selected a suggested answer (requires selectedSuggestionIndex)
 * - modified: User modified a suggested answer (requires selectedSuggestionIndex + userModification)
 * - custom: User wrote a completely custom answer
 *
 * For multi_choice questions:
 * - Use answers (array) instead of answer (string)
 * - selectedSuggestionIndexes (array) instead of selectedSuggestionIndex
 */
export const submitAnswerSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  // MEDIUM-005: Stricter validation with sanitization
  // Single answer for open/single_choice
  answer: z
    .string()
    .transform(sanitizeAnswerText)
    .pipe(
      z
        .string()
        .min(3, 'Answer must be at least 3 characters')
        .max(MAX_ANSWER_LENGTH, `Answer too long (max ${MAX_ANSWER_LENGTH} characters)`)
        .refine(
          val => val.split(/\s+/).filter(Boolean).length <= MAX_WORD_COUNT,
          `Answer exceeds word limit (max ${MAX_WORD_COUNT} words)`
        )
    )
    .optional(),
  // Multiple answers for multi_choice
  answers: z
    .array(z.string().transform(sanitizeAnswerText).pipe(z.string().min(1).max(MAX_ANSWER_LENGTH)))
    .min(1, 'At least one answer required')
    .max(10, 'Too many answers')
    .optional(),
  answerSource: z.enum(['suggested', 'modified', 'custom']),
  selectedSuggestionIndex: z.number().int().min(0).optional(),
  // Multiple indexes for multi_choice
  selectedSuggestionIndexes: z.array(z.number().int().min(0)).optional(),
  userModification: z
    .string()
    .transform(sanitizeAnswerText)
    .pipe(
      z.string().max(MAX_ANSWER_LENGTH, `Modification too long (max ${MAX_ANSWER_LENGTH} chars)`)
    )
    .optional(),
});

/**
 * Schema for submitMultipleAnswers endpoint (batch)
 *
 * Allows submitting multiple answers in a single request.
 * Used by "Accept All" feature to avoid rate limiting issues.
 */
export const submitMultipleAnswersSchema = z.object({
  submissions: z
    .array(
      z.object({
        questionId: z.string().uuid('Invalid question ID'),
        // MEDIUM-005: Consistent sanitization in batch endpoint
        answer: z
          .string()
          .transform(sanitizeAnswerText)
          .pipe(z.string().min(1, 'Answer is required').max(MAX_ANSWER_LENGTH, 'Answer too long')),
        answerSource: z.enum(['suggested', 'modified', 'custom']),
        selectedSuggestionIndex: z.number().int().min(0).optional(),
      })
    )
    .min(1, 'At least one submission required')
    .max(20, 'Maximum 20 submissions per batch'),
});

/**
 * Schema for skipQuestion endpoint
 */
export const skipQuestionSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
});

/**
 * Schema for approveAndProceed endpoint
 */
export const approveAndProceedSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});
