import { createHash } from 'node:crypto';

export const TIER1_SHADOW_COHORT_HASH_VERSION = 'tier1-shadow-retrieval-v1' as const;

const SHADOW_COHORT_BUCKETS = 10_000;

/** Parse a 0..1 rollout rate, failing closed for absent or invalid values. */
export function parseTier1ShadowRetrievalRate(value: string | undefined): number {
  const normalized = value?.trim() ?? '';
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/u.test(normalized)) return 0;

  const rate = Number(normalized);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0;
}

/** Assign one lesson to a stable 0..9999 bucket across worker retries. */
export function getTier1ShadowCohortBucket(courseId: string, lessonId: string): number {
  const digest = createHash('sha256')
    .update(
      `${TIER1_SHADOW_COHORT_HASH_VERSION}:${courseId.toLowerCase()}:${lessonId.toLowerCase()}`
    )
    .digest();
  return digest.readUInt32BE(0) % SHADOW_COHORT_BUCKETS;
}

export function resolveTier1ShadowSelection(
  courseId: string,
  lessonId: string,
  value: string | undefined = process.env.RAG_SHADOW_RETRIEVAL_RATE
): { rate: number; sampled: boolean } {
  const rate = parseTier1ShadowRetrievalRate(value);
  if (rate === 0) return { rate, sampled: false };
  if (rate === 1) return { rate, sampled: true };

  const selectedBuckets = Math.floor(rate * SHADOW_COHORT_BUCKETS);
  return {
    rate,
    sampled: getTier1ShadowCohortBucket(courseId, lessonId) < selectedBuckets,
  };
}
