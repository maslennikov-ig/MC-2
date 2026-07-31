import { describe, expect, it } from 'vitest';

import { assertReindexJobResultSucceeded } from '../../../../tools/qdrant/reindex-course-embeddings';

// BullMQ completes a job whenever the processor returns, and this pipeline's document handler
// returns `{ success: false }` on a permanent failure rather than throwing. waitUntilFinished
// therefore resolves for a document that indexed nothing.
//
// On 2026-07-31 that let `reindex execute` report `enqueued=234 completed=234 failed=0` and exit 0
// while 48 documents wrote no vectors. Only `verify` caught it, one step later. These cases pin the
// difference between "the worker returned" and "the work succeeded".
//
// They live in their own file because the sibling suite is already at the max-lines limit.
describe('assertReindexJobResultSucceeded', () => {
  it('rejects the completed-but-unsuccessful result BullMQ reports as a success', () => {
    expect(() =>
      assertReindexJobResultSucceeded('run-file-1', {
        success: false,
        error: 'Failed to convert document to markdown',
      })
    ).toThrow(/completed without success: Failed to convert document to markdown/u);
  });

  it('names the job even when the failing result carries no reason', () => {
    expect(() => assertReindexJobResultSucceeded('run-file-2', { success: false })).toThrow(
      /Reindex job run-file-2 completed without success/u
    );
  });

  it('prefers error over message but accepts either', () => {
    expect(() =>
      assertReindexJobResultSucceeded('run-file-3', { success: false, message: 'vector_status' })
    ).toThrow(/vector_status/u);
  });

  it('accepts a successful result and anything that does not report success at all', () => {
    expect(() => assertReindexJobResultSucceeded('run-file-4', { success: true })).not.toThrow();
    expect(() => assertReindexJobResultSucceeded('run-file-5', undefined)).not.toThrow();
    expect(() => assertReindexJobResultSucceeded('run-file-6', null)).not.toThrow();
    expect(() => assertReindexJobResultSucceeded('run-file-7', 'done')).not.toThrow();
    expect(() => assertReindexJobResultSucceeded('run-file-8', { indexed: 12 })).not.toThrow();
  });
});
