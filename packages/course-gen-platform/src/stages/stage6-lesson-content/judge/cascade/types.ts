/**
 * Type definitions for cascade evaluation
 * @module stages/stage6-lesson-content/judge/cascade/types
 */

import type {
  JudgeVerdict,
  JudgeAggregatedResult,
  JudgeRecommendation,
  CriteriaScores,
} from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContentBody, RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { OSCQRRubric } from '@megacampus/shared-types';
import type { FactualVerificationResult, FactualVerificationConfig } from '../factual-verifier';

/**
 * Raw judge issue from LLM response (internal type)
 */
export interface RawJudgeIssue {
  criterion: string;
  severity: string;
  location: string;
  description: string;
  suggestedFix: string;
}

/**
 * Raw judge response from LLM (internal type)
 */
export interface RawJudgeResponse {
  overallScore: number;
  passed: boolean;
  confidence: string;
  criteriaScores: CriteriaScores;
  issues?: RawJudgeIssue[];
  strengths?: string[];
}

/**
 * Cascade evaluation stages
 */
export type CascadeStage = 'heuristic' | 'single_judge' | 'clev_voting';

/**
 * Heuristic thresholds for pre-filtering
 */
export interface HeuristicThresholds {
  /** Minimum word count (default: 500) */
  minWordCount: number;
  /** Maximum word count (default: 10000) */
  maxWordCount: number;
  /** Target Flesch-Kincaid grade level range (default: 8-12) */
  targetFleschKincaid: { min: number; max: number };
  /** Required section headers that must be present */
  requiredSections: string[];
  /** Minimum number of examples (default: 1) */
  minExamples: number;
  /** Minimum number of exercises (default: 1) */
  minExercises: number;
}

/**
 * Configuration for cascade evaluation
 */
export interface CascadeConfig {
  /** Heuristic thresholds for Stage 1 */
  heuristicThresholds: HeuristicThresholds;
  /** Confidence threshold for single judge to accept (default: 0.8) */
  singleJudgeConfidenceThreshold: number;
  /** Skip heuristic pre-filters (default: false) */
  skipHeuristics: boolean;
  /** Skip single judge and go directly to CLEV (default: false) */
  skipSingleJudge: boolean;
  /** Skip factual verification against RAG (default: false) */
  skipFactualVerification: boolean;
  /** Factual verification configuration */
  factualVerificationConfig: FactualVerificationConfig;
  /** Minimum factual accuracy score to pass (default: 0.6) */
  minFactualAccuracyScore: number;
  /** OSCQR rubric to use for evaluation */
  rubric?: OSCQRRubric;
}

/**
 * Results from heuristic pre-filter stage
 */
export interface HeuristicResults {
  /** Whether content passed all heuristic checks */
  passed: boolean;
  /** Actual word count */
  wordCount: number;
  /** Calculated Flesch-Kincaid grade level (0 if skipped for non-English) */
  fleschKincaid: number;
  /** Whether Flesch-Kincaid was skipped (non-English language) */
  fleschKincaidSkipped: boolean;
  /** Whether all required sections are present */
  sectionsPresent: boolean;
  /** List of missing required sections */
  missingSections: string[];
  /** Keyword coverage ratio (0-1) */
  keywordCoverage: number;
  /** Number of examples found */
  examplesCount: number;
  /** Number of exercises found */
  exercisesCount: number;
  /** Detailed failure reasons (blocking) */
  failureReasons: string[];
  /** Warnings (non-blocking, informational) */
  warnings: string[];
}

/**
 * Input for cascade evaluation
 */
export interface CascadeEvaluationInput {
  /** Lesson content to evaluate */
  lessonContent: LessonContentBody;
  /** Lesson specification for context */
  lessonSpec: LessonSpecificationV2;
  /** RAG chunks used in generation for fact verification */
  ragChunks: RAGChunk[];
  /** Content language for judge selection */
  language?: string;
}

/**
 * Result from cascade evaluation
 */
export interface CascadeResult {
  /** Which stage produced the final result */
  stage: CascadeStage;
  /** Whether content passed evaluation */
  passed: boolean;
  /** Results from heuristic stage (if run) */
  heuristicResults?: HeuristicResults;
  /** Results from factual verification against RAG (if run) */
  factualVerificationResult?: FactualVerificationResult;
  /** Single judge verdict (if run) */
  singleJudgeVerdict?: JudgeVerdict;
  /** CLEV voting result (if run) */
  clevResult?: JudgeAggregatedResult;
  /** Final overall score (0-1) */
  finalScore: number;
  /** Final recommendation */
  finalRecommendation: JudgeRecommendation;
  /** Total tokens used across all stages */
  totalTokensUsed: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Cost savings achieved by cascade (0-1) */
  costSavingsRatio: number;
}
