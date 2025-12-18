/**
 * Stage 4 Analysis Result Types
 *
 * Defines the complete structure for course analysis output stored in courses.analysis_result (JSONB).
 * Used across Stage 4 phases for course categorization, topic analysis, scope planning,
 * pedagogical strategy, and content generation instructions.
 *
 * @module analysis-result
 */

import type { ExerciseType } from './analysis-schemas';

/**
 * Main analysis result structure stored in courses.analysis_result (JSONB column)
 */
export interface AnalysisResult {
  // Course categorization (Phase 1)
  course_category: {
    primary: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic';
    confidence: number; // 0-1
    reasoning: string;
    secondary?: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic' | null;
  };

  // Category-specific motivational language (Phase 1)
  contextual_language: {
    why_matters_context: string; // 50-300 chars, TARGET: 100
    motivators: string; // 100-600 chars, TARGET: 200
    experience_prompt: string; // 100-600 chars, TARGET: 200
    problem_statement_context: string; // 50-300 chars, TARGET: 100
    knowledge_bridge: string; // 100-600 chars, TARGET: 200
    practical_benefit_focus: string; // 100-600 chars, TARGET: 200
  };

  // Topic analysis (Phase 1-2)
  topic_analysis: {
    determined_topic: string; // 3-200 chars
    information_completeness: number; // 0-100%
    complexity: 'narrow' | 'medium' | 'broad';
    reasoning: string; // Min 50 chars
    target_audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    missing_elements: string[] | null;
    key_concepts: string[]; // 3-10 items
    domain_keywords: string[]; // 5-15 items
  };

  // Scope and structure recommendations (Phase 2)
  recommended_structure: {
    estimated_content_hours: number; // 0.5-200h
    scope_reasoning: string; // 100-500 chars
    lesson_duration_minutes: number; // 3-45 minutes
    calculation_explanation: string; // 50-300 chars
    total_lessons: number; // 10-100 (enforced minimum: 10)
    total_sections: number; // 1-30
    scope_warning: string | null; // Optional warning if scope borderline
    sections_breakdown: SectionBreakdown[]; // Detailed section plan
  };

  // Pedagogical strategy (Phase 3)
  pedagogical_strategy: {
    teaching_style: 'hands-on' | 'theory-first' | 'project-based' | 'mixed';
    assessment_approach: string; // 50-200 chars
    practical_focus: 'high' | 'medium' | 'low';
    progression_logic: string; // 100-500 chars
    interactivity_level: 'high' | 'medium' | 'low';
  };

  // NEW: Pedagogical patterns for Generation quality (Analyze Enhancement) - REQUIRED
  pedagogical_patterns: {
    primary_strategy: 'problem-based learning' | 'lecture-based' | 'inquiry-based' | 'project-based' | 'mixed';
    theory_practice_ratio: string; // e.g., "30:70", "50:50"
    assessment_types: Array<'coding' | 'quizzes' | 'projects' | 'essays' | 'presentations' | 'peer-review'>;
    key_patterns: string[]; // e.g., ["build incrementally", "learn by refactoring"]
  };

  // NEW: Structured generation guidance for Stage 5 - REQUIRED
  generation_guidance: {
    tone: 'conversational but precise' | 'formal academic' | 'casual friendly' | 'technical professional';
    use_analogies: boolean;
    specific_analogies: string[]; // e.g., ["assembly line for data flow"]
    avoid_jargon: string[]; // Terms to avoid or explain
    include_visuals: Array<'diagrams' | 'flowcharts' | 'code examples' | 'screenshots' | 'animations' | 'plots' | 'tables'>;
    exercise_types: ExerciseType[]; // From analysis-schemas.ts (includes all standard exercise formats)
    contextual_language_hints: string; // Audience assumptions
    real_world_examples: string[]; // Applications to reference
  };

  // Content strategy (Phase 5)
  content_strategy: 'create_from_scratch' | 'expand_and_enhance' | 'optimize_existing';

  // NEW: RAG Planning for Generation - document-to-section mapping (CRITICAL for T022) - REQUIRED (defaults to {})
  // Enhanced in v0.20.0 with confidence levels and search_queries
  document_relevance_mapping: {
    [section_id: string]: {
      primary_documents: string[]; // file_catalog IDs ranked by relevance
      search_queries: string[]; // Queries for RAG retrieval
      expected_topics: string[]; // Topics to find in chunks
      confidence: 'high' | 'medium'; // Based on processing_mode (high: all full_text, medium: any summary)
      note?: string; // Guidance for Generation
      // Legacy fields for backward compatibility (deprecated)
      key_search_terms?: string[]; // Use search_queries instead
      document_processing_methods?: {
        [document_id: string]: 'full_text' | 'hierarchical';
      };
    };
  };

  // Optional expansion areas (Phase 3)
  expansion_areas: ExpansionArea[] | null;

  // Research flags for time-sensitive content (Phase 3)
  research_flags: ResearchFlag[]; // Can be empty array

