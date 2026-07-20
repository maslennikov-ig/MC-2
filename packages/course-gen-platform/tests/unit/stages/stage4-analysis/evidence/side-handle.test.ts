import { describe, expect, it } from 'vitest';
import { buildDocumentConflictSideHandle } from '@/stages/stage4-analysis/evidence/side-handle';

const conflictId = '60000000-0000-4000-8000-000000000001';
const claimA = '50000000-0000-4000-8000-000000000001';
const claimB = '50000000-0000-4000-8000-000000000002';

describe('buildDocumentConflictSideHandle', () => {
  it('hashes schema, conflict and sorted claim identity without display text', () => {
    const first = buildDocumentConflictSideHandle(conflictId, [claimB, claimA, claimA]);
    const reordered = buildDocumentConflictSideHandle(conflictId, [claimA, claimB]);
    const otherSide = buildDocumentConflictSideHandle(conflictId, [claimB]);

    expect(first).toMatch(/^side:v1:[0-9a-f]{64}$/u);
    expect(first).toBe(reordered);
    expect(otherSide).not.toBe(first);
  });
});
