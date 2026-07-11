import { createHash } from 'node:crypto';
import {
  isDocumentEvidenceActive,
  type DocumentEvidenceRolloutEnvironment,
} from '@/shared/document-evidence/rollout';

export const DOCUMENT_EVIDENCE_STAGE5_COHORT_HASH_VERSION =
  'document-evidence-stage5-cohort-v1' as const;

export interface DocumentEvidenceStage5RolloutEnvironment
  extends DocumentEvidenceRolloutEnvironment {
  DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT?: string;
}

/** Parse the bounded rollout percentage, failing closed for absent or invalid values. */
export function parseDocumentEvidenceStage5CohortPercent(value: string | undefined): number {
  const normalized = value?.trim() ?? '';
  if (!/^\d+$/u.test(normalized)) return 0;

  const percentage = Number(normalized);
  return Number.isSafeInteger(percentage) && percentage >= 0 && percentage <= 100 ? percentage : 0;
}

/**
 * Assign a course to a stable 0..99 bucket.
 *
 * The versioned SHA-256 input and first-32-bit reduction are part of the rollout
 * contract: changing either requires a new version because it reshuffles courses.
 */
export function getDocumentEvidenceStage5CohortBucket(courseId: string): number {
  const digest = createHash('sha256')
    .update(`${DOCUMENT_EVIDENCE_STAGE5_COHORT_HASH_VERSION}:${courseId.toLowerCase()}`)
    .digest();
  return digest.readUInt32BE(0) % 100;
}

/** Select the live Stage 5 evidence pass only for the explicitly active cohort. */
export function isDocumentEvidenceStage5EnrichmentEnabled(
  courseId: string,
  environment: DocumentEvidenceStage5RolloutEnvironment = {
    DOCUMENT_EVIDENCE_ENABLED: process.env.DOCUMENT_EVIDENCE_ENABLED,
    DOCUMENT_EVIDENCE_MODE: process.env.DOCUMENT_EVIDENCE_MODE,
    DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT: process.env.DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT,
  }
): boolean {
  if (!isDocumentEvidenceActive(environment)) return false;

  const percentage = parseDocumentEvidenceStage5CohortPercent(
    environment.DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT
  );
  if (percentage === 0) return false;
  if (percentage === 100) return true;
  return getDocumentEvidenceStage5CohortBucket(courseId) < percentage;
}
