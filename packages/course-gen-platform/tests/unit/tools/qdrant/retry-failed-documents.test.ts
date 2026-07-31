import { describe, expect, it, vi } from 'vitest';

import {
  parseFileIds,
  partitionCandidates,
  runRetryFailedDocuments,
  type RetryCandidate,
  type RetryDependencies,
} from '../../../../tools/qdrant/retry-failed-documents';

// The repair path for the 48 documents that came out of the 2026-07-31 reindex with no vectors
// (mc2-q3ju4). It replays retryDocument's server-side effect in bulk, so the guard that procedure
// applies has to survive the move: a document is touched ONLY when the catalog says its vector
// status is `failed`. Without it a bulk tool would happily delete the vectors of healthy documents.
function candidate(overrides: Partial<RetryCandidate> = {}): RetryCandidate {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    course_id: '22222222-2222-4222-8222-222222222222',
    organization_id: '33333333-3333-4333-8333-333333333333',
    storage_path: 'uploads/course/file.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    vector_status: 'failed',
    ...overrides,
  };
}

function deps(overrides: Partial<RetryDependencies> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    value: {
      loadCandidates: vi.fn(async () => [candidate()]),
      loadCourse: vi.fn(async () => ({ language: 'ru', userId: 'owner-1' })),
      resetToPending: vi.fn(async () => undefined),
      deleteVectors: vi.fn(async () => undefined),
      enqueue: vi.fn(async () => ({ id: 'job-1' })),
      stdout: (message: string) => out.push(message),
      stderr: (message: string) => err.push(message),
      ...overrides,
    } as RetryDependencies,
  };
}

describe('parseFileIds', () => {
  it('takes one id per line and ignores blanks and comments', () => {
    expect(parseFileIds('# the 48\n11111111-1111-4111-8111-111111111111\n\n  \n')).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('refuses anything that is not a file id rather than enqueueing garbage', () => {
    expect(() => parseFileIds('not-a-uuid')).toThrow(/not a file id/u);
  });

  it('deduplicates, so a doubled line cannot enqueue the same document twice', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseFileIds(`${id}\n${id}`)).toEqual([id]);
  });
});

describe('partitionCandidates', () => {
  it('retries only what the catalog calls failed', () => {
    const failed = candidate({ id: 'a', vector_status: 'failed' });
    const indexed = candidate({ id: 'b', vector_status: 'indexed' });
    const inFlight = candidate({ id: 'c', vector_status: 'indexing' });

    const result = partitionCandidates(['a', 'b', 'c', 'd'], [failed, indexed, inFlight]);

    expect(result.retryable).toEqual([failed]);
    expect(result.skipped).toEqual(['b (indexed)', 'c (indexing)']);
    expect(result.missing).toEqual(['d']);
  });
});

describe('runRetryFailedDocuments', () => {
  it('changes nothing without --confirm', async () => {
    const { value, out } = deps();

    const code = await runRetryFailedDocuments(
      ['11111111-1111-4111-8111-111111111111'],
      false,
      value
    );

    expect(code).toBe(0);
    expect(value.deleteVectors).not.toHaveBeenCalled();
    expect(value.resetToPending).not.toHaveBeenCalled();
    expect(value.enqueue).not.toHaveBeenCalled();
    expect(out.join('')).toContain('pass --confirm to enqueue');
  });

  it('drops vectors and resets the row before enqueueing, never after', async () => {
    const order: string[] = [];
    const { value } = deps({
      deleteVectors: vi.fn(async () => {
        order.push('delete');
      }),
      resetToPending: vi.fn(async () => {
        order.push('reset');
      }),
      enqueue: vi.fn(async () => {
        order.push('enqueue');
        return { id: 'job-1' };
      }),
    });

    await runRetryFailedDocuments(['11111111-1111-4111-8111-111111111111'], true, value);

    expect(order).toEqual(['delete', 'reset', 'enqueue']);
  });

  it('enqueues the payload Stage 2 expects', async () => {
    const { value } = deps();

    await runRetryFailedDocuments(['11111111-1111-4111-8111-111111111111'], true, value);

    expect(value.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: '33333333-3333-4333-8333-333333333333',
        courseId: '22222222-2222-4222-8222-222222222222',
        fileId: '11111111-1111-4111-8111-111111111111',
        chunkSize: 512,
        chunkOverlap: 50,
        locale: 'ru',
        // The course owner, because jobData.userId lands in the permanent failure log's user_id.
        userId: 'owner-1',
      })
    );
  });

  it('keeps going when one document fails, and reports a non-zero exit', async () => {
    const first = candidate({ id: 'a' });
    const second = candidate({ id: 'b' });
    const { value, err } = deps({
      loadCandidates: vi.fn(async () => [first, second]),
      deleteVectors: vi.fn(async (fileId: string) => {
        if (fileId === 'a') throw new Error('qdrant unreachable');
      }),
    });

    const code = await runRetryFailedDocuments(['a', 'b'], true, value);

    expect(code).toBe(1);
    expect(value.enqueue).toHaveBeenCalledTimes(1);
    expect(err.join('')).toContain('FAILED a: qdrant unreachable');
  });

  it('reports a non-zero exit when a requested document is not in the catalog at all', async () => {
    const { value } = deps({ loadCandidates: vi.fn(async () => []) });

    expect(await runRetryFailedDocuments(['a'], true, value)).toBe(1);
  });
});
