import { describe, expect, it } from 'vitest';
import { LessonContentMetadataSchema } from '../src/lesson-content';
import {
  QualityRecoveryAttemptSchema,
  QualityRecoveryFinalDispositionSchema,
  QualityRecoverySchema,
} from '../src/stage6-quality-recovery';

describe('Stage 6 quality recovery shared types', () => {
  it('parses recovery attempts and terminal disposition', () => {
    const attempt = QualityRecoveryAttemptSchema.parse({
      sequence_index: 0,
      phase_name: 'stage_6_manual_regeneration',
      mode: 'manual',
      is_initial_rung: true,
      max_regeneration_retries: 0,
      manual_triggered: true,
      selected_model: 'google/gemini-3.5-flash',
      fallback_model: 'z-ai/glm-5',
      model_used: 'google/gemini-3.5-flash',
    });

    const finalDisposition = QualityRecoveryFinalDispositionSchema.parse({
      outcome: 'review_required',
      terminal_phase_name: 'stage_6_manual_regeneration',
      terminal_mode: 'manual',
      human_review_required: true,
    });

    const recovery = QualityRecoverySchema.parse({
      mode: 'manual',
      attempts: [attempt],
      final_disposition: finalDisposition,
      manual_triggered: true,
    });

    expect(recovery.attempts[0].phase_name).toBe('stage_6_manual_regeneration');
    expect(recovery.attempts[0].model_used).toBe('google/gemini-3.5-flash');
    expect(recovery.final_disposition.terminal_mode).toBe('manual');
  });

  it('allows lesson metadata to include optional qualityRecovery details', () => {
    const metadata = LessonContentMetadataSchema.parse({
      total_words: 1200,
      total_tokens: 2400,
      cost_usd: 0.4,
      quality_score: 0.71,
      rag_chunks_used: 8,
      generation_duration_ms: 15000,
      model_used: 'z-ai/glm-5',
      archetype_used: 'concept_explainer',
      temperature_used: 0.7,
      qualityRecovery: {
        mode: 'automatic',
        attempts: [
          {
            sequence_index: 0,
            phase_name: 'stage_6_complex',
            mode: 'automatic',
            is_initial_rung: true,
            max_regeneration_retries: 1,
          },
          {
            sequence_index: 1,
            phase_name: 'stage_6_auto_last_chance',
            mode: 'automatic',
            is_initial_rung: false,
            promoted_from_phase_name: 'stage_6_complex',
            max_regeneration_retries: 0,
            selected_model: 'z-ai/glm-5',
            model_used: 'z-ai/glm-5',
          },
        ],
        final_disposition: {
          outcome: 'review_required',
          terminal_phase_name: 'stage_6_auto_last_chance',
          terminal_mode: 'automatic',
          human_review_required: true,
        },
      },
    });

    expect(metadata.qualityRecovery?.attempts.at(-1)?.phase_name).toBe('stage_6_auto_last_chance');
    expect(metadata.qualityRecovery?.attempts.at(-1)?.model_used).toBe('z-ai/glm-5');
  });
});