  // Metadata (all phases)
  metadata: {
    analysis_version: string; // e.g., 'v1.0.0'
    total_duration_ms: number;
    phase_durations_ms: Record<string, number>; // e.g., { phase_1: 5000, phase_2: 8000, ... }
    model_usage: Record<string, string>; // e.g., { phase_1: 'openai/gpt-oss-20b', phase_3: 'openai/gpt-oss-120b' }
    total_tokens: { input: number; output: number; total: number };
    total_cost_usd: number;
    retry_count: number; // Total retries across all phases
    quality_scores: Record<string, number>; // Semantic similarity scores per phase (0-1)
    created_at: string; // ISO 8601 timestamp
  };
}

/**
 * Section breakdown for course structure planning (Phase 2)
 */
export interface SectionBreakdown {
  area: string; // Section name/topic
  estimated_lessons: number; // Min 1
  importance: 'core' | 'important' | 'optional';
  learning_objectives: string[]; // 2-5 items
  key_topics: string[]; // 3-8 items
  pedagogical_approach: string; // 50-200 chars
  difficulty_progression: 'flat' | 'gradual' | 'steep';

  // NEW: Enhanced fields for Generation (Analyze Enhancement)
  section_id?: string; // e.g., "1", "2", "3" - unique identifier
  estimated_duration_hours?: number; // 0.5-20h - time to complete section
  difficulty?: 'beginner' | 'intermediate' | 'advanced'; // Difficulty level
  prerequisites?: string[]; // section_ids that must be completed first (empty if none)
}

/**
 * Optional content expansion areas (Phase 3)
 */
export interface ExpansionArea {
  area: string; // Topic needing more detail
  priority: 'critical' | 'important' | 'nice-to-have';
  specific_requirements: string[]; // 1-5 items
  estimated_lessons: number; // 1-10
}

/**
 * Research flags for time-sensitive content (Phase 3)
 */
export interface ResearchFlag {
  topic: string; // e.g., "Постановление 1875"
  reason: string; // e.g., "regulation_updates"
  context: string; // Why this needs research (50-200 chars)
}

/**
 * Phase 1 output: Course classification and contextual language
 */
export interface Phase1Output {
  course_category: {
    primary: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic';
    confidence: number;
    reasoning: string;
    secondary?: 'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic' | null;
  };
  contextual_language: {
    why_matters_context: string;
    motivators: string;
    experience_prompt: string;
    problem_statement_context: string;
    knowledge_bridge: string;
    practical_benefit_focus: string;
  };
  topic_analysis: {
    determined_topic: string;
    information_completeness: number;
    complexity: 'narrow' | 'medium' | 'broad';
    reasoning: string;
    target_audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    missing_elements: string[] | null;
    key_concepts: string[];
    domain_keywords: string[];
  };
  pedagogical_patterns: {
    primary_strategy: 'problem-based learning' | 'lecture-based' | 'inquiry-based' | 'project-based' | 'mixed';
    theory_practice_ratio: string; // e.g., "30:70", "50:50"
    assessment_types: Array<'coding' | 'quizzes' | 'projects' | 'essays' | 'presentations' | 'peer-review'>;
    key_patterns: string[]; // e.g., ["build incrementally", "learn by refactoring"]
  };
  phase_metadata: {
    duration_ms: number;
    model_used: string;
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
  };
}

/**
 * Phase 2 output: Scope and structure recommendations
 */
export interface Phase2Output {
  recommended_structure: {
    estimated_content_hours: number;
    scope_reasoning: string;
    lesson_duration_minutes: number;
    calculation_explanation: string;
    total_lessons: number;
    total_sections: number;
    scope_warning: string | null;
    sections_breakdown: SectionBreakdown[];
  };
  phase_metadata: {
    duration_ms: number;
    model_used: string;
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
    repair_metadata?: {
      layer_used: 'none' | 'layer1_repair' | 'layer2_revise' | 'layer3_partial' | 'layer4_120b' | 'layer5_emergency';
      repair_attempts: number;
      successful_fields?: string[];
      regenerated_fields?: string[];
      models_tried: string[];
    };
  };
}

/**
 * Phase 3 output: Expert pedagogical analysis
 */
export interface Phase3Output {
  pedagogical_strategy: {
    teaching_style: 'hands-on' | 'theory-first' | 'project-based' | 'mixed';
    assessment_approach: string;
    practical_focus: 'high' | 'medium' | 'low';
    progression_logic: string;
    interactivity_level: 'high' | 'medium' | 'low';
  };
  expansion_areas: ExpansionArea[] | null;
  research_flags: ResearchFlag[];
  phase_metadata: {
    duration_ms: number;
    model_used: string; // Always 120B for Phase 3
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
  };
}

/**
 * Phase 4 output: Document synthesis and generation instructions
 */
export interface Phase4Output {
  generation_guidance: {
    tone: 'conversational but precise' | 'formal academic' | 'casual friendly' | 'technical professional';
    use_analogies: boolean;
    specific_analogies: string[];
    avoid_jargon: string[];
    include_visuals: Array<'diagrams' | 'flowcharts' | 'code examples' | 'screenshots' | 'animations' | 'plots' | 'tables'>;
    exercise_types: ExerciseType[]; // From analysis-schemas.ts (includes all standard exercise formats)
    contextual_language_hints: string;
    real_world_examples: string[];
  };
  content_strategy: 'create_from_scratch' | 'expand_and_enhance' | 'optimize_existing';
  phase_metadata: {
    duration_ms: number;
    model_used: string; // Adaptive: 20B or 120B based on document count
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
    document_count: number;
  };
}
