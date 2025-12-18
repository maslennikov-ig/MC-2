/**
 * Stage 4 Analysis - LangGraph StateGraph Workflow Template
 *
 * Multi-phase analysis orchestration using LangGraph's StateGraph.
 * Implements 6-node workflow: preFlight + 5 analysis phases.
 *
 * Phase sequence:
 * 1. preFlight: Stage 3 barrier validation + input validation
 * 2. phase1: Basic classification (category, audience, contextual language)
 * 3. phase2: Scope analysis (lesson count, hours, sections breakdown)
 * 4. phase3: Deep expert analysis (pedagogy, research flags, expansion areas)
 * 5. phase4: Document synthesis (scope instructions, content strategy)
 * 6. phase5: Final assembly (merge all outputs into AnalysisResult)
 *
 * @module workflow-graph
 */

import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
  AnalysisResult,
} from '@megacampus/shared-types/analysis-result';

/**
 * Workflow state structure
 *
 * Accumulates outputs from each phase and tracks execution metrics.
 * State is passed through all nodes, with each phase adding its output.
 */
const WorkflowState = Annotation.Root({
  /** Course UUID */
  course_id: Annotation<string>,

  /** User input language (ISO 639-1 code) */
  language: Annotation<string>,

  /** Course topic (required field) */
  topic: Annotation<string>,

  /** Optional user-provided answers field (detailed requirements) */
  answers: Annotation<string | null>,

  /** Optional document summaries from Stage 3 */
  document_summaries: Annotation<string[] | null>,

  /** Phase 1 output: Classification and contextual language */
  phase1_output: Annotation<Phase1Output | null>,

  /** Phase 2 output: Scope analysis and structure */
  phase2_output: Annotation<Phase2Output | null>,

  /** Phase 3 output: Pedagogy and research flags */
  phase3_output: Annotation<Phase3Output | null>,

  /** Phase 4 output: Document synthesis */
  phase4_output: Annotation<Phase4Output | null>,

  /** Final analysis result (Phase 5 output) */
  analysis_result: Annotation<AnalysisResult | null>,

  /** Token usage tracking per phase */
  tokens_used: Annotation<Record<string, { input: number; output: number }>>,

  /** Total cost in USD */
  total_cost: Annotation<number>,

  /** Error tracking (if any phase fails) */
  error: Annotation<string | null>,
});

/**
 * Type alias for workflow state (inferred from Annotation)
 */
type WorkflowStateType = typeof WorkflowState.State;

/**
 * Pre-flight validation node
 *
 * Validates:
 * - Stage 3 barrier (all documents processed)
 * - Required input fields (course_id, topic, language)
 * - Document summaries availability
 *
 * @param state - Current workflow state
 * @returns Updated state or throws error if validation fails
 */
async function preFlightNode(
  state: WorkflowStateType
): Promise<Partial<WorkflowStateType>> {
  console.log('[preFlight] Starting Stage 3 barrier validation...');

  // TODO: Implement Stage 3 barrier check
  // const barrierCheck = await validateStage4Barrier(state.course_id);
  // if (!barrierCheck.allowed) {
  //   throw new Error(`Stage 3 barrier failed: ${barrierCheck.reason}`);
  // }

  // Input validation
  if (!state.course_id || !state.topic || !state.language) {
    throw new Error(
      'Missing required inputs: course_id, topic, and language are required'
    );
  }

  console.log('[preFlight] Validation passed. Ready for Phase 1.');

  return {
    tokens_used: {},
    total_cost: 0,
    error: null,
  };
}

/**
 * Phase 1: Basic Classification node (STUB)
 *
 * TODO: Implement full classification logic
 * - Course category detection (6 categories)
 * - Contextual language generation
 * - Key concepts extraction
 *
 * @param state - Current workflow state
 * @returns Updated state with phase1_output
 */
