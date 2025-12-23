import type {
  RefinementEvent,
  QualityLockViolation,
} from '@megacampus/shared-types';
import { logger } from '../../../../shared/logger';

/**
 * Emit a refinement event to the stream callback
 */
export function emitEvent(
  onStreamEvent: ((event: RefinementEvent) => void) | undefined,
  event: RefinementEvent
): void {
  if (onStreamEvent) {
    try {
      onStreamEvent(event);
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
      }, 'Error emitting refinement event');
    }
  }
}

/**
 * Emit quality_lock_triggered events for any violations detected
 */
export function emitQualityLockViolations(
  violations: QualityLockViolation[],
  onStreamEvent: ((event: RefinementEvent) => void) | undefined
): void {
  for (const violation of violations) {
    emitEvent(onStreamEvent, {
      type: 'quality_lock_triggered',
      sectionId: violation.sectionId,
      criterion: violation.criterion,
      lockedScore: violation.lockedScore,
      newScore: violation.newScore,
      delta: violation.delta,
    });

    logger.warn({
      sectionId: violation.sectionId,
      criterion: violation.criterion,
      lockedScore: violation.lockedScore,
      newScore: violation.newScore,
      delta: violation.delta,
    }, 'Quality lock violation detected');
  }
}
