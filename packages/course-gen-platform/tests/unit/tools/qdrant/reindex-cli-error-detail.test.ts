import { describe, expect, it } from 'vitest';

import { scrubCliErrorDetail } from '../../../../tools/qdrant/reindex-course-embeddings';

// `REINDEX_ERROR code=internal` on its own says only "none of the known message patterns matched",
// which is precisely the case where the operator most needs the message — a production
// `reindex plan` on 2026-07-31 printed exactly that and nothing else.
//
// The redaction it replaces is deliberate: reindex-course-embeddings.test.ts pins that stderr must
// never carry a run id or a path. Carrying the message at all is therefore only safe while every
// leaking shape is provably replaced, which is what these cases are for. They live in their own
// file because the sibling suite is 2147 lines and already exceeds the max-lines rule, so adding to
// it would put new work behind unrelated pre-existing lint failures.
describe('scrubCliErrorDetail', () => {
  it('replaces every identity shape while keeping the diagnosis', () => {
    const detail = scrubCliErrorDetail(
      new Error(
        'connect ECONNREFUSED for run 60000000-0000-4000-8000-000000000006 ' +
          'at /private/state/journal.json digest ' +
          'a'.repeat(64) +
          ' via postgresql://user:pw@db.internal:5432/postgres'
      )
    );

    expect(detail).toContain('ECONNREFUSED');
    expect(detail).not.toContain('60000000-0000-4000-8000-000000000006');
    expect(detail).not.toContain('/private/');
    expect(detail).not.toContain('journal.json');
    expect(detail).not.toContain('a'.repeat(64));
    expect(detail).not.toContain('postgresql://');
    expect(detail).not.toContain('pw@');
  });

  it('keeps a message that carries no identity untouched', () => {
    expect(scrubCliErrorDetail(new Error('collection not found'))).toBe('collection not found');
  });

  it('bounds the length so one huge message cannot flood the operator log', () => {
    expect(scrubCliErrorDetail(new Error('x'.repeat(5000)).message).length).toBeLessThanOrEqual(
      200
    );
  });

  it('survives a thrown non-Error', () => {
    expect(scrubCliErrorDetail('plain failure')).toBe('plain failure');
  });

  // Same defect one level down: @qdrant/js-client-rest sets message to the bare status text and
  // keeps the server's sentence in data.status.error. On 2026-07-31 that printed
  // `detail=Bad Request` for a failure Qdrant had already explained exactly.
  it('carries the nested API reason an HTTP client hides behind a bare status text', () => {
    const apiError = Object.assign(new Error('Bad Request'), {
      status: 400,
      data: { status: { error: 'Bad request: Limit exceeded 256 > 100 for "limit".' } },
    });

    const detail = scrubCliErrorDetail(apiError);

    expect(detail).toContain('Bad Request');
    expect(detail).toContain('Limit exceeded 256 > 100');
  });

  it('redacts the nested reason exactly like the message and never doubles it', () => {
    const leaking = Object.assign(new Error('Bad Request'), {
      data: {
        status: { error: 'point 60000000-0000-4000-8000-000000000006 at /srv/state/x.json' },
      },
    });
    const alreadySaid = Object.assign(new Error('Not found: collection missing'), {
      data: { status: { error: 'collection missing' } },
    });

    const detail = scrubCliErrorDetail(leaking);

    expect(detail).not.toContain('60000000-0000-4000-8000-000000000006');
    expect(detail).not.toContain('/srv/');
    expect(scrubCliErrorDetail(alreadySaid)).toBe('Not found: collection missing');
  });
});
