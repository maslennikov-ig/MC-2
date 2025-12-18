/**
 * Phase 5: Final Assembly Service
 *
 * Pure data assembly logic (NO LLM calls) that combines outputs from Phases 1-4, 6
 * into a single validated AnalysisResult structure for storage in courses.analysis_result.
 *
 * Critical Requirements:
 * - NO LLM integration (pure logic only)
 * - Validate complete structure with AnalysisResultSchema
 * - Calculate cumulative metadata (tokens, cost, duration)
 * - Sanitize LLM outputs to prevent XSS attacks
 * - Preserve all phase outputs without modification (except sanitization)
 *
 * Language Note (FR-004):
 * - target_language is NOT included in AnalysisResult schema
 * - Stage 5 reads courses.language directly from database
 * - This design avoids duplication and ensures single source of truth
 *
 * Security Note (POST-REVIEW-FIXES):
 * - All LLM-generated text fields are sanitized with DOMPurify before storage
 * - This prevents XSS attacks when displaying content to users
 * - Sanitization applied to: contextual_language, scope_instructions
 *
 * Analyze Enhancement (Phase 6):
 * - Phase 6 output (RAG planning) is optional - only present if documents exist
 * - If present, document_relevance_mapping is included in final result
 * - Enables 45x cost savings in Generation Stage 5 via SMART mode
 *
 * @module phase-5-assembly
 */

import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
  AnalysisResult,
} from '@megacampus/shared-types/analysis-result';
import type { Phase6Output } from './phase-6-rag-planning';
import { sanitizeLLMOutput } from '../../../shared/utils/sanitize-llm-output';
import { logger } from '../../../shared/logger';

/**
 * Default fallback values for advisory fields in generation_guidance.
 * Used when LLM generates unknown values that are filtered out.
 */
const FALLBACK_EXERCISE_TYPES = ['quiz', 'practice', 'reflection'] as const;
const FALLBACK_VISUAL_TYPES = ['diagrams', 'tables'] as const;

/**
 * Input structure for Phase 5 assembly
 *
 * Contains all phase outputs and cumulative execution metrics.
 */
export interface Phase5Input {
  /** Course UUID */
  course_id: string;

  /** User input language (ISO 639-1 code) - for reference only, NOT stored in AnalysisResult */
  language: string;

  /** Course topic */
  topic: string;

  /** Optional user-provided answers/requirements */
  answers?: string | null;

  /** Optional document summaries from Stage 3 */
  document_summaries?: string[] | null;

  /** Phase 1 output: Classification and contextual language */
  phase1_output: Phase1Output;

  /** Phase 2 output: Scope analysis and structure */
  phase2_output: Phase2Output;

  /** Phase 3 output: Pedagogy and research flags */
  phase3_output: Phase3Output;

  /** Phase 4 output: Document synthesis */
  phase4_output: Phase4Output;

  /** Phase 6 output: RAG planning (optional - only if documents exist) */
  phase6_output?: Phase6Output | null;

  /** Total duration across all phases (ms) */
  total_duration_ms: number;

  /** Total token usage across all phases */
  total_tokens: { input: number; output: number; total: number };

  /** Total cost across all phases (USD) */
  total_cost_usd: number;
}

/**
 * Assemble final analysis result from all phase outputs
 *
 * This is PURE logic - no LLM calls. Combines outputs from Phases 1-4 into
 * a single AnalysisResult structure with complete metadata.
 *
 * Validation:
 * - All required phase outputs must be present
 * - Total lessons must be >= 10 (should already be validated in Phase 2)
 * - All required fields must be populated
 *
 * @param input - All phase outputs and execution metrics
 * @returns Complete AnalysisResult ready for database storage
 * @throws Error if any required phase output is missing
 * @throws Error if total_lessons < 10 (defensive validation)
 */
