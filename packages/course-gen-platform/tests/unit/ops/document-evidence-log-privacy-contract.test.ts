import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const source = (path: string) => readFileSync(resolve(REPO_ROOT, path), 'utf8');

/**
 * The file that holds `message`, looking in `path` and then in its siblings.
 *
 * A log line is written in one file, but which file is an implementation detail that changes
 * whenever a module is split — and this contract is about what the line CONTAINS, not where it
 * lives. Pinning it to a named path made an unrelated file split look like a deleted log.
 */
function sourceContaining(path: string, message: string): string {
  const named = source(path);
  if (named.includes(message)) return named;

  const directory = resolve(REPO_ROOT, path, '..');
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.ts')) continue;
    const text = readFileSync(resolve(directory, entry), 'utf8');
    if (text.includes(message)) return text;
  }
  return named;
}

function payloadBefore(path: string, message: string, callMarker: string): string {
  const text = sourceContaining(path, message);
  const messageIndex = text.indexOf(message);
  expect(messageIndex, `missing log message: ${message}`).toBeGreaterThan(-1);
  const callIndex = text.lastIndexOf(callMarker, messageIndex);
  expect(callIndex, `missing log call before: ${message}`).toBeGreaterThan(-1);
  return text.slice(callIndex, messageIndex);
}

function between(path: string, start: string, end: string): string {
  const text = sourceContaining(path, start);
  const startIndex = text.indexOf(start);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThan(-1);
  const endIndex = text.indexOf(end, startIndex);
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return text.slice(startIndex, endIndex);
}

function expectPrivacySafe(payload: string, forbidden: RegExp, allowed: RegExp): void {
  expect(payload).not.toMatch(forbidden);
  expect(payload).toMatch(allowed);
}

describe('document evidence ordinary-log privacy contract', () => {
  it('keeps Stage 4 completion logs to bounded modes, statuses and counts', () => {
    const decision = payloadBefore(
      'packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts',
      'Document evidence decision gate complete',
      'dependencies.log?.info('
    );
    expectPrivacySafe(
      decision,
      /\brunId\b/,
      /\bmode\b.*\b(requiredQuestionCount|currentDecisionCount)\b/s
    );

    const conflict = payloadBefore(
      'packages/course-gen-platform/src/stages/stage4-analysis/evidence/conflict-detector.ts',
      'Document conflict detection complete',
      'dependencies.log?.info('
    );
    expectPrivacySafe(conflict, /\brunId\b/, /\b(conflictCount|batchCount)\b.*\bverification\b/s);
  });

  it('keeps all Stage 5 advisory logs to allowlisted outcomes, statuses and counts', () => {
    const path =
      'packages/course-gen-platform/src/stages/stage5-generation/evidence/advisory-enrichment.ts';
    const forbidden = /\b(courseId|runId|sectionNumber|errorName)\b/;
    expectPrivacySafe(
      payloadBefore(path, 'Stage 5 evidence context was rejected', 'dependencies.log?.warn('),
      forbidden,
      /outcome:\s*'evidence_context_rejected'/
    );
    expectPrivacySafe(
      payloadBefore(path, 'Stage 5 advisory retrieval was unavailable', 'dependencies.log?.warn('),
      forbidden,
      /outcome:\s*'retrieval_unavailable'/
    );
    expectPrivacySafe(
      payloadBefore(path, 'Stage 5 advisory evidence pass completed', 'dependencies.log?.info('),
      forbidden,
      /\bstatus\b.*\b(sectionCount|refCount)\b/s
    );
  });

  it('keeps the Stage 5 fail-open log and completion trace free of evidence identity', () => {
    const path = 'packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts';
    const failOpen = payloadBefore(
      path,
      'Stage 5 advisory evidence pass failed open',
      'this.logger.warn('
    );
    expectPrivacySafe(
      failOpen,
      /\b(courseId|runId|errorName)\b/,
      /outcome:\s*'evidence_enrichment_failed'/
    );

    // Anchored on `tokensUsed:` since 2026-08-21: the trace row's `costUsd:`
    // was removed because a stage summary that carries a price is counted
    // twice by `cost:report` (mc2-lymou).
    const traceEvidence = between(path, 'documentEvidence:', 'tokensUsed:');
    expectPrivacySafe(
      traceEvidence,
      /\b(acceptedRunId|provenanceHash)\b/,
      /\bstatus\b.*\b(decisionCount|sectionCount|refCount|fallbackSectionCount)\b/s
    );
  });

  it('keeps the Stage 6 accepted-evidence empty outcome bounded and identity-free', () => {
    const payload = payloadBefore(
      'packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts',
      '[Lesson RAG] Accepted evidence decisions exclude all document refs',
      'logger.info('
    );
    expectPrivacySafe(
      payload,
      /\b(courseId|lessonId|acceptedRunId)\b/,
      /outcome:\s*'empty'.*allowedDocumentCount:\s*0/s
    );
  });
});
