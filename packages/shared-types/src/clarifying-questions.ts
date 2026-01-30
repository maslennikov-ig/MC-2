/**
 * Clarifying Questions Types
 * @module shared-types/clarifying-questions
 *
 * Type definitions for Stage 4 Clarifying Questions feature.
 * Provides proper typing for JSONB columns and question structures.
 *
 * Database Schema:
 * - Table: clarifying_questions
 * - JSONB columns: user_answer, suggested_answers, metadata
 * - Migration: 20260127_question_types.sql
 */

import type { Database } from './database.types';

/**
 * Question types for different UI rendering modes
 */
export type QuestionType = 'open' | 'single_choice' | 'multi_choice';

/**
 * Question priority levels
 */
export type QuestionPriority = 'critical' | 'important' | 'nice_to_have';

/**
 * Question status
 */
export type QuestionStatus = 'pending' | 'answered' | 'skipped';

/**
 * Answer source tracking
 */
export type AnswerSource = 'suggested' | 'modified' | 'custom';

/**
 * User answer stored in JSONB format (user_answer column)
 *
 * Structure depends on question type:
 * - For open/single_choice: { value: "answer text" }
 * - For multi_choice: { values: ["option1", "option2"] }
 *
 * Example:
 * ```typescript
 * // Single answer
 * const singleAnswer: UserAnswerValue = { value: "Beginners with no prior experience" };
 *
 * // Multiple answers
 * const multiAnswer: UserAnswerValue = { values: ["Option A", "Option C"] };
 * ```
 */
export interface UserAnswerValue {
  /** Single answer for open/single_choice questions */
  value?: string;
  /** Multiple answers for multi_choice questions */
  values?: string[];
}

/**
 * Suggested answer structure (suggested_answers JSONB column)
 */
export interface SuggestedAnswer {
  /** The suggested answer text */
  text: string;
  /** Rationale explaining why this is suggested */
  rationale?: string;
  /** Flag indicating if this is the AI-recommended answer */
  is_recommended?: boolean;
}

/**
 * Metadata structure for multi_choice selections
 *
 * Stored in metadata JSONB column when question_type is multi_choice.
 * Contains the selected suggestion indexes for multi-answer questions.
 */
export interface QuestionMetadata {
  /** Selected suggestion indexes for multi_choice questions */
  selected_suggestion_indexes?: number[];
  /** Additional metadata fields can be added here */
  [key: string]: unknown;
}

/**
 * Clarifying Question Row with proper JSONB typing
 *
 * This interface extends the auto-generated database type with proper
 * JSONB structure typing. Use this instead of the raw database type
 * to get type safety for JSONB columns.
 *
 * IMPORTANT: This overrides the incorrect database.types.ts typing
 * where user_answer is typed as `string | null` instead of JSONB.
 */
export interface ClarifyingQuestionRow
  extends Omit<
    Database['public']['Tables']['clarifying_questions']['Row'],
    'user_answer' | 'suggested_answers' | 'metadata' | 'question_type'
  > {
  /** Question type determines UI rendering and answer structure */
  question_type: QuestionType;
  /** User's answer in structured JSONB format */
  user_answer: UserAnswerValue | null;
  /** AI-suggested answers with rationale */
  suggested_answers: SuggestedAnswer[] | null;
  /** Question metadata (includes multi_choice selection indexes) */
  metadata: QuestionMetadata | null;
}

/**
 * Type-safe Insert for clarifying questions
 */
export interface ClarifyingQuestionInsert
  extends Omit<
    Database['public']['Tables']['clarifying_questions']['Insert'],
    'user_answer' | 'suggested_answers' | 'metadata' | 'question_type'
  > {
  question_type?: QuestionType;
  user_answer?: UserAnswerValue | null;
  suggested_answers?: SuggestedAnswer[] | null;
  metadata?: QuestionMetadata | null;
}

/**
 * Type-safe Update for clarifying questions
 */
export interface ClarifyingQuestionUpdate
  extends Omit<
    Database['public']['Tables']['clarifying_questions']['Update'],
    'user_answer' | 'suggested_answers' | 'metadata' | 'question_type'
  > {
  question_type?: QuestionType;
  user_answer?: UserAnswerValue | null;
  suggested_answers?: SuggestedAnswer[] | null;
  metadata?: QuestionMetadata | null;
}

/**
 * Formatted answer for analysis job
 *
 * Used when passing clarifying answers to STRUCTURE_ANALYSIS job.
 * Simplifies the database structure for AI consumption.
 */
export interface FormattedClarifyingAnswer {
  /** The question text */
  question: string;
  /** The user's answer (extracted from JSONB) */
  answer: UserAnswerValue;
  /** Question priority level */
  priority: string;
  /** Question category (e.g., "target_audience", "content_scope") */
  category: string | null;
}

/**
 * Progress statistics for clarifying questions
 */
export interface ClarifyingProgress {
  /** Total number of questions */
  total: number;
  /** Number of answered questions */
  answered: number;
  /** Number of skipped questions */
  skipped: number;
  /** Number of pending questions */
  pending: number;
  /** Total critical questions */
  criticalTotal: number;
  /** Answered critical questions */
  criticalAnswered: number;
  /** Total important questions */
  importantTotal: number;
  /** Answered important questions */
  importantAnswered: number;
  /** Whether all required questions are answered */
  canProceed: boolean;
  /** @deprecated Always 1. Round 2 removed. */
  currentRound: number;
  /** Whether course is in automatic mode */
  isAutomatic: boolean;
}
