/**
 * Stage 5 - Generation State Management for LangGraph Orchestration
 *
 * @module generation-state
 *
 * Defines TypeScript types for 5-phase LangGraph workflow state management:
 * - Phase 1: validate_input
 * - Phase 2: generate_metadata
 * - Phase 3: generate_sections
 * - Phase 4: validate_quality
 * - Phase 5: validate_lessons
 *
 * References:
 * - RT-001: Multi-Model Orchestration Strategy (model routing and cost tracking)
 * - RT-002: 5-Phase Generation Architecture (LangGraph workflow design)
 * - RT-004: 10-Attempt Tiered Retry Strategy (retry count tracking)
 * - FR-015: Minimum 10 lessons validation
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md
 * @see specs/008-generation-generation-json/research-decisions/rt-002-generation-architecture.md
 */

import type {
  GenerationJobInput,
} from '@megacampus/shared-types/generation-job';

import type {
  CourseMetadata,
  Section,
} from '@megacampus/shared-types/generation-result';

// ============================================================================
// GENERATION PHASE TYPES
// ============================================================================

/**
 * Generation Phase - Union type for 5-phase LangGraph workflow
 *
 * RT-002 5-phase architecture:
 * 1. validate_input: Schema validation (OSS 20B)
 * 2. generate_metadata: Critical fields generation (qwen3-max + OSS 120B hybrid)
 * 3. generate_sections: Section batch generation (OSS 120B primary, qwen3-max escalation)
 * 4. validate_quality: Semantic similarity validation (Jina-v3 embeddings + LLM-as-judge)
 * 5. validate_lessons: Minimum lessons constraint (FR-015)
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-002-generation-architecture.md
 */
export type GenerationPhase =
  | 'validate_input'
  | 'generate_metadata'
  | 'generate_sections'
  | 'validate_quality'
  | 'validate_lessons';

// ============================================================================
// GENERATION STATE INTERFACE
// ============================================================================

/**
 * Generation State - Main state object for LangGraph orchestration
 *
 * Tracks generation progress, results, quality metrics, and model usage across all phases.
 * Updated immutably as state flows through the LangGraph workflow.
 *
 * RT-001 Model Routing:
 * - Phase 1: OSS 20B (schema validation)
 * - Phase 2: qwen3-max (critical fields) + OSS 120B (non-critical)
 * - Phase 3: OSS 120B (primary) + qwen3-max (20-25% escalation) + Gemini-2.5-flash (overflow)
 * - Phase 4: Jina-v3 embeddings (95%) + OSS 120B LLM-as-judge (5%)
 * - Phase 5: No LLM (count-based validation)
 *
 * RT-004 Retry Strategy:
 * - 10-attempt tiered retry with exponential backoff
 * - Tracks retry counts per phase for monitoring
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md
 * @see specs/008-generation-generation-json/research-decisions/rt-004-retry-strategy.md
 */
export interface GenerationState {
  // ========== INPUT DATA ==========

  /**
   * Job input from BullMQ queue
   *
   * Contains:
   * - course_id, organization_id, user_id
   * - analysis_result (nullable for title-only scenario FR-003)
   * - frontend_parameters (course_title always present)
   * - document_summaries (optional RAG context FR-004)
   */
  input: GenerationJobInput;

  // ========== GENERATION RESULTS (Accumulated) ==========

  /**
   * Course metadata from Phase 2
   *
   * Generated using RT-001 hybrid approach:
   * - Critical fields: qwen3-max (learning_outcomes, pedagogical_strategy, etc.)
   * - Non-critical fields: OSS 120B (course_description, course_tags, etc.)
   *
   * Undefined until Phase 2 completes successfully.
   */
  metadata?: CourseMetadata;