export async function assembleAnalysisResult(
  input: Phase5Input
): Promise<AnalysisResult> {
  const startTime = Date.now();

  // Defensive validation: Ensure all phase outputs present
  if (!input.phase1_output) {
    throw new Error('Phase 1 output is missing - cannot assemble result');
  }
  if (!input.phase2_output) {
    throw new Error('Phase 2 output is missing - cannot assemble result');
  }
  if (!input.phase3_output) {
    throw new Error('Phase 3 output is missing - cannot assemble result');
  }
  if (!input.phase4_output) {
    throw new Error('Phase 4 output is missing - cannot assemble result');
  }

  // Defensive validation: Minimum 10 lessons (should already be validated in Phase 2)
  const totalLessons = input.phase2_output.recommended_structure.total_lessons;
  if (totalLessons < 10) {
    throw new Error(
      `Phase 2 validation failure: total_lessons (${totalLessons}) is less than minimum required (10). ` +
        'This should have been caught in Phase 2 validation.'
    );
  }

  // Extract phase metadata for cumulative tracking
  const phase1Meta = input.phase1_output.phase_metadata;
  const phase2Meta = input.phase2_output.phase_metadata;
  const phase3Meta = input.phase3_output.phase_metadata;
  const phase4Meta = input.phase4_output.phase_metadata;
  const phase6Meta = input.phase6_output?.phase_metadata;

  // Calculate phase-specific durations
  const phaseDurationsMs: Record<string, number> = {
    phase_1: phase1Meta.duration_ms,
    phase_2: phase2Meta.duration_ms,
    phase_3: phase3Meta.duration_ms,
    phase_4: phase4Meta.duration_ms,
    phase_5: 0, // Will be calculated at end
  };

  if (phase6Meta) {
    phaseDurationsMs.phase_6 = phase6Meta.duration_ms;
  }

  // Track model usage per phase
  const modelUsage: Record<string, string> = {
    phase_1: phase1Meta.model_used,
    phase_2: phase2Meta.model_used,
    phase_3: phase3Meta.model_used,
    phase_4: phase4Meta.model_used,
  };

  if (phase6Meta) {
    modelUsage.phase_6 = phase6Meta.model_used;
  }

  // Calculate total retry count
  const totalRetryCount =
    phase1Meta.retry_count +
    phase2Meta.retry_count +
    phase3Meta.retry_count +
    phase4Meta.retry_count +
    (phase6Meta?.retry_count || 0);

  // Collect quality scores per phase
  const qualityScores: Record<string, number> = {
    phase_1: phase1Meta.quality_score,
    phase_2: phase2Meta.quality_score,
    phase_3: phase3Meta.quality_score,
    phase_4: phase4Meta.quality_score,
  };

  if (phase6Meta) {
    qualityScores.phase_6 = phase6Meta.quality_score;
  }

  // Sanitize LLM-generated text fields to prevent XSS attacks
  // Apply DOMPurify sanitization to all user-facing text that came from LLM outputs

  // Sanitize contextual_language object fields (all are LLM-generated)
  const sanitizedContextualLanguage = {
    why_matters_context: sanitizeLLMOutput(
      input.phase1_output.contextual_language.why_matters_context
    ),
    motivators: sanitizeLLMOutput(input.phase1_output.contextual_language.motivators),
    experience_prompt: sanitizeLLMOutput(
      input.phase1_output.contextual_language.experience_prompt
    ),
    problem_statement_context: sanitizeLLMOutput(
      input.phase1_output.contextual_language.problem_statement_context
    ),
    knowledge_bridge: sanitizeLLMOutput(
      input.phase1_output.contextual_language.knowledge_bridge
    ),
    practical_benefit_focus: sanitizeLLMOutput(
      input.phase1_output.contextual_language.practical_benefit_focus
    ),
  };

  // Sanitize generation_guidance fields (REQUIRED)
  const sanitizedGenerationGuidance: AnalysisResult['generation_guidance'] = {
    tone: input.phase4_output.generation_guidance.tone,
    use_analogies: input.phase4_output.generation_guidance.use_analogies,
    specific_analogies: input.phase4_output.generation_guidance.specific_analogies,
    avoid_jargon: input.phase4_output.generation_guidance.avoid_jargon.map(term => sanitizeLLMOutput(term)),
    include_visuals: input.phase4_output.generation_guidance.include_visuals,
    exercise_types: input.phase4_output.generation_guidance.exercise_types,
    contextual_language_hints: sanitizeLLMOutput(input.phase4_output.generation_guidance.contextual_language_hints),
    real_world_examples: input.phase4_output.generation_guidance.real_world_examples?.map(ex => sanitizeLLMOutput(ex)),
  };

  // Assemble complete AnalysisResult structure
  const result: AnalysisResult = {
    // From Phase 1: Classification and contextual language
    course_category: input.phase1_output.course_category,
    contextual_language: sanitizedContextualLanguage, // SANITIZED for XSS protection
    topic_analysis: input.phase1_output.topic_analysis,
    pedagogical_patterns: input.phase1_output.pedagogical_patterns, // Optional - from Analyze Enhancement

    // From Phase 2: Scope and structure
    recommended_structure: input.phase2_output.recommended_structure,

    // From Phase 3: Pedagogical strategy and analysis
    pedagogical_strategy: input.phase3_output.pedagogical_strategy,
    expansion_areas: input.phase3_output.expansion_areas,
    research_flags: input.phase3_output.research_flags,

    // From Phase 4: Document synthesis
    generation_guidance: sanitizedGenerationGuidance, // REQUIRED - SANITIZED for XSS protection
    content_strategy: input.phase4_output.content_strategy,

    // From Phase 6: RAG planning (defaults to empty object if no documents)
    document_relevance_mapping: input.phase6_output?.document_relevance_mapping || {},

    // Metadata: Cumulative execution metrics
    metadata: {
      analysis_version: '1.0.0',
      total_duration_ms: input.total_duration_ms,
      phase_durations_ms: phaseDurationsMs,
      model_usage: modelUsage,
      total_tokens: input.total_tokens,
      total_cost_usd: input.total_cost_usd,
      retry_count: totalRetryCount,
      quality_scores: qualityScores,
      created_at: new Date().toISOString(),
    },
  };

  // Calculate Phase 5 duration (assembly time)
  const assemblyDuration = Date.now() - startTime;
  result.metadata.phase_durations_ms.phase_5 = assemblyDuration;

  // Add assembly time to total duration
  result.metadata.total_duration_ms += assemblyDuration;

  // NOTE: Language Preservation (FR-004)
  // - The user's target language (input.language) is NOT stored in AnalysisResult
  // - Stage 5 (Generation) will read courses.language directly from the database
  // - This avoids duplication and ensures single source of truth for language settings
  // - All analysis output is in English (enforced in Phases 1-4)

  // Validate complete structure (runtime type checking)
  // This is defensive - TypeScript should catch most issues at compile time
  validateAnalysisResult(result);

  return result;
}

