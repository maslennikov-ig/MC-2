import { describe, expect, it } from 'vitest';
import {
  classifyStage6QualityRecoveryFinalDisposition,
  getStage6ControlDecision,
  planStage6QualityRecoveryAttempts,
} from '@/stages/stage6-lesson-content/execution/quality-ladder';

describe('planStage6QualityRecoveryAttempts', () => {
  it.each([
    {
      initialAutomaticRung: 'stage_6_simple' as const,
      expected: ['stage_6_simple', 'stage_6_normal', 'stage_6_complex', 'stage_6_auto_last_chance'],
    },
    {
      initialAutomaticRung: 'stage_6_normal' as const,
      expected: ['stage_6_normal', 'stage_6_complex', 'stage_6_auto_last_chance'],
    },
    {
      initialAutomaticRung: 'stage_6_complex' as const,
      expected: ['stage_6_complex', 'stage_6_auto_last_chance'],
    },
  ])('plans automatic rungs from $initialAutomaticRung', ({ initialAutomaticRung, expected }) => {
    const attempts = planStage6QualityRecoveryAttempts({ initialAutomaticRung });

    expect(attempts.map(attempt => attempt.phase_name)).toEqual(expected);
  });

  it('always ends the automatic sequence with stage_6_auto_last_chance', () => {
    for (const initialAutomaticRung of ['stage_6_simple', 'stage_6_normal', 'stage_6_complex']) {
      const attempts = planStage6QualityRecoveryAttempts({
        initialAutomaticRung,
      });

      expect(attempts.at(-1)?.phase_name).toBe('stage_6_auto_last_chance');
    }
  });

  it('resolves manual-triggered recovery to stage_6_manual_regeneration', () => {
    const attempts = planStage6QualityRecoveryAttempts({ manualTriggered: true });

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      phase_name: 'stage_6_manual_regeneration',
      mode: 'manual',
      manual_triggered: true,
    });
  });

  it('applies balanced retry policy: initial rung=1, promoted rungs=0', () => {
    const attempts = planStage6QualityRecoveryAttempts({
      initialAutomaticRung: 'stage_6_simple',
    });

    expect(attempts[0].max_regeneration_retries).toBe(1);
    expect(attempts.slice(1).every(attempt => attempt.max_regeneration_retries === 0)).toBe(true);
  });
});

describe('Stage 6 quality recovery terminal decisions', () => {
  it('classifies highest automatic rung exhaustion as terminal review_required', () => {
    expect(
      classifyStage6QualityRecoveryFinalDisposition({
        exhaustedPhaseName: 'stage_6_auto_last_chance',
        mode: 'automatic',
      })
    ).toEqual({
      outcome: 'review_required',
      terminal_phase_name: 'stage_6_auto_last_chance',
      terminal_mode: 'automatic',
      human_review_required: true,
    });
  });

  it('does not plan a rung beyond the manual top model', () => {
    const decision = getStage6ControlDecision({
      manualTriggered: true,
      exhaustedPhaseName: 'stage_6_manual_regeneration',
    });

    expect(decision).toEqual({
      action: 'human_review_required',
      attempt: null,
      finalDisposition: {
        outcome: 'review_required',
        terminal_phase_name: 'stage_6_manual_regeneration',
        terminal_mode: 'manual',
        human_review_required: true,
      },
    });
  });
});