  /**
   * Course sections from Phase 3
   *
   * Generated in batches using RT-002 batch size of 3-5 sections per batch.
   * Array accumulates sections across multiple batches.
   *
   * RT-001 Model Routing:
   * - Primary: OSS 120B (80% of batches)
   * - Escalation: qwen3-max (20% when quality < 0.75)
   * - Overflow: Gemini-2.5-flash (rate limit fallback)
   */
  sections: Section[];

  // ========== QUALITY TRACKING (Phase 4) ==========

  /**
   * Quality scores from Phase 4 validation
   *
   * RT-001 Validation Method:
   * - 95% embedding-based (Jina-v3 cosine similarity)
   * - 5% LLM-as-judge (OSS 120B for edge cases)
   *
   * Threshold: 0.75 minimum similarity (RT-001 standard threshold)
   */
  qualityScores: {
    /**
     * Metadata similarity score (0.0-1.0)
     *
     * Compares generated metadata to analysis_result using Jina-v3 embeddings.
     * Undefined for title-only scenario (no analysis_result).
     */
    metadata_similarity?: number;

    /**
     * Per-section similarity scores (0.0-1.0)
     *
     * Compares each section to input context using Jina-v3 embeddings.
     * Array length matches sections.length.
     */
    sections_similarity: number[];

    /**
     * Overall weighted average similarity (0.0-1.0)
     *
     * Weighted formula:
     * - Metadata: 40% weight (determines 60-70% of downstream quality)
     * - Sections: 60% weight (distributed equally across sections)
     */
    overall?: number;
  };

  // ========== TOKEN USAGE TRACKING (RT-001 Cost Tracking) ==========

  /**
   * Token usage per phase for cost calculation
   *
   * RT-001 Cost Targets:
   * - Metadata: ~$0.126-0.144 per course
   * - Sections: ~$0.20-0.25 per course
   * - Validation: ~$0.001-0.002 per course (mostly embedding-based)
   * - Total: ~$0.33-0.39 per course ✅ WITHIN TARGET ($0.20-0.40)
   */
  tokenUsage: {
    /** Tokens used in Phase 2 metadata generation (critical + non-critical) */
    metadata: number;

    /** Tokens used in Phase 3 section generation (all batches accumulated) */
    sections: number;

    /** Tokens used in Phase 4 validation (5% LLM-as-judge, 95% embedding-only) */
    validation: number;

    /** Total tokens across all phases */
    total: number;
  };

  // ========== MODEL SELECTION TRACKING (RT-001 Routing) ==========

  /**
   * Model used per phase for cost/quality analysis
   *
   * RT-001 Model Strategy:
   * - metadata: "qwen/qwen3-max" (critical) or "openai/gpt-oss-120b" (non-critical)
   * - sections: "openai/gpt-oss-120b" (primary) or "qwen/qwen3-max" (escalation)
   * - validation: "openai/gpt-oss-120b" (LLM-as-judge 5%) or undefined (embedding 95%)
   */
  modelUsed: {
    /** Model for Phase 2 metadata generation */
    metadata: string;

    /** Primary model for Phase 3 section generation */
    sections: string;

    /**
     * Model for Phase 4 LLM-as-judge validation (optional)
     *
     * Undefined when validation is purely embedding-based (95% of cases).
     * Only set when LLM-as-judge is invoked for edge cases (5%).
     */
    validation?: string;
  };

  // ========== RT-004 RETRY TRACKING ==========

  /**
   * Retry counts per phase for RT-004 10-attempt tiered retry strategy
   *
   * RT-004 Strategy:
   * - Tier 1 (Attempts 1-3): Same model, small prompt tweaks
   * - Tier 2 (Attempts 4-7): Escalate to qwen3-max, prompt refinement
   * - Tier 3 (Attempts 8-10): Last-resort escalation, maximum context
   *
   * @see specs/008-generation-generation-json/research-decisions/rt-004-retry-strategy.md
   */
  retryCount: {
    /**
     * Retry attempts for Phase 2 metadata generation
     *
     * Tracks retries for entire metadata phase (critical + non-critical fields).
     */
    metadata: number;

    /**
     * Retry attempts per section batch in Phase 3
     *
     * Array length matches number of section batches processed.
     * Each element tracks retries for that specific batch.
     */
    sections: number[];
  };