/**
 * Runtime validation for AnalysisResult completeness
 *
 * Defensive validation to catch any missing required fields that might
 * slip through TypeScript type checking (e.g., from dynamic data).
 *
 * Enhanced in Analyze Enhancement to support new optional fields:
 * - pedagogical_patterns (optional)
 * - generation_guidance (optional, but required if scope_instructions missing)
 * - document_relevance_mapping (optional)
 *
 * @param result - AnalysisResult to validate
 * @throws Error if any required field is missing or invalid
 */
function validateAnalysisResult(result: AnalysisResult): void {
  // Validate top-level required fields
  if (!result.course_category) {
    throw new Error('Validation error: course_category is missing');
  }
  if (!result.contextual_language) {
    throw new Error('Validation error: contextual_language is missing');
  }
  if (!result.topic_analysis) {
    throw new Error('Validation error: topic_analysis is missing');
  }
  if (!result.recommended_structure) {
    throw new Error('Validation error: recommended_structure is missing');
  }
  if (!result.pedagogical_strategy) {
    throw new Error('Validation error: pedagogical_strategy is missing');
  }
  if (!result.content_strategy) {
    throw new Error('Validation error: content_strategy is missing');
  }

  // generation_guidance is now REQUIRED
  if (!result.generation_guidance) {
    throw new Error('Validation error: generation_guidance is missing');
  }

  // research_flags can be empty array but must be defined
  if (!Array.isArray(result.research_flags)) {
    throw new Error('Validation error: research_flags must be an array');
  }

  // expansion_areas can be null but must be defined
  if (result.expansion_areas !== null && !Array.isArray(result.expansion_areas)) {
    throw new Error(
      'Validation error: expansion_areas must be null or an array'
    );
  }

  // Validate metadata structure
  if (!result.metadata) {
    throw new Error('Validation error: metadata is missing');
  }
  if (!result.metadata.analysis_version) {
    throw new Error('Validation error: metadata.analysis_version is missing');
  }
  if (typeof result.metadata.total_duration_ms !== 'number') {
    throw new Error('Validation error: metadata.total_duration_ms must be a number');
  }
  if (!result.metadata.phase_durations_ms) {
    throw new Error('Validation error: metadata.phase_durations_ms is missing');
  }
  if (!result.metadata.model_usage) {
    throw new Error('Validation error: metadata.model_usage is missing');
  }
  if (!result.metadata.total_tokens) {
    throw new Error('Validation error: metadata.total_tokens is missing');
  }
  if (typeof result.metadata.total_cost_usd !== 'number') {
    throw new Error('Validation error: metadata.total_cost_usd must be a number');
  }
  if (!result.metadata.created_at) {
    throw new Error('Validation error: metadata.created_at is missing');
  }

  // Validate minimum lessons requirement (defensive check)
  if (result.recommended_structure.total_lessons < 10) {
    throw new Error(
      `Validation error: total_lessons (${result.recommended_structure.total_lessons}) is less than minimum required (10)`
    );
  }

  // Validate optional pedagogical_patterns field (when present)
  if (result.pedagogical_patterns) {
    validatePedagogicalPatterns(result.pedagogical_patterns);
  }

  // Validate optional generation_guidance field (when present)
  if (result.generation_guidance) {
    validateGenerationGuidance(result.generation_guidance);
  }

  // Validate optional document_relevance_mapping field (when present)
  if (result.document_relevance_mapping) {
    validateDocumentRelevanceMapping(result.document_relevance_mapping);
  }

  // Validate prerequisites chain for circular dependencies
  validatePrerequisitesChain(result.recommended_structure.sections_breakdown);
}