async function phase1Node(
  _state: WorkflowStateType
): Promise<Partial<WorkflowStateType>> {
  console.log('[phase1] Running Basic Classification...');

  // TODO: Replace stub with actual LLM call
  // const result = await runPhase1Classification(state);

  const stubOutput: Phase1Output = {
    course_category: {
      primary: 'professional',
      confidence: 0.9,
      reasoning: '[STUB] Classification logic not yet implemented',
      secondary: null,
    },
    pedagogical_patterns: {
      primary_strategy: 'mixed',
      theory_practice_ratio: '50:50',
      assessment_types: ['coding', 'quizzes'],
      key_patterns: ['build incrementally', 'learn by doing'],
    },
    contextual_language: {
      why_matters_context: '[STUB] Why matters context',
      motivators: '[STUB] Motivators for this category',
      experience_prompt: '[STUB] Experience prompt',
      problem_statement_context: '[STUB] Problem statement',
      knowledge_bridge: '[STUB] Knowledge bridge',
      practical_benefit_focus: '[STUB] Practical benefits',
    },
    topic_analysis: {
      determined_topic: _state.topic,
      information_completeness: 50,
      complexity: 'medium',
      reasoning: '[STUB] Topic analysis reasoning',
      target_audience: 'intermediate',
      missing_elements: null,
      key_concepts: ['concept1', 'concept2', 'concept3'],
      domain_keywords: [
        'keyword1',
        'keyword2',
        'keyword3',
        'keyword4',
        'keyword5',
      ],
    },
    phase_metadata: {
      duration_ms: 0,
      model_used: 'stub',
      tokens: { input: 0, output: 0, total: 0 },
      quality_score: 0,
      retry_count: 0,
    },
  };

  return {
    phase1_output: stubOutput,
  };
}

/**
 * Phase 2: Scope Analysis node (IMPLEMENTED)
 *
 * Estimates course scope and generates detailed structure recommendations:
 * - Lesson count estimation
 * - Hours calculation
 * - Sections breakdown
 * - Minimum 10 lessons validation (FR-015)
 *
 * @param state - Current workflow state
 * @returns Updated state with phase2_output
 */
async function phase2Node(
  state: WorkflowStateType
): Promise<Partial<WorkflowStateType>> {
  console.log('[phase2] Running Scope Analysis...');

  // Import dynamically to avoid circular dependencies
  const { runPhase2Scope } = await import('../phases/phase-2-scope');

  try {
    // Execute Phase 2 with real LLM call
    const result = await runPhase2Scope({
      course_id: state.course_id,
      language: state.language,
      topic: state.topic,
      answers: state.answers,
      document_summaries: state.document_summaries,
      phase1_output: state.phase1_output!,
    });

    // Track tokens
    const tokens_used = {
      ...state.tokens_used,
      phase_2: result.phase_metadata.tokens,
    };

    // Update total cost (will be calculated by observability layer)
    const total_cost = state.total_cost;

    return {
      phase2_output: result,
      tokens_used,
      total_cost,
    };
  } catch (error) {
    console.error('[phase2] Scope Analysis failed:', error);

    // Store error in state for Phase 5 to handle
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      error: `Phase 2 failed: ${errorMessage}`,
    };
  }
}

/**
 * Phase 3: Deep Expert Analysis node (STUB)
 *
 * TODO: Implement full expert analysis logic
 * - Pedagogical strategy design (ALWAYS use 120B model)
 * - Research flag detection
 * - Expansion areas identification
 *
 * @param state - Current workflow state
 * @returns Updated state with phase3_output
 */
async function phase3Node(
  _state: WorkflowStateType
): Promise<Partial<WorkflowStateType>> {
  console.log('[phase3] Running Deep Expert Analysis...');

  // TODO: Replace stub with actual LLM call
  // const result = await runPhase3Expert(state);

  const stubOutput: Phase3Output = {
    pedagogical_strategy: {
      teaching_style: 'mixed',
      assessment_approach: '[STUB] Assessment approach',
      practical_focus: 'high',
      progression_logic: '[STUB] Progression logic',
      interactivity_level: 'high',
    },
    expansion_areas: null,
    research_flags: [],
    phase_metadata: {
      duration_ms: 0,
      model_used: 'stub',
      tokens: { input: 0, output: 0, total: 0 },
      quality_score: 0,
      retry_count: 0,
    },
  };

  return {
    phase3_output: stubOutput,
  };
}

/**
 * Phase 4: Document Synthesis node (STUB)
 *
 * TODO: Implement full synthesis logic
 * - Scope instructions generation (100-800 chars)
 * - Content strategy determination
 * - Adaptive model selection (<3 docs → 20B, ≥3 docs → 120B)
 *
 * @param state - Current workflow state
 * @returns Updated state with phase4_output
 */