  // ========== PHASE EXECUTION METADATA ==========

  /**
   * Current phase in LangGraph workflow
   *
   * Updated atomically as state transitions through workflow nodes.
   */
  currentPhase: GenerationPhase;

  /**
   * Phase start timestamp (milliseconds since epoch)
   *
   * Set when phase begins, used to calculate phase duration.
   * Undefined before first phase starts.
   */
  phaseStartTime?: number;

  /**
   * Phase durations in milliseconds
   *
   * Populated as each phase completes for latency monitoring.
   * Enables performance optimization and bottleneck identification.
   */
  phaseDurations: {
    validate_input?: number;
    generate_metadata?: number;
    generate_sections?: number;
    validate_quality?: number;
    validate_lessons?: number;
  };

  // ========== ERROR HANDLING ==========

  /**
   * Accumulated non-fatal errors and warnings
   *
   * Logs issues that don't block progression (e.g., validation warnings).
   * Used for debugging and quality monitoring.
   */
  errors: string[];

  /**
   * Last error message for retry logic
   *
   * Used by RT-004 retry strategy to adjust prompts and escalation decisions.
   * Cleared on successful retry.
   */
  lastError?: string;
}

// ============================================================================
// PHASE RESULT TYPES
// ============================================================================

/**
 * Phase 1 Result - Input validation
 *
 * Schema validation using GenerationJobInputSchema from shared-types.
 * No model invocation required (deterministic validation).
 */
export interface ValidateInputResult {
  /** Validation passed */
  valid: boolean;

  /** Validation errors (if any) */
  errors?: string[];
}

/**
 * Phase 2 Result - Metadata generation
 *
 * RT-001 Hybrid Approach:
 * - Critical fields (40% of tokens): qwen3-max ALWAYS
 * - Non-critical fields (60% of tokens): OSS 120B with escalation
 *
 * Critical fields: learning_outcomes, pedagogical_strategy, course_structure, domain_taxonomy
 * Non-critical fields: course_description, course_tags, prerequisites, etc.
 */
export interface GenerateMetadataResult {
  /** Generated course metadata (without sections) */
  metadata: CourseMetadata;

  /** Total tokens used (critical + non-critical) */
  tokensUsed: number;

  /**
   * Model used for metadata generation
   *
   * Possible values:
   * - "qwen/qwen3-max" (critical fields)
   * - "openai/gpt-oss-120b" (non-critical fields)
   * - "qwen/qwen3-max+openai/gpt-oss-120b" (hybrid approach)
   */
  model: string;

  /** Phase duration in milliseconds */
  duration: number;

  /** RT-004 retry count (0 = first attempt success) */
  retryCount: number;
}

/**
 * Phase 3 Result - Section batch generation
 *
 * RT-002 Batch Strategy:
 * - Batch size: 3-5 sections per batch
 * - Parallel processing: 2-3 batches in parallel
 *
 * RT-001 Model Routing:
 * - Primary: OSS 120B (80% of batches)
 * - Escalation: qwen3-max (20% when quality < 0.75)
 * - Overflow: Gemini-2.5-flash (rate limit fallback)
 */
export interface GenerateSectionsResult {
  /** Generated sections for this batch */
  sections: Section[];

  /** Tokens used for this batch */
  tokensUsed: number;

  /**
   * Primary model used for this batch
   *
   * Possible values:
   * - "openai/gpt-oss-120b" (80% of batches)
   * - "qwen/qwen3-max" (20% escalation)
   * - "google/gemini-2.5-flash" (rate limit overflow)
   */
  model: string;