/**
 * Validate pedagogical_patterns structure (optional field)
 *
 * Checks:
 * - primary_strategy is present
 * - theory_practice_ratio format: "XX:YY" where XX + YY = 100
 * - assessment_types is non-empty array
 * - key_patterns has 2-5 items
 *
 * @param patterns - PedagogicalPatterns to validate
 * @throws Error if structure is invalid
 */
function validatePedagogicalPatterns(patterns: NonNullable<AnalysisResult['pedagogical_patterns']>): void {
  if (!patterns.primary_strategy) {
    throw new Error('Validation error: pedagogical_patterns.primary_strategy is missing');
  }

  // Validate theory_practice_ratio format: "XX:YY" where XX + YY = 100
  const ratio = patterns.theory_practice_ratio;
  const match = ratio.match(/^(\d+):(\d+)$/);
  if (!match) {
    throw new Error(
      `Validation error: Invalid theory_practice_ratio format: "${ratio}". Expected format: "XX:YY" (e.g., "30:70")`
    );
  }

  const theory = parseInt(match[1], 10);
  const practice = parseInt(match[2], 10);
  if (theory + practice !== 100) {
    throw new Error(
      `Validation error: theory_practice_ratio must sum to 100, got ${theory + practice} (theory=${theory}, practice=${practice})`
    );
  }

  // Validate assessment_types is non-empty array
  if (!Array.isArray(patterns.assessment_types) || patterns.assessment_types.length === 0) {
    throw new Error('Validation error: pedagogical_patterns.assessment_types must be a non-empty array');
  }

  // Validate key_patterns has 2-10 items (gracefully truncate if more)
  if (!Array.isArray(patterns.key_patterns)) {
    throw new Error('Validation error: pedagogical_patterns.key_patterns must be an array');
  }
  if (patterns.key_patterns.length < 2) {
    throw new Error(
      `Validation error: pedagogical_patterns.key_patterns must have at least 2 items, got ${patterns.key_patterns.length}`
    );
  }
  // Gracefully truncate to 10 items if LLM returned more (avoid hard failure)
  if (patterns.key_patterns.length > 10) {
    patterns.key_patterns = patterns.key_patterns.slice(0, 10);
  }
}

