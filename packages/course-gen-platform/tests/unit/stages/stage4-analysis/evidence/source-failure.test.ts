import { describe, expect, it } from 'vitest';
import {
  parseAuditedSourceFailure,
  parseLowerCaseUuidV4,
} from '@/stages/stage4-analysis/evidence/source-failure';

const canonicalRunId = '90000000-0000-4000-8000-000000000009';

describe('audited source failure identity', () => {
  it('accepts only the exact lower-case UUIDv4 recovery disposition', () => {
    expect(parseLowerCaseUuidV4(canonicalRunId)).toBe(canonicalRunId);
    expect(
      parseAuditedSourceFailure(
        'failed',
        `source_file_unrecoverable; recovery_run=${canonicalRunId}`
      )
    ).toEqual({
      reason: 'source_file_unrecoverable',
      recoveryRunId: canonicalRunId,
    });
  });

  it.each([
    ['malformed', 'not-a-uuid'],
    ['upper-case', '90000000-0000-4000-8000-00000000000A'],
    ['uuid-v1', '90000000-0000-1000-8000-000000000009'],
    ['uuid-v8', '90000000-0000-8000-8000-000000000009'],
    ['wrong-variant', '90000000-0000-4000-7000-000000000009'],
    ['leading-whitespace', ` ${canonicalRunId}`],
    ['trailing-whitespace', `${canonicalRunId} `],
    ['suffix', `${canonicalRunId}; extra=true`],
  ])('rejects %s recovery IDs without normalization', (_label, recoveryRunId) => {
    expect(parseLowerCaseUuidV4(recoveryRunId)).toBeUndefined();
    expect(
      parseAuditedSourceFailure(
        'failed',
        `source_file_unrecoverable; recovery_run=${recoveryRunId}`
      )
    ).toBeUndefined();
  });

  it.each(['indexed', 'pending', 'indexing'])(
    'never promotes a %s row to an audited failure',
    vectorStatus => {
      expect(
        parseAuditedSourceFailure(
          vectorStatus,
          `source_file_unrecoverable; recovery_run=${canonicalRunId}`
        )
      ).toBeUndefined();
    }
  );
});
