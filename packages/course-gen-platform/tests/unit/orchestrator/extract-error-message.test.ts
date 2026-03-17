/**
 * Unit tests for extractErrorMessage (worker.ts) and normalizeError (client.ts)
 *
 * @module tests/unit/orchestrator/extract-error-message
 */
import { describe, it, expect } from 'vitest';
import type { Job } from 'bullmq';
import type { JobData } from '@megacampus/shared-types';
import {
  DoclingError,
  DoclingErrorCode,
} from '../../../src/stages/stage2-document-processing/docling/types.js';
import { DoclingClient } from '../../../src/stages/stage2-document-processing/docling/client.js';

// ============================================================================
// extractErrorMessage — private function duplicated from worker.ts for testing
// NOTE: extractErrorMessage is a private function in worker.ts.
// We duplicate it here for testing. Keep in sync with the source.
// ============================================================================

function extractErrorMessage(job: Job<JobData>, error: Error): string {
  // 1. Try BullMQ error message
  if (error?.message && error.message !== 'Error' && error.message.trim() !== '') {
    return error.message;
  }

  // 2. Try sandbox error stashed in job data
  const sandboxError = (job.data as Record<string, unknown>)?._sandboxError as
    | {
        message?: string;
        name?: string;
        stack?: string;
        type?: string;
      }
    | undefined;

  if (sandboxError?.message) {
    return sandboxError.message;
  }

  // 3. Try first line of stack trace
  if (error?.stack) {
    const firstLine = error.stack.split('\n')[0]?.trim();
    if (firstLine && firstLine !== 'Error') {
      return firstLine;
    }
  }

  // 4. Fallback
  return 'Worker thread crashed (error details lost in sandbox serialization)';
}

// ============================================================================
// Helpers
// ============================================================================

const makeJob = (data: Record<string, unknown> = {}) => ({ data }) as unknown as Job<JobData>;

const makeError = (message: string, stack?: string) => {
  const err = new Error(message);
  if (stack !== undefined) err.stack = stack;
  return err;
};

// ============================================================================
// Tests: extractErrorMessage
// ============================================================================

describe('extractErrorMessage', () => {
  it('returns error.message when it is non-empty and not "Error"', () => {
    const job = makeJob();
    const error = makeError('Something went wrong in the worker');

    const result = extractErrorMessage(job, error);

    expect(result).toBe('Something went wrong in the worker');
  });

  it('returns _sandboxError.message when error.message is empty string', () => {
    const job = makeJob({
      _sandboxError: { message: 'Recovered from sandbox', name: 'TypeError' },
    });
    const error = makeError('');

    const result = extractErrorMessage(job, error);

    expect(result).toBe('Recovered from sandbox');
  });

  it('returns _sandboxError.message when error.message is literally "Error"', () => {
    const job = makeJob({
      _sandboxError: { message: 'Real error from sandbox thread', name: 'Error' },
    });
    const error = makeError('Error');

    const result = extractErrorMessage(job, error);

    expect(result).toBe('Real error from sandbox thread');
  });

  it('returns first line of stack when error.message is empty and no _sandboxError', () => {
    const job = makeJob();
    const error = makeError('');
    error.stack = 'TypeError: Cannot read property of undefined\n    at foo (foo.js:1:1)';

    const result = extractErrorMessage(job, error);

    expect(result).toBe('TypeError: Cannot read property of undefined');
  });

  it('returns fallback when error.message is empty, no _sandboxError, and stack is just "Error"', () => {
    const job = makeJob();
    const error = makeError('Error');
    error.stack = 'Error';

    const result = extractErrorMessage(job, error);

    expect(result).toBe('Worker thread crashed (error details lost in sandbox serialization)');
  });

  it('returns fallback when error has no message and no stack', () => {
    const job = makeJob();
    const error = makeError('');
    error.stack = undefined as unknown as string;

    const result = extractErrorMessage(job, error);

    expect(result).toBe('Worker thread crashed (error details lost in sandbox serialization)');
  });

  it('handles null/undefined error properties gracefully', () => {
    const job = makeJob();
    // Simulate a partially-serialized error that lost its message across the sandbox boundary
    const error = Object.create(Error.prototype) as Error;
    // message and stack are left as undefined (not set)

    const result = extractErrorMessage(job, error);

    expect(result).toBe('Worker thread crashed (error details lost in sandbox serialization)');
  });
});

// ============================================================================
// Tests: normalizeError (DoclingClient private method)
// ============================================================================

describe('normalizeError (DoclingClient)', () => {
  const client = new DoclingClient({ serverUrl: 'http://localhost:8000/mcp' });
  const normalizeError = (error: unknown, ctx = 'test context') =>
    (client as unknown as { normalizeError: (e: unknown, c: string) => Error }).normalizeError(
      error,
      ctx
    );

  it('passes DoclingError through unchanged', () => {
    const original = new DoclingError(DoclingErrorCode.FILE_NOT_FOUND, 'File missing');

    const result = normalizeError(original);

    expect(result).toBe(original);
    expect(result).toBeInstanceOf(DoclingError);
  });

  it('returns a plain Error with a real message as-is', () => {
    const original = new Error('real message here');

    const result = normalizeError(original);

    expect(result).toBe(original);
    expect(result.message).toBe('real message here');
  });

  it('wraps Error with empty message into DoclingError with context', () => {
    const original = new Error('');

    const result = normalizeError(original, 'processing step');

    expect(result).toBeInstanceOf(DoclingError);
    expect(result.message).toContain('processing step');
  });

  it('wraps Error whose message is literally "Error" into DoclingError', () => {
    const original = new Error('Error');

    const result = normalizeError(original, 'fetch step');

    expect(result).toBeInstanceOf(DoclingError);
    expect(result.message).toContain('fetch step');
  });

  it('wraps a plain object (non-Error) into DoclingError with JSON stringification', () => {
    const plainObject = { code: 42, reason: 'transport closed' };

    const result = normalizeError(plainObject, 'mcp call');

    expect(result).toBeInstanceOf(DoclingError);
    expect(result.message).toContain('mcp call');
    expect(result.message).toContain('"reason":"transport closed"');
  });

  it('wraps a thrown string into DoclingError', () => {
    const thrownString = 'connection refused by remote host';

    const result = normalizeError(thrownString, 'connect');

    expect(result).toBeInstanceOf(DoclingError);
    expect(result.message).toContain('connect');
    expect(result.message).toContain('connection refused by remote host');
  });

  it('wraps null into DoclingError', () => {
    const result = normalizeError(null, 'null context');

    expect(result).toBeInstanceOf(DoclingError);
    expect(result.message).toContain('null context');
  });

  it('wraps undefined into DoclingError', () => {
    const result = normalizeError(undefined, 'undefined context');

    expect(result).toBeInstanceOf(DoclingError);
    expect(result.message).toContain('undefined context');
  });
});
