#!/usr/bin/env tsx
/**
 * Re-run Stage 2 for documents whose vector indexing failed.
 *
 * WHY THIS EXISTS. `reindex execute` binds every file to a durable ledger and skips anything that
 * ledger records as completed, so a run that reported 234/234 while 48 documents wrote no vectors
 * cannot repair itself: a fresh run id is refused while the journal sits at `reindex_started`, and
 * rewriting the artifact by hand would falsify the audit record it exists to be (mc2-q3ju4).
 *
 * The product already has the repair — the `retryDocument` tRPC procedure — but it takes one
 * document per call from a signed-in browser session. Forty-eight of those is not an operation.
 * This is that procedure's server-side effect, in bulk, with the SAME guard: a document is only
 * touched when the catalog says its vector status is `failed`, so it can never restart a document
 * that is healthy or already in flight.
 *
 * Usage:
 *   tsx tools/qdrant/retry-failed-documents.ts --file-ids <path>            # report only
 *   tsx tools/qdrant/retry-failed-documents.ts --file-ids <path> --confirm  # enqueue
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JobType } from '@megacampus/shared-types';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';

import { addJob, closeQueue } from '../../src/orchestrator/queue';
import { validateLocale } from '../../src/shared/validation';
import { deleteVectorsForDocument } from '../../src/shared/qdrant/lifecycle';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { resolveUploadStoragePath } from '../../src/stages/stage1-document-upload/phases';
import { finalizeReindexCliProcess } from './reindex-course-embeddings';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface RetryCandidate {
  id: string;
  course_id: string;
  organization_id: string;
  storage_path: string;
  mime_type: string;
  vector_status: string;
}

export interface RetryDependencies {
  loadCandidates: (fileIds: string[]) => Promise<RetryCandidate[]>;
  loadCourseLanguage: (courseId: string) => Promise<string | null>;
  resetToPending: (fileId: string) => Promise<void>;
  deleteVectors: (fileId: string, courseId: string) => Promise<unknown>;
  enqueue: (data: DocumentProcessingJobData) => Promise<{ id?: string | number }>;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

export function parseFileIds(contents: string): string[] {
  const ids = contents
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  const invalid = ids.filter(id => !UUID_PATTERN.test(id));
  if (invalid.length > 0) {
    throw new Error(`not a file id: ${invalid.join(', ')}`);
  }

  return [...new Set(ids)];
}

/**
 * The same guard `retryDocument` applies, and for the same reason: a document that is `indexing`
 * has a job in flight, and one that is `indexed` has vectors a retry would delete.
 */
export function partitionCandidates(
  requested: string[],
  candidates: RetryCandidate[]
): { retryable: RetryCandidate[]; skipped: string[]; missing: string[] } {
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const retryable: RetryCandidate[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  for (const id of requested) {
    const candidate = byId.get(id);
    if (!candidate) {
      missing.push(id);
    } else if (candidate.vector_status !== 'failed') {
      skipped.push(`${id} (${candidate.vector_status})`);
    } else {
      retryable.push(candidate);
    }
  }

  return { retryable, skipped, missing };
}

export async function runRetryFailedDocuments(
  fileIds: string[],
  confirm: boolean,
  deps: RetryDependencies
): Promise<number> {
  const candidates = await deps.loadCandidates(fileIds);
  const { retryable, skipped, missing } = partitionCandidates(fileIds, candidates);

  deps.stdout(
    `RETRY requested=${fileIds.length} retryable=${retryable.length} ` +
      `skipped=${skipped.length} missing=${missing.length}\n`
  );
  for (const entry of skipped) deps.stdout(`  skipped not-failed: ${entry}\n`);
  for (const entry of missing) deps.stdout(`  skipped not-in-catalog: ${entry}\n`);

  if (!confirm) {
    deps.stdout('RETRY dry-run: pass --confirm to enqueue\n');
    return missing.length > 0 ? 1 : 0;
  }

  let enqueued = 0;
  let failed = 0;

  for (const candidate of retryable) {
    try {
      // Order matches retryDocument: drop any partial vectors, reset the row, then enqueue. A
      // crash between steps leaves the document `pending` with no vectors, which is retryable.
      await deps.deleteVectors(candidate.id, candidate.course_id);
      await deps.resetToPending(candidate.id);

      const language = await deps.loadCourseLanguage(candidate.course_id);
      const job = await deps.enqueue({
        jobType: JobType.DOCUMENT_PROCESSING,
        organizationId: candidate.organization_id,
        courseId: candidate.course_id,
        userId: 'operator-retry',
        fileId: candidate.id,
        filePath: resolveUploadStoragePath(candidate.storage_path),
        mimeType: candidate.mime_type,
        chunkSize: 512,
        chunkOverlap: 50,
        createdAt: new Date().toISOString(),
        locale: validateLocale(language),
      });

      enqueued += 1;
      deps.stdout(`  enqueued ${candidate.id} job=${String(job.id ?? '')}\n`);
    } catch (error) {
      failed += 1;
      deps.stderr(
        `  FAILED ${candidate.id}: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }

  deps.stdout(`RETRY enqueued=${enqueued} failed=${failed}\n`);
  return failed > 0 || missing.length > 0 ? 1 : 0;
}

function createDefaultDependencies(): RetryDependencies {
  const supabase = getSupabaseAdmin();

  return {
    loadCandidates: async fileIds => {
      const { data, error } = await supabase
        .from('file_catalog')
        .select('id, course_id, organization_id, storage_path, mime_type, vector_status')
        .in('id', fileIds);
      if (error) throw new Error(`file_catalog read failed: ${error.message}`);
      return (data ?? []) as RetryCandidate[];
    },
    loadCourseLanguage: async courseId => {
      const { data, error } = await supabase
        .from('courses')
        .select('language')
        .eq('id', courseId)
        .single();
      if (error) throw new Error(`courses read failed: ${error.message}`);
      return (data?.language as string | null) ?? null;
    },
    resetToPending: async fileId => {
      const { error } = await supabase
        .from('file_catalog')
        .update({
          vector_status: 'pending',
          parsed_content: null,
          markdown_content: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId);
      if (error) throw new Error(`file_catalog reset failed: ${error.message}`);
    },
    deleteVectors: (fileId, courseId) => deleteVectorsForDocument(fileId, courseId),
    enqueue: data => addJob(JobType.DOCUMENT_PROCESSING, data, { priority: 1 }),
    stdout: message => process.stdout.write(message),
    stderr: message => process.stderr.write(message),
  };
}

function isDirectExecution(metaUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) return false;
  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

if (isDirectExecution(import.meta.url)) {
  const argv = process.argv.slice(2);
  const listIndex = argv.indexOf('--file-ids');
  const confirm = argv.includes('--confirm');

  if (listIndex === -1 || !argv[listIndex + 1]) {
    process.stderr.write('usage: retry-failed-documents.ts --file-ids <path> [--confirm]\n');
    process.exit(64);
  }

  const fileIds = parseFileIds(readFileSync(argv[listIndex + 1] as string, 'utf8'));

  runRetryFailedDocuments(fileIds, confirm, createDefaultDependencies())
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      process.stderr.write(
        `RETRY_ERROR ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    })
    .finally(async () =>
      finalizeReindexCliProcess({
        exitCode: process.exitCode === undefined ? 0 : Number(process.exitCode),
        closeQueue,
        flushStdout: async () =>
          new Promise<void>(resolvePromise => {
            process.stdout.write('', () => resolvePromise());
          }),
        exit: code => process.exit(code),
      })
    );
}