async function phase4Node(
  _state: WorkflowStateType
): Promise<Partial<WorkflowStateType>> {
  console.log('[phase4] Running Document Synthesis...');

  // TODO: Replace stub with actual LLM call
  // const result = await runPhase4Synthesis(state);

  const stubOutput: Phase4Output = {
    generation_guidance: {
      tone: 'conversational but precise',
      use_analogies: true,
      specific_analogies: ['assembly line for data flow'],
      avoid_jargon: ['polymorphism', 'encapsulation'],
      include_visuals: ['diagrams', 'code examples'],
      exercise_types: ['coding', 'debugging'],
      contextual_language_hints: '[STUB] Audience assumptions',
      real_world_examples: ['e-commerce checkout', 'social media feed'],
    },
    content_strategy: 'create_from_scratch',
    phase_metadata: {
      duration_ms: 0,
      model_used: 'stub',
      tokens: { input: 0, output: 0, total: 0 },
      quality_score: 0,
      retry_count: 0,
      document_count: 0, // Number of documents processed
    },
  };

  return {
    phase4_output: stubOutput,
  };
}

/**
 * Phase 5: Final Assembly node (STUB)
 *
 * TODO: Implement full assembly logic (NO LLM calls - pure logic)
 * - Merge all phase outputs into AnalysisResult
 * - Add target_language field (critical for Stage 5)
 * - Calculate total cost, duration, tokens
 * - Validate complete structure with AnalysisResultSchema
 *
 * @param state - Current workflow state
 * @returns Updated state with analysis_result
 */
async function phase5Node(
  state: WorkflowStateType
): Promise<Partial<WorkflowStateType>> {
  console.log('[phase5] Running Final Assembly...');

  // TODO: Replace stub with actual assembly logic
  // const result = assembleAnalysisResult(state);

  // STUB: Minimal AnalysisResult structure
  const stubResult: AnalysisResult = {
    course_category: state.phase1_output!.course_category,
    contextual_language: state.phase1_output!.contextual_language,
    topic_analysis: state.phase1_output!.topic_analysis,
    pedagogical_patterns: state.phase1_output!.pedagogical_patterns,
    recommended_structure: state.phase2_output!.recommended_structure,
    pedagogical_strategy: state.phase3_output!.pedagogical_strategy,
    generation_guidance: state.phase4_output!.generation_guidance,
    content_strategy: state.phase4_output!.content_strategy,
    document_relevance_mapping: {},
    expansion_areas: state.phase3_output!.expansion_areas,
    research_flags: state.phase3_output!.research_flags,
    // NOTE: target_language will be added to AnalysisResult schema later (FR-004)
    // For now, Stage 5 will read courses.language directly
    metadata: {
      analysis_version: '1.0.0-stub',
      total_duration_ms: 0,
      phase_durations_ms: {
        phase_1: 0,
        phase_2: 0,
        phase_3: 0,
        phase_4: 0,
        phase_5: 0,
      },
      model_usage: {
        phase_1: 'stub',
        phase_2: 'stub',
        phase_3: 'stub',
        phase_4: 'stub',
      },
      total_tokens: { input: 0, output: 0, total: 0 },
      total_cost_usd: 0,
      retry_count: 0,
      quality_scores: {
        phase_1: 0,
        phase_2: 0,
        phase_3: 0,
        phase_4: 0,
      },
      created_at: new Date().toISOString(),
    },
  };

  return {
    analysis_result: stubResult,
  };
}

/**
 * Build and compile the StateGraph workflow
 *
 * Graph structure:
 * START → preFlight → phase1 → phase2 → phase3 → phase4 → phase5 → END
 *
 * @returns Compiled StateGraph application
 */
export function buildWorkflowGraph() {
  const workflow = new StateGraph(WorkflowState)
    // Add all nodes
    .addNode('preFlight', preFlightNode)
    .addNode('phase1', phase1Node)
    .addNode('phase2', phase2Node)
    .addNode('phase3', phase3Node)
    .addNode('phase4', phase4Node)
    .addNode('phase5', phase5Node)

    // Define edges (sequential flow)
    .addEdge(START, 'preFlight')
    .addEdge('preFlight', 'phase1')
    .addEdge('phase1', 'phase2')
    .addEdge('phase2', 'phase3')
    .addEdge('phase3', 'phase4')
    .addEdge('phase4', 'phase5')
    .addEdge('phase5', END);

  return workflow.compile();
}

/**
 * Compiled StateGraph application instance
 *
 * Usage:
 * const result = await app.invoke({
 *   course_id: 'uuid',
 *   language: 'en',
 *   topic: 'Machine Learning Fundamentals',
 *   answers: null,
 *   document_summaries: null
 * });
 */
export const app = buildWorkflowGraph();
