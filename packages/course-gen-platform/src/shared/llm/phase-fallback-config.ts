/**
 * The last-resort model settings, when nothing else can be asked.
 *
 * Lifted out of `langchain-models.ts` because it is a table, not a factory: the
 * factory file was over the 500-line lint budget, and that budget is exact —
 * one warning past it fails CI and with it the deploy.
 *
 * @module shared/llm/phase-fallback-config
 */

import type { PhaseName } from '@megacampus/shared-types/model-config';
import {
  DEFAULT_MODEL_ID,
  MODEL_DEFAULTS,
  CHAT_PRIMARY_MODEL_ID,
  CHAT_STAGE6_PRIMARY_MODEL_ID,
} from '@megacampus/shared-types';
import { STAGE6_CANONICAL_PHASE_DEFAULTS } from '@megacampus/shared-types/stage6-model-config';

/**
 * Hardcoded fallback configurations for each phase
 * Used when database is unavailable or config not found
 *
 * NOTE: These are LAST RESORT fallbacks. Primary source is database.
 * All standard phases now use DEFAULT_MODEL_ID (DeepSeek V4 Flash).
 * Special phases (emergency, quality_fallback) keep specific models.
 *
 * Hierarchy:
 * 1. DB config for specific phase
 * 2. DB global_default config
 * 3. These hardcoded constants
 */
export const PHASE_FALLBACK_CONFIG: Record<
  PhaseName,
  { modelId: string; temperature: number; maxTokens: number }
> = {
  // Stage 3: Classification
  stage_3_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.0, // Deterministic for classification
    maxTokens: 2048,
  },
  // Stage 4: Analysis phases
  stage_4_clarifying: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.5, // Moderate creativity for question generation
    maxTokens: 16000, // Large JSON output: 7+ questions with answers + thinking overhead
  },
  stage_4_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  stage_4_scope: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  stage_4_expert: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.5,
    maxTokens: 8000,
  },
  stage_4_synthesis: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 16000, // Large structured output for course synthesis
  },
  stage_4_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_4_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_4_extended_ru: {
    modelId: 'google/gemini-3.7-flash', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_4_extended_en: {
    modelId: 'google/gemini-3.7-flash', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 5: Generation phases
  stage_5_metadata: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  stage_5_sections: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_5_tier1: {
    modelId: 'deepseek/deepseek-v4-flash',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_escalation: {
    modelId: 'moonshotai/kimi-k2-thinking',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_simple: {
    modelId: 'deepseek/deepseek-v4-flash',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_normal: {
    modelId: 'moonshotai/kimi-k2-thinking',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_complex: {
    modelId: 'qwen/qwen3.7-plus',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_5_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_5_extended_ru: {
    modelId: 'google/gemini-3.7-flash', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_5_extended_en: {
    modelId: 'google/gemini-3.7-flash', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 2: Summarization phases
  stage_2_summarization: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
  },
  stage_2_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
  },
  stage_2_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
  },
  stage_2_extended_ru: {
    modelId: 'google/gemini-3.7-flash', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_2_extended_en: {
    modelId: 'google/gemini-3.7-flash', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 6: Lesson generation phases
  stage_6_judge: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.3,
    maxTokens: 4096,
  },
  stage_6_content: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.maxTokens,
  },
  stage_6_refinement: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_refinement.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_refinement.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_refinement.maxTokens,
  },
  stage_6_rag_planning: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_rag_planning.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_rag_planning.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_rag_planning.maxTokens,
  },
  stage_6_simple: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_simple.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_simple.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_simple.maxTokens,
  },
  stage_6_normal: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_normal.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_normal.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_normal.maxTokens,
  },
  stage_6_complex: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_complex.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_complex.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_complex.maxTokens,
  },
  stage_6_auto_last_chance: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.maxTokens,
  },
  stage_6_manual_regeneration: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.maxTokens,
  },
  stage_6_arbiter: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_arbiter.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_arbiter.temperature, // Deterministic for agreement scoring
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_arbiter.maxTokens,
  },
  stage_6_patcher: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_patcher.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_patcher.temperature, // Low temp for precise editing
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_patcher.maxTokens, // Small output for patches
  },
  stage_6_section_expander: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_section_expander.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_section_expander.temperature, // Moderate creativity
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_section_expander.maxTokens, // Larger output for full sections
  },
  stage_6_delta_judge: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_delta_judge.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_delta_judge.temperature, // Deterministic for validation
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_delta_judge.maxTokens, // Small focused output
  },
  stage_6_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_6_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_6_extended_ru: {
    modelId: 'google/gemini-3.7-flash', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_6_extended_en: {
    modelId: 'deepseek/deepseek-v4-flash', // Extended context for EN
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 7: Enrichments (Activities)
  // Cover and Card use image generation models directly (not LLM text generation)
  stage_7_cover: {
    modelId: 'google/gemini-2.5-flash-image', // 16:9 aspect ratio, $0.038
    temperature: 0.7,
    maxTokens: 1024,
  },
  stage_7_card: {
    modelId: 'openai/gpt-5-image-mini', // 1:1 square 1024x1024, $0.007
    temperature: 0.7,
    maxTokens: 1024,
  },
  stage_7_video: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_7_audio: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_7_quiz: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  stage_7_presentation: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_7_document: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  // Special phases (keep specific models)
  emergency: {
    modelId: 'deepseek/deepseek-v4-flash', // Large context (2M tokens)
    temperature: 0.7,
    maxTokens: 30000,
  },
  quality_fallback: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.3,
    maxTokens: 16000,
  },
  // Global default (used when phase not found)
  global_default: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  // Chat phases (model IDs from @megacampus/shared-types)
  chat_intent_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.1,
    maxTokens: 200,
  },
  chat_node_refinement: {
    modelId: CHAT_PRIMARY_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  chat_global_guidance: {
    modelId: CHAT_PRIMARY_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  chat_full_regeneration: {
    modelId: CHAT_PRIMARY_MODEL_ID,
    temperature: 0.6,
    maxTokens: 8192,
  },
  chat_stage_5_refinement: {
    modelId: CHAT_PRIMARY_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  chat_stage_6_refinement: {
    modelId: CHAT_STAGE6_PRIMARY_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  // Inline operations
  inline_block_regeneration: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 2000,
  },
  inline_element_crud: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4000,
  },
};
