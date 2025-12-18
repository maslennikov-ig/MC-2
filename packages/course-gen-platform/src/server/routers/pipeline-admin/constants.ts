/**
 * Pipeline Admin Constants
 * @module server/routers/pipeline-admin/constants
 *
 * Static definitions for pipeline stages and their configurations.
 */

import type { PhaseName } from '@megacampus/shared-types';

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
 * Source: packages/course-gen-platform/src/shared/llm/langchain-models.ts
 */
export const DEFAULT_MODEL_CONFIGS: Record<PhaseName, DefaultModelConfig> = {
  stage_4_classification: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 4096,
    fallbackModelId: 'openai/gpt-oss-120b',
  },
  stage_4_scope: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 4096,
    fallbackModelId: 'openai/gpt-oss-120b',
  },
  stage_4_expert: {
    modelId: 'openai/gpt-oss-120b',
    temperature: 0.5,
    maxTokens: 8000,
    fallbackModelId: 'moonshotai/kimi-k2-0905',
  },
  stage_4_synthesis: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 6000,
    fallbackModelId: 'openai/gpt-oss-120b',
  },
  stage_6_rag_planning: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 4096,
    fallbackModelId: 'openai/gpt-oss-120b',
  },
  emergency: {
    modelId: 'x-ai/grok-4-fast',
    temperature: 0.7,
    maxTokens: 30000,
  },
  quality_fallback: {
    modelId: 'moonshotai/kimi-k2-0905',
    temperature: 0.3,
    maxTokens: 16000,
  },
  stage_2_summarization: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 10000,
    fallbackModelId: 'openai/gpt-oss-120b',
  },
  stage_2_standard_ru: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 10000,
    fallbackModelId: 'openai/gpt-oss-120b',
  },
  stage_2_standard_en: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 10000,
    fallbackModelId: 'openai/gpt-oss-120b',
  },
  stage_2_extended_ru: {
    modelId: 'openai/gpt-oss-120b',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: 'x-ai/grok-4-fast',
  },
  stage_2_extended_en: {
    modelId: 'openai/gpt-oss-120b',
    temperature: 0.7,
    maxTokens: 15000,
    fallbackModelId: 'x-ai/grok-4-fast',
  },
  stage_3_classification: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.0,
    maxTokens: 2048,
  },
  stage_5_metadata: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 4096,
  },
  stage_5_sections: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_6_judge: {
    modelId: 'openai/gpt-oss-120b',
    temperature: 0.3,
    maxTokens: 4096,
  },
  stage_6_refinement: {
    modelId: 'openai/gpt-oss-120b',
    temperature: 0.5,
    maxTokens: 8000,
  },
  // Stage 6: Targeted Refinement phases
  stage_6_arbiter: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.0,
    maxTokens: 2048,
  },
  stage_6_patcher: {
    modelId: 'openai/gpt-oss-120b',
    temperature: 0.1,
    maxTokens: 1000,
  },
  stage_6_section_expander: {
    modelId: 'openai/gpt-oss-120b',
    temperature: 0.7,
    maxTokens: 2000,
  },
  stage_6_delta_judge: {
    modelId: 'openai/gpt-oss-20b',
    temperature: 0.0,
    maxTokens: 512,
  },
};
