import { describe, expect, it } from 'vitest';
import { isDocumentEvidenceActive } from '@/shared/document-evidence/rollout';

import {
  DOCUMENT_EVIDENCE_STAGE5_COHORT_HASH_VERSION,
  getDocumentEvidenceStage5CohortBucket,
  isDocumentEvidenceStage5EnrichmentEnabled,
  parseDocumentEvidenceStage5CohortPercent,
} from '@/stages/stage5-generation/evidence/rollout';

const courseOutsideHalfCohort = '20000000-0000-4000-8000-000000000001';
const courseInsideHalfCohort = '20000000-0000-4000-8000-000000000002';

describe('Stage 5 document-evidence rollout', () => {
  it('requires the generic document-evidence gate to be exactly enabled and active', () => {
    expect(isDocumentEvidenceActive({})).toBe(false);
    expect(
      isDocumentEvidenceActive({
        DOCUMENT_EVIDENCE_ENABLED: 'false',
        DOCUMENT_EVIDENCE_MODE: 'active',
      })
    ).toBe(false);
    expect(
      isDocumentEvidenceActive({
        DOCUMENT_EVIDENCE_ENABLED: 'true',
        DOCUMENT_EVIDENCE_MODE: 'shadow',
      })
    ).toBe(false);
    expect(
      isDocumentEvidenceActive({
        DOCUMENT_EVIDENCE_ENABLED: 'true',
        DOCUMENT_EVIDENCE_MODE: 'active',
      })
    ).toBe(true);
  });

  it('parses only integer cohort percentages from zero through one hundred', () => {
    expect(parseDocumentEvidenceStage5CohortPercent(undefined)).toBe(0);
    expect(parseDocumentEvidenceStage5CohortPercent('')).toBe(0);
    expect(parseDocumentEvidenceStage5CohortPercent('0')).toBe(0);
    expect(parseDocumentEvidenceStage5CohortPercent('50')).toBe(50);
    expect(parseDocumentEvidenceStage5CohortPercent('100')).toBe(100);

    for (const invalid of ['-1', '101', '1.5', '50%', 'not-a-number']) {
      expect(parseDocumentEvidenceStage5CohortPercent(invalid)).toBe(0);
    }
  });

  it('fails closed when the global flag is disabled, mode is shadow, or cohort is zero', () => {
    expect(
      isDocumentEvidenceStage5EnrichmentEnabled(courseInsideHalfCohort, {
        DOCUMENT_EVIDENCE_ENABLED: 'false',
        DOCUMENT_EVIDENCE_MODE: 'active',
        DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT: '100',
      })
    ).toBe(false);
    expect(
      isDocumentEvidenceStage5EnrichmentEnabled(courseInsideHalfCohort, {
        DOCUMENT_EVIDENCE_ENABLED: 'true',
        DOCUMENT_EVIDENCE_MODE: 'shadow',
        DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT: '100',
      })
    ).toBe(false);
    expect(
      isDocumentEvidenceStage5EnrichmentEnabled(courseInsideHalfCohort, {
        DOCUMENT_EVIDENCE_ENABLED: 'true',
        DOCUMENT_EVIDENCE_MODE: 'active',
      })
    ).toBe(false);
    expect(
      isDocumentEvidenceStage5EnrichmentEnabled(courseInsideHalfCohort, {
        DOCUMENT_EVIDENCE_ENABLED: 'true',
        DOCUMENT_EVIDENCE_MODE: 'active',
        DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT: 'invalid',
      })
    ).toBe(false);
  });

  it('uses the versioned SHA-256 bucket deterministically for bounded selection', () => {
    expect(DOCUMENT_EVIDENCE_STAGE5_COHORT_HASH_VERSION).toBe('document-evidence-stage5-cohort-v1');
    expect(getDocumentEvidenceStage5CohortBucket(courseOutsideHalfCohort)).toBe(71);
    expect(getDocumentEvidenceStage5CohortBucket(courseInsideHalfCohort)).toBe(24);
    expect(getDocumentEvidenceStage5CohortBucket(courseInsideHalfCohort)).toBe(24);

    const activeHalfCohort = {
      DOCUMENT_EVIDENCE_ENABLED: 'true',
      DOCUMENT_EVIDENCE_MODE: 'active',
      DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT: '50',
    } as const;
    expect(
      isDocumentEvidenceStage5EnrichmentEnabled(courseOutsideHalfCohort, activeHalfCohort)
    ).toBe(false);
    expect(
      isDocumentEvidenceStage5EnrichmentEnabled(courseInsideHalfCohort, activeHalfCohort)
    ).toBe(true);
  });

  it('selects every valid course at one hundred percent', () => {
    const activeFullCohort = {
      DOCUMENT_EVIDENCE_ENABLED: 'true',
      DOCUMENT_EVIDENCE_MODE: 'active',
      DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT: '100',
    } as const;

    expect(
      isDocumentEvidenceStage5EnrichmentEnabled(courseOutsideHalfCohort, activeFullCohort)
    ).toBe(true);
    expect(
      isDocumentEvidenceStage5EnrichmentEnabled(courseInsideHalfCohort, activeFullCohort)
    ).toBe(true);
  });
});
