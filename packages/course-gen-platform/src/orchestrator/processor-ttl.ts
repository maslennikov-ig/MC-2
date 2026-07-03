import { JobType } from '@megacampus/shared-types';

export const DEFAULT_PROCESSOR_MAX_TTL_MS = 2_700_000; // 45 minutes
export const DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS = 7_200_000; // 120 minutes

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDefaultProcessorMaxTtlMs(): number {
  return parsePositiveIntegerEnv('PROCESSOR_MAX_TTL_MS', DEFAULT_PROCESSOR_MAX_TTL_MS);
}

export function getCareerPlaybookProcessorMaxTtlMs(): number {
  return parsePositiveIntegerEnv(
    'CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS',
    DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS
  );
}

export function getProcessorMaxTtlMsForJobType(jobType: string | undefined): number {
  if (jobType === JobType.CAREER_PLAYBOOK) {
    return getCareerPlaybookProcessorMaxTtlMs();
  }

  return getDefaultProcessorMaxTtlMs();
}

/**
 * Fraction of the hard TTL at which a soft-budget warning marker is emitted.
 *
 * The marker fires slightly before the hard `process.exit()` kill so operators
 * get an early, distinct signal that an expensive job is at risk of a terminal
 * TTL timeout. For Career Playbook a hard-kill is terminal (attempts capped at 1
 * in the queue to prevent full-regeneration cost runaways), so this is the last
 * observable signal before the job is abandoned.
 */
export const DEFAULT_PROCESSOR_SOFT_BUDGET_RATIO = 0.9;

/**
 * Compute the soft-budget threshold (ms) for a job type.
 *
 * The soft-budget warning applies ONLY to the expensive Career Playbook job
 * class, where a TTL hard-kill is terminal (attempts capped at 1). Every other
 * job type returns `0` so callers arm no extra timer and keep their behavior
 * byte-for-byte unchanged. Also returns `0` when the ratio is outside the open
 * interval (0, 1). Kept as a pure function so the threshold policy and math are
 * unit-testable without arming real timers.
 */
export function getProcessorSoftBudgetMs(
  jobType: string | undefined,
  ratio: number = DEFAULT_PROCESSOR_SOFT_BUDGET_RATIO
): number {
  if (jobType !== JobType.CAREER_PLAYBOOK) return 0;
  if (!(ratio > 0 && ratio < 1)) return 0;
  return Math.floor(getProcessorMaxTtlMsForJobType(jobType) * ratio);
}

export function getWorkerLockDurationMs(): number {
  return Math.max(getDefaultProcessorMaxTtlMs(), getCareerPlaybookProcessorMaxTtlMs());
}