/**
 * Validate generation_guidance structure (optional field)
 *
 * Checks:
 * - tone is one of allowed values
 * - include_visuals is non-empty array
 * - exercise_types is non-empty array
 *
 * @param guidance - GenerationGuidance to validate
 * @throws Error if structure is invalid
 */
function validateGenerationGuidance(guidance: NonNullable<AnalysisResult['generation_guidance']>): void {
  const validTones = ['conversational but precise', 'formal academic', 'casual friendly', 'technical professional'];
  if (!validTones.includes(guidance.tone)) {
    throw new Error(
      `Validation error: generation_guidance.tone must be one of: ${validTones.join(', ')}. Got: "${guidance.tone}"`
    );
  }

  // Validate include_visuals - use fallback if empty (advisory field, non-blocking)
  if (!Array.isArray(guidance.include_visuals) || guidance.include_visuals.length === 0) {
    logger.warn({
      field: 'include_visuals',
      fallback: FALLBACK_VISUAL_TYPES,
      reason: 'LLM generated values were filtered out or array was empty',
    }, '[Phase5Assembly] Using fallback for include_visuals');
    // Mutate to apply fallback (guidance is mutable reference)
    (guidance as { include_visuals: string[] }).include_visuals = [...FALLBACK_VISUAL_TYPES];
  }

  // Validate exercise_types - use fallback if empty (advisory field, non-blocking)
  if (!Array.isArray(guidance.exercise_types) || guidance.exercise_types.length === 0) {
    logger.warn({
      field: 'exercise_types',
      fallback: FALLBACK_EXERCISE_TYPES,
      reason: 'LLM generated values were filtered out or array was empty',
    }, '[Phase5Assembly] Using fallback for exercise_types');
    // Mutate to apply fallback (guidance is mutable reference)
    (guidance as { exercise_types: string[] }).exercise_types = [...FALLBACK_EXERCISE_TYPES];
  }

  // Validate avoid_jargon is array (can be empty)
  if (!Array.isArray(guidance.avoid_jargon)) {
    throw new Error('Validation error: generation_guidance.avoid_jargon must be an array');
  }
}

/**
 * Validate document_relevance_mapping structure (optional field)
 *
 * Checks:
 * - Is an object (not null, not undefined)
 * - Each section mapping has valid structure:
 *   - primary_documents is array (can be empty)
 *   - key_search_terms is array with 3-10 items
 *   - expected_topics is array with 2-8 items
 *   - document_processing_methods is object
 *
 * @param mapping - DocumentRelevanceMapping to validate
 * @throws Error if structure is invalid
 */
