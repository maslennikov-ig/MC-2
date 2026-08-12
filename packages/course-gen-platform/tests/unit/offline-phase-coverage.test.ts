/**
 * Offline routing coverage (mc2-zohi1).
 *
 * `config-seed.json` is what the platform routes on when Supabase is
 * unreachable, and it is a committed file refreshed by an explicit
 * `generate:config-seed` run. Between 2026-06 and 2026-08-12 that refresh was
 * impossible - its REQUIRED_PHASES list named two phases that had been dead for
 * months - so the seed silently fell twenty phases behind the code. A database
 * outage in that window would have routed all of Stage 7, all of Career
 * Playbook, chat and inline editing through `global_default`.
 *
 * This test fails when a phase the code resolves through getModelForPhase has
 * no offline default, so the next stale refresh is caught here rather than
 * during an outage.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_PHASE_CONFIGS } from '@/shared/llm/model-config-db';

/**
 * Phase names resolved through `getModelForPhase`, including the four Stage 2
 * names built at runtime as `stage_2_${tier}_${language}`
 * (stage2-document-processing/phases/phase-6-summarization.ts) and the three
 * Stage 6 tiers built as `stage_6_${tier}`
 * (stage6-lesson-content/nodes/generator/model-selector.ts).
 *
 * Deliberately absent: `stage_6_judge`, which exists only with a `judge_role`
 * and is read by the dedicated CLEV lookup, never as a plain phase.
 */
const RESOLVED_PHASES = [
  'global_default',
  'emergency',
  'quality_fallback',
  'stage_2_summarization',
  'stage_2_standard_ru',
  'stage_2_standard_en',
  'stage_2_extended_ru',
  'stage_2_extended_en',
  'stage_3_classification',
  'stage_4_clarifying',
  'stage_4_classification',
  'stage_4_expert',
  'stage_4_scope',
  'stage_4_synthesis',
  'stage_5_metadata',
  'stage_5_escalation',
  'stage_6_content',
  'stage_6_simple',
  'stage_6_normal',
  'stage_6_complex',
  'stage_6_refinement',
  'stage_6_rag_planning',
  'stage_6_arbiter',
  'stage_6_patcher',
  'stage_6_section_expander',
  'stage_6_delta_judge',
  'stage_6_auto_last_chance',
  'stage_6_manual_regeneration',
  'stage_7_cover',
  'stage_7_card',
  'stage_7_video',
  'stage_7_audio',
  'stage_7_quiz',
  'stage_7_presentation',
  'chat_intent_classification',
  'chat_node_refinement',
  'chat_global_guidance',
  'chat_full_regeneration',
  'chat_stage_5_refinement',
  'chat_stage_6_refinement',
  'inline_block_regeneration',
  'inline_element_crud',
  'stage_career_playbook_department_classifier',
  'stage_career_playbook_spec',
  'stage_career_playbook_followup',
  'stage_career_playbook_judge',
  'stage_career_playbook_proofreader',
  'stage_career_playbook_regenerator',
  'stage_career_playbook_group_1',
  'stage_career_playbook_group_2',
  'stage_career_playbook_group_3',
  'stage_career_playbook_group_4',
  'stage_career_playbook_group_5',
  'stage_career_playbook_group_6',
] as const;

describe('offline phase coverage', () => {
  it('every phase the code resolves has an offline default', () => {
    const missing = RESOLVED_PHASES.filter(phase => !DEFAULT_PHASE_CONFIGS[phase]);

    expect(missing).toEqual([]);
  });

  it('every offline default names a model', () => {
    const nameless = RESOLVED_PHASES.filter(phase => !DEFAULT_PHASE_CONFIGS[phase]?.modelId);

    expect(nameless).toEqual([]);
  });
});