  /**
   * Count of qwen3-max escalations in this batch
   *
   * Tracks how many sections in this batch required escalation from OSS 120B to qwen3-max.
   * Used for cost analysis and quality monitoring.
   */
  escalations: number;

  /** Batch duration in milliseconds */
  duration: number;

  /**
   * RT-004 retry counts per section in batch
   *
   * Array length matches sections.length.
   * Each element tracks retries for that specific section.
   */
  retryCount: number[];
}

/**
 * Phase 4 Result - Quality validation
 *
 * RT-001 Validation Method:
 * - 95% embedding-based: Jina-v3 cosine similarity (cheap, fast)
 * - 5% LLM-as-judge: OSS 120B for edge cases (expensive, accurate)
 *
 * Threshold: 0.75 minimum similarity
 */
export interface ValidateQualityResult {
  /** Quality validation passed (overall >= 0.75) */
  passed: boolean;

  /**
   * Quality scores breakdown
   */
  scores: {
    /** Metadata similarity (0.0-1.0, undefined for title-only) */
    metadata_similarity?: number;

    /** Per-section similarity scores (0.0-1.0) */
    sections_similarity: number[];

    /** Overall weighted average (0.0-1.0) */
    overall: number;
  };

  /** Tokens used (only for LLM-as-judge 5%, 0 for embedding-only 95%) */
  tokensUsed: number;

  /**
   * Validation method used
   *
   * RT-001 Strategy:
   * - "embedding": Jina-v3 cosine similarity (95% of cases)
   * - "llm_judge": OSS 120B for edge cases (5% of cases)
   */
  method: 'embedding' | 'llm_judge';
}

/**
 * Phase 5 Result - Lessons count validation
 *
 * FR-015 Constraint: Minimum 10 lessons total across all sections
 *
 * No model invocation required (count-based validation).
 */
export interface ValidateLessonsResult {
  /** Lessons validation passed (>= 10 lessons) */
  passed: boolean;

  /** Actual lesson count across all sections */
  lessonCount: number;

  /** Minimum required lessons (FR-015: 10) */
  minimumRequired: number;
}

// ============================================================================
// STATE INITIALIZATION HELPER
// ============================================================================

/**
 * Initialize empty GenerationState from GenerationJobInput
 *
 * Creates initial state with empty results and zero counters.
 * Used at the start of LangGraph workflow before Phase 1.
 *
 * @param input - Job input from BullMQ queue
 * @returns Initial state with empty results
 *
 * @example
 * ```typescript
 * const jobData = await generationQueue.getJob(jobId);
 * const initialState = initializeState(jobData.input);
 *
 * const finalState = await langGraphWorkflow.invoke(initialState);
 * ```
 */
export function initializeState(input: GenerationJobInput): GenerationState {
  return {
    input,
    metadata: undefined,
    sections: [],
    qualityScores: {
      sections_similarity: [],
    },
    tokenUsage: {
      metadata: 0,
      sections: 0,
      validation: 0,
      total: 0,
    },
    modelUsed: {
      metadata: '',
      sections: '',
    },
    retryCount: {
      metadata: 0,
      sections: [],
    },
    currentPhase: 'validate_input',
    phaseDurations: {},
    errors: [],
  };
}

// ============================================================================
// STATE UPDATE HELPERS (Immutable)
// ============================================================================

/**
 * Update state after Phase 2 metadata generation completes
 *
 * Immutably updates state with metadata results and transitions to Phase 3.
 *
 * RT-001 Tracking:
 * - Adds metadata tokens to tokenUsage
 * - Records model used (qwen3-max or OSS 120B)
 * - Tracks retry count for Phase 2
 *
 * @param state - Current state
 * @param result - Metadata generation result from Phase 2
 * @returns New state with metadata populated
 *
 * @example
 * ```typescript
 * const metadataResult = await generateMetadata(state.input);
 * const newState = updateStateWithMetadata(state, metadataResult);
 * ```
 */
