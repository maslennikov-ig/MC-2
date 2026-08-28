/**
 * Pipeline Admin Constants
 * @module server/routers/pipeline-admin/constants
 *
 * Static definitions for pipeline stages and their configurations.
 */

import type { PhaseName } from '@megacampus/shared-types/model-config';

import { resolveDefaultPhaseConfig } from '@/shared/llm/model-config-service';

// =============================================================================
// Static Stage Definitions
// =============================================================================

/**
 * Static definitions for the 7 pipeline stages
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
    linkedPrompts: [
      'stage_4_classification',
      'stage_4_scope',
      'stage_4_expert',
      'stage_4_synthesis',
    ],
  },
  {
    number: 5,
    name: 'Course Structure',
    description: 'Generate course structure and lesson specifications',
    handlerPath: 'stages/stage5-course-structure',
    linkedPhases: [
      'stage_5_metadata',
      'stage_5_simple',
      'stage_5_normal',
      'stage_5_complex',
      // Legacy phases kept for backward compatibility until PhaseName type is updated (task #4)
      'stage_5_sections',
      'stage_5_tier1',
      'stage_5_escalation',
    ] as PhaseName[],
    linkedPrompts: ['stage_5_metadata', 'stage_5_sections'],
  },
  {
    number: 6,
    name: 'Lesson Generation',
    description: 'Generate full lesson content with exercises',
    handlerPath: 'stages/stage6-lesson-content',
    linkedPhases: [
      'stage_6_judge',
      'stage_6_refinement',
      'stage_6_rag_planning',
      'stage_6_simple',
      'stage_6_normal',
      'stage_6_complex',
      'stage_6_auto_last_chance',
      'stage_6_manual_regeneration',
      'stage_6_arbiter',
      'stage_6_patcher',
      'stage_6_section_expander',
      'stage_6_delta_judge',
    ] as PhaseName[],
    linkedPrompts: [
      'stage_6_planner',
      'stage_6_expander',
      'stage_6_assembler',
      'stage_6_smoother',
      'stage_6_judge',
    ],
  },
  {
    number: 7,
    name: 'Enrichments',
    description:
      'Generate multimedia enrichments: covers, cards, videos, audio, quizzes, presentations',
    handlerPath: 'stages/stage7-enrichment',
    linkedPhases: [
      'stage_7_cover',
      'stage_7_card',
      'stage_7_video',
      'stage_7_audio',
      'stage_7_quiz',
      'stage_7_presentation',
    ] as PhaseName[],
    linkedPrompts: [
      'stage7_card_course',
      'stage7_card_lesson',
      'stage7_cover_system',
      'stage7_cover_user',
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

type PipelineDefaultPhaseName = PhaseName | 'stage_6_content';

/**
 * The default a superadmin "reset to default" writes back into
 * `llm_model_config`.
 *
 * Read from the committed snapshot of that same table rather than restated
 * here. Until 2026-08-28 this was a hand-typed table of 60 phases, and it had
 * drifted into a third opinion: `stage_7_cover` still named
 * `google/gemini-2.5-flash-image` after the cover moved to Riverflow,
 * `stage_4_clarifying` fell back to `anthropic/claude-sonnet-4` — an id in no
 * catalogue in this repo — and none of the eleven `stage_career_playbook_*`
 * phases appeared at all, so resetting one was impossible.
 *
 * "Default" now means the last snapshot taken from the database, which is what
 * an operator pressing that button expects and the only meaning that cannot go
 * stale on its own (mc2-u8kwx).
 */
export function getDefaultModelConfig(
  phaseName: PipelineDefaultPhaseName
): DefaultModelConfig | null {
  const seeded = resolveDefaultPhaseConfig(phaseName);
  if (!seeded) return null;

  return {
    modelId: seeded.modelId,
    temperature: seeded.temperature,
    maxTokens: seeded.maxTokens,
    ...(seeded.fallbackModelId ? { fallbackModelId: seeded.fallbackModelId } : {}),
  };
}
