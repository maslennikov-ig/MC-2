/**
 * Pipeline Admin Constants
 * @module server/routers/pipeline-admin/constants
 *
 * Static definitions for pipeline stages and their configurations.
 */

import type { PhaseName } from '@megacampus/shared-types';
import { DEFAULT_MODEL_ID, DEFAULT_FALLBACK_MODEL_ID, MODEL_DEFAULTS } from '@megacampus/shared-types';

// =============================================================================
// Static Stage Definitions
// =============================================================================

/**
 * Static definitions for the 6 pipeline stages
 * These are hardcoded because they represent the core architecture of the system
 */
export const PIPELINE_STAGES = [
  {
    number: 1,
    name: 'Document Upload',
    description: 'Upload and validate source documents',
    handlerPath: 'stages/stage1-document-upload',
    linkedPhases: [] as PhaseName[], // No LLM phases
    linkedPrompts: [] as string[], // No prompts
  },
  {
    number: 2,
    name: 'Document Processing',
    description: 'Parse, chunk, embed, and summarize documents',
    handlerPath: 'stages/stage2-document-processing',
    linkedPhases: ['stage_2_summarization'] as PhaseName[],
    linkedPrompts: [] as string[],
  },
  {
    number: 3,
    name: 'Document Classification',
    description: 'Classify and analyze document content',
    handlerPath: 'stages/stage3-classification',
    linkedPhases: ['stage_3_classification'] as PhaseName[],
    linkedPrompts: ['stage_3_comparative', 'stage_3_independent'],
  },
  {
    number: 4,
    name: 'Content Analysis',
    description: 'Expert analysis and synthesis of content',
    handlerPath: 'stages/stage4-analysis',
    linkedPhases: [
      'stage_4_classification',
      'stage_4_scope',
      'stage_4_expert',
      'stage_4_synthesis',
    ] as PhaseName[],
    linkedPrompts: ['stage_4_classification', 'stage_4_scope', 'stage_4_expert', 'stage_4_synthesis'],
  },
  {
    number: 5,
    name: 'Course Structure',
    description: 'Generate course structure and lesson specifications',
    handlerPath: 'stages/stage5-course-structure',
    linkedPhases: [
      'stage_5_metadata',
      'stage_5_sections',
      'stage_6_rag_planning',
    ] as PhaseName[],
    linkedPrompts: ['stage_5_metadata', 'stage_5_sections'],
  },
  {
    number: 6,
    name: 'Lesson Generation',
    description: 'Generate full lesson content with exercises',
    handlerPath: 'stages/stage6-lesson-content',
    linkedPhases: ['stage_6_judge', 'stage_6_refinement'] as PhaseName[],
    linkedPrompts: [
      'stage_6_planner',
      'stage_6_expander',
      'stage_6_assembler',
      'stage_6_smoother',
      'stage_6_judge',
    ],
  },
] as const;

/** Type for a single pipeline stage definition */
export type PipelineStageDefinition = (typeof PIPELINE_STAGES)[number];

// =============================================================================
// Default Model Configurations
// =============================================================================

/** Interface for default model configuration */
export interface DefaultModelConfig {
  modelId: string;
  temperature: number;
  maxTokens: number;
  fallbackModelId?: string;
}

/**
 * Hardcoded default model configurations for each phase
 * Used by resetModelConfigToDefault procedure
 *
 * NOTE: These are LAST RESORT fallbacks. Primary source is database.
 * Uses DEFAULT_MODEL_ID (Xiaomi MiMo V2 Flash) for standard phases.
 * Extended phases use Gemini 2.5 Flash for large context.
 */
export const DEFAULT_MODEL_CONFIGS: Record<PhaseName, DefaultModelConfig> = {
  // Global default (admin-configurable fallback)
  global_default: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  // Stage 2: Document Processing
  stage_2_summarization: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_2_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_2_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_2_extended_ru: {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  stage_2_extended_en: {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  // Stage 3: Classification
  stage_3_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.0,
    maxTokens: 2048,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  // Stage 4: Analysis
  stage_4_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_4_scope: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_4_expert: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.5,
    maxTokens: 8000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_4_synthesis: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 6000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_4_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_4_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_4_extended_ru: {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  stage_4_extended_en: {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  // Stage 5: Structure Generation
  stage_5_metadata: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_5_sections: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_5_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_5_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_5_extended_ru: {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  stage_5_extended_en: {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  // Stage 6: Lesson Content
  stage_6_rag_planning: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_6_judge: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.3,
    maxTokens: 4096,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_6_refinement: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.5,
    maxTokens: 8000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_6_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_6_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_6_extended_ru: {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  stage_6_extended_en: {
    modelId: 'x-ai/grok-4.1-fast',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  // Stage 6: Targeted Refinement phases
  stage_6_arbiter: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.0,
    maxTokens: 2048,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_6_patcher: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.1,
    maxTokens: 1000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_6_section_expander: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 2000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_6_delta_judge: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.0,
    maxTokens: 512,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  // Stage 7: Enrichments (Activities)
  // Cover uses image generation model (SeedDream 4.5) via OpenRouter's image endpoint.
  // Fallback to text model for prompt generation if image model unavailable.
  stage_7_cover: {
    modelId: 'bytedance-seed/seedream-4.5',
    temperature: 0.7,
    maxTokens: 1024,
    fallbackModelId: DEFAULT_MODEL_ID,
  },
  stage_7_video: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_7_audio: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_7_quiz: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_7_presentation: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  stage_7_document: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
  // Special phases
  emergency: {
    modelId: 'x-ai/grok-4-fast',
    temperature: 0.7,
    maxTokens: 30000,
    fallbackModelId: 'google/gemini-2.5-flash',
  },
  quality_fallback: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.3,
    maxTokens: 16000,
    fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  },
};
