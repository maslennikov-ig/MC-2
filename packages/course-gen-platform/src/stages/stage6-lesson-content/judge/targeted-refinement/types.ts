import type {
  ArbiterOutput,
  OperationMode,
  RefinementStatus,
  BestEffortResult,
  IterationResult,
  RefinementEvent,
  LessonContent,
  JudgeIssue,
  RAGChunk,
  LessonSpecificationV2,
} from '@megacampus/shared-types';
import type { LLMCallFn } from '../patcher';
import type { IterationHistoryEntry } from '../fix-templates';

/**
 * Input for executeTargetedRefinement
 */
export interface TargetedRefinementInput {
  /** Initial lesson content to refine */
  content: LessonContent;
  /** Consolidated arbiter output with refinement plan */
  arbiterOutput: ArbiterOutput;
  /** Operation mode (full-auto or semi-auto) */
  operationMode: OperationMode;
  /** Optional LLM call function for dependency injection */
  llmCall?: LLMCallFn;
  /** Optional streaming callback for progress updates */
  onStreamEvent?: (event: RefinementEvent) => void;
  /** Optional RAG chunks for fact grounding in Section-Expander */
  ragChunks?: RAGChunk[];
  /** Optional lesson specification with learning objectives */
  lessonSpec?: LessonSpecificationV2;
  /** Content language for generation (ISO 639-1 code: 'ru', 'en') */
  language?: string;
}

/**
 * Output from executeTargetedRefinement
 */
export interface TargetedRefinementOutput {
  /** Final refined content */
  content: LessonContent;
  /** Final status */
  status: RefinementStatus;
  /** Final score after refinement */
  finalScore: number;
  /** Total iterations performed */
  iterations: number;
  /** Total tokens used */
  tokensUsed: number;
  /** Total duration in ms */
  durationMs: number;
  /** Best effort result if applicable */
  bestEffortResult?: BestEffortResult;
}

/**
 * Internal state for refinement loop
 */
export interface RefinementState {
  iteration: number;
  scoreHistory: number[];
  contentHistory: IterationResult[];
  lockedSections: string[];
  sectionEditCount: Record<string, number>;
  qualityLocks: Record<string, number>;
  tokensUsed: number;
  startTime: number;
}

/**
 * Context passed to Patcher for iteration-aware prompts
 */
export interface IterationContext {
  score: number;
  iteration: number;
  issues: JudgeIssue[];
  iterationHistory?: IterationHistoryEntry[];
  lessonSpec?: LessonSpecificationV2;
  strengths?: string[];
  /** Content language for token budget calculation (ISO 639-1 code: 'ru', 'en', 'zh') */
  language?: string;
}