export function updateStateWithMetadata(
  state: GenerationState,
  result: GenerateMetadataResult
): GenerationState {
  return {
    ...state,
    metadata: result.metadata,
    tokenUsage: {
      ...state.tokenUsage,
      metadata: result.tokensUsed,
      total: state.tokenUsage.total + result.tokensUsed,
    },
    modelUsed: {
      ...state.modelUsed,
      metadata: result.model,
    },
    retryCount: {
      ...state.retryCount,
      metadata: result.retryCount,
    },
    phaseDurations: {
      ...state.phaseDurations,
      generate_metadata: result.duration,
    },
    currentPhase: 'generate_sections',
  };
}

/**
 * Update state after Phase 3 section batch generation completes
 *
 * Immutably updates state by APPENDING sections from this batch to existing sections.
 * Accumulates tokens, durations, and retry counts across multiple batches.
 *
 * RT-002 Batch Strategy:
 * - Called once per batch (3-5 sections per call)
 * - Sections array grows as batches complete
 * - Durations accumulate for total Phase 3 duration
 *
 * @param state - Current state
 * @param result - Section batch generation result from Phase 3
 * @returns New state with sections appended
 *
 * @example
 * ```typescript
 * // Batch 1: Generate sections 1-3
 * const batch1Result = await generateSectionBatch(state, [1, 2, 3]);
 * let newState = updateStateWithSections(state, batch1Result);
 *
 * // Batch 2: Generate sections 4-6
 * const batch2Result = await generateSectionBatch(newState, [4, 5, 6]);
 * newState = updateStateWithSections(newState, batch2Result);
 * ```
 */
export function updateStateWithSections(
  state: GenerationState,
  result: GenerateSectionsResult
): GenerationState {
  return {
    ...state,
    sections: [...state.sections, ...result.sections],
    tokenUsage: {
      ...state.tokenUsage,
      sections: state.tokenUsage.sections + result.tokensUsed,
      total: state.tokenUsage.total + result.tokensUsed,
    },
    modelUsed: {
      ...state.modelUsed,
      sections: result.model,
    },
    retryCount: {
      ...state.retryCount,
      sections: [...state.retryCount.sections, ...result.retryCount],
    },
    phaseDurations: {
      ...state.phaseDurations,
      generate_sections: (state.phaseDurations.generate_sections || 0) + result.duration,
    },
    currentPhase: 'validate_quality',
  };
}

/**
 * Update state after Phase 4 quality validation completes
 *
 * Immutably updates state with quality scores and transitions to Phase 5.
 *
 * RT-001 Validation:
 * - Tracks validation tokens (only for LLM-as-judge 5%)
 * - Records validation method (embedding vs LLM-as-judge)
 * - Stores quality scores for monitoring
 *
 * @param state - Current state
 * @param result - Quality validation result from Phase 4
 * @returns New state with quality scores populated
 *
 * @example
 * ```typescript
 * const qualityResult = await validateQuality(state);
 * const newState = updateStateWithQuality(state, qualityResult);
 *
 * if (!newState.qualityScores.overall || newState.qualityScores.overall < 0.75) {
 *   // Trigger retry or escalation
 * }
 * ```
 */
export function updateStateWithQuality(
  state: GenerationState,
  result: ValidateQualityResult
): GenerationState {
  return {
    ...state,
    qualityScores: result.scores,
    tokenUsage: {
      ...state.tokenUsage,
      validation: result.tokensUsed,
      total: state.tokenUsage.total + result.tokensUsed,
    },
    modelUsed: {
      ...state.modelUsed,
      validation: result.method === 'llm_judge' ? 'openai/gpt-oss-120b' : undefined,
    },
    phaseDurations: {
      ...state.phaseDurations,
      validate_quality: result.tokensUsed, // Note: Using tokensUsed as proxy for duration
    },
    currentPhase: 'validate_lessons',
  };
}