function validateDocumentRelevanceMapping(mapping: NonNullable<AnalysisResult['document_relevance_mapping']>): void {
  if (typeof mapping !== 'object' || mapping === null) {
    throw new Error('Validation error: document_relevance_mapping must be an object');
  }

  // Validate each section mapping
  for (const [sectionId, sectionMapping] of Object.entries(mapping)) {
    // Type guard: ensure sectionMapping has expected structure
    if (!sectionMapping || typeof sectionMapping !== 'object') {
      throw new Error(
        `Validation error: document_relevance_mapping.${sectionId} must be an object`
      );
    }

    // Validate primary_documents is array
    if (!('primary_documents' in sectionMapping) || !Array.isArray(sectionMapping.primary_documents)) {
      throw new Error(
        `Validation error: document_relevance_mapping.${sectionId}.primary_documents must be an array`
      );
    }

    // Validate search_queries (new) or key_search_terms (legacy) is array with 3-10 items
    // Cast to any to handle both new and legacy field names at runtime
    const mappingAny = sectionMapping as Record<string, unknown>;
    const searchQueries = mappingAny.search_queries ?? mappingAny.key_search_terms ?? null;

    if (!Array.isArray(searchQueries)) {
      throw new Error(
        `Validation error: document_relevance_mapping.${sectionId}.search_queries must be an array`
      );
    }
    const searchTermsCount = searchQueries.length;
    if (searchTermsCount < 3 || searchTermsCount > 10) {
      throw new Error(
        `Validation error: document_relevance_mapping.${sectionId}.search_queries must have 3-10 items, got ${searchTermsCount}`
      );
    }

    // Validate expected_topics is array with 2-8 items
    if (!('expected_topics' in sectionMapping) || !Array.isArray(sectionMapping.expected_topics)) {
      throw new Error(
        `Validation error: document_relevance_mapping.${sectionId}.expected_topics must be an array`
      );
    }
    const topicsCount = sectionMapping.expected_topics.length;
    if (topicsCount < 2 || topicsCount > 8) {
      throw new Error(
        `Validation error: document_relevance_mapping.${sectionId}.expected_topics must have 2-8 items, got ${topicsCount}`
      );
    }

    // Validate confidence (required in v0.20.0+)
    const confidence = mappingAny.confidence;
    if (!confidence || !['high', 'medium'].includes(confidence as string)) {
      throw new Error(
        `Validation error: document_relevance_mapping.${sectionId}.confidence must be 'high' or 'medium'`
      );
    }

    // Validate note if present (optional)
    const note = mappingAny.note;
    if (note !== undefined && typeof note !== 'string') {
      throw new Error(
        `Validation error: document_relevance_mapping.${sectionId}.note must be a string`
      );
    }

    // Legacy validation: document_processing_methods is optional in v0.20.0+
    const docProcessingMethods = mappingAny.document_processing_methods;
    if (docProcessingMethods !== undefined) {
      if (typeof docProcessingMethods !== 'object' || docProcessingMethods === null) {
        throw new Error(
          `Validation error: document_relevance_mapping.${sectionId}.document_processing_methods must be an object`
        );
      }
    }
  }
}

/**
 * Validate prerequisites chain for circular dependencies
 *
 * Uses depth-first search (DFS) with recursion stack tracking to detect cycles
 * in the section prerequisites graph.
 *
 * @param sections - Array of SectionBreakdown to validate
 * @throws Error if circular dependency detected
 */
function validatePrerequisitesChain(sections: AnalysisResult['recommended_structure']['sections_breakdown']): void {
  // Build adjacency list: section_id -> prerequisites[]
  const graph = new Map<string, string[]>();

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    // Use section_id if available, otherwise use index + 1 as fallback
    const sectionId = section.section_id || String(i + 1);
    const prerequisites = section.prerequisites || [];
    graph.set(sectionId, prerequisites);
  }

  // DFS cycle detection using recursion stack
  const visited = new Set<string>();
  const recStack = new Set<string>();

  /**
   * Recursive DFS helper to detect cycles
   * @param node - Current section_id being visited
   * @returns true if cycle detected, false otherwise
   */
  function hasCycle(node: string): boolean {
    visited.add(node);
    recStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      // If neighbor not visited, recurse
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) {
          return true;
        }
      }
      // If neighbor in recursion stack, cycle detected
      else if (recStack.has(neighbor)) {
        throw new Error(
          `Validation error: Circular dependency detected in prerequisites. Section "${node}" depends on "${neighbor}", which creates a cycle.`
        );
      }
    }

    // Remove from recursion stack on backtrack
    recStack.delete(node);
    return false;
  }

  // Check all nodes for cycles
  for (const sectionId of Array.from(graph.keys())) {
    if (!visited.has(sectionId)) {
      hasCycle(sectionId);
    }
  }
}
