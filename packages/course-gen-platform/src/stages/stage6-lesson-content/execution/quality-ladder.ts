import type {
  QualityRecoveryAttempt,
  QualityRecoveryFinalDisposition,
  QualityRecoveryMode,
  Stage6AutomaticQualityRungPhaseName,
  Stage6QualityRungPhaseName,
} from '@megacampus/shared-types/stage6-quality-recovery';
import {
  STAGE6_AUTOMATIC_QUALITY_RUNGS,
  STAGE6_MANUAL_QUALITY_RUNG,
  STAGE6_QUALITY_RUNG_CONFIGS,
} from '../config';
import type { Stage6ControlDecision } from '../types';

interface PlanStage6QualityRecoveryInput {
  initialAutomaticRung?: Stage6AutomaticQualityRungPhaseName;
  manualTriggered?: boolean;
}

function buildQualityRecoveryAttempt(
  phaseName: Stage6QualityRungPhaseName,
  sequenceIndex: number,
  initialPhaseName: Stage6QualityRungPhaseName,
  promotedFromPhaseName?: Stage6QualityRungPhaseName
): QualityRecoveryAttempt {
  const rungConfig = STAGE6_QUALITY_RUNG_CONFIGS[phaseName];
  const isInitialRung = phaseName === initialPhaseName;

  return {
    sequence_index: sequenceIndex,
    phase_name: phaseName,
    mode: rungConfig.mode,
    is_initial_rung: isInitialRung,
    promoted_from_phase_name: promotedFromPhaseName,
    max_regeneration_retries: isInitialRung
      ? rungConfig.initialMaxRegenerationRetries
      : rungConfig.promotedMaxRegenerationRetries,
    manual_triggered: rungConfig.mode === 'manual' ? true : undefined,
  };
}

export function planStage6QualityRecoveryAttempts(
  input: PlanStage6QualityRecoveryInput
): QualityRecoveryAttempt[] {
  if (input.manualTriggered) {
    return [buildQualityRecoveryAttempt(STAGE6_MANUAL_QUALITY_RUNG, 0, STAGE6_MANUAL_QUALITY_RUNG)];
  }

  if (!input.initialAutomaticRung) {
    throw new Error('initialAutomaticRung is required for automatic Stage 6 quality recovery');
  }

  const startIndex = STAGE6_AUTOMATIC_QUALITY_RUNGS.indexOf(input.initialAutomaticRung);
  if (startIndex === -1) {
    throw new Error(`Unknown Stage 6 automatic rung: ${input.initialAutomaticRung}`);
  }

  const plannedRungs = STAGE6_AUTOMATIC_QUALITY_RUNGS.slice(startIndex);

  return plannedRungs.map((phaseName, index) =>
    buildQualityRecoveryAttempt(
      phaseName,
      index,
      plannedRungs[0],
      index > 0 ? plannedRungs[index - 1] : undefined
    )
  );
}

export function classifyStage6QualityRecoveryFinalDisposition(input: {
  exhaustedPhaseName: Stage6QualityRungPhaseName;
  mode: QualityRecoveryMode;
}): QualityRecoveryFinalDisposition {
  return {
    outcome: 'review_required',
    terminal_phase_name: input.exhaustedPhaseName,
    terminal_mode: input.mode,
    human_review_required: true,
  };
}

export function getStage6ControlDecision(input: {
  exhaustedPhaseName?: Stage6QualityRungPhaseName;
  initialAutomaticRung?: Stage6AutomaticQualityRungPhaseName;
  manualTriggered?: boolean;
}): Stage6ControlDecision {
  const attempts = planStage6QualityRecoveryAttempts(input);

  if (!input.exhaustedPhaseName) {
    return {
      action: 'run_rung',
      attempt: attempts[0] ?? null,
      finalDisposition: null,
    };
  }

  const currentIndex = attempts.findIndex(
    attempt => attempt.phase_name === input.exhaustedPhaseName
  );
  const nextAttempt = currentIndex >= 0 ? attempts[currentIndex + 1] : null;

  if (nextAttempt) {
    return {
      action: 'run_rung',
      attempt: nextAttempt,
      finalDisposition: null,
    };
  }

  const terminalMode: QualityRecoveryMode = input.manualTriggered ? 'manual' : 'automatic';

  return {
    action: 'human_review_required',
    attempt: null,
    finalDisposition: classifyStage6QualityRecoveryFinalDisposition({
      exhaustedPhaseName: input.exhaustedPhaseName,
      mode: terminalMode,
    }),
  };
}
