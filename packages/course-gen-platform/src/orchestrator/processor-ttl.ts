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

export function getWorkerLockDurationMs(): number {
  return Math.max(getDefaultProcessorMaxTtlMs(), getCareerPlaybookProcessorMaxTtlMs());
}
