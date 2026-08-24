/**
 * Reading a `lesson_contents` row.
 *
 * @module stored-lesson-row
 *
 * Split out of `database-service.ts`, which was 1101 lines of code, because these accessors are
 * the one thing its two halves share: the half that WRITES a lesson and the half that decides
 * whether the COURSE is finished both have to interpret the same row. Every one of them exists
 * because the same fact is stored in more than one place — QA signals under two different
 * casings, markdown under three different keys — and each answers "where is it actually".
 */

import { extractContentMarkdown } from './content-utils';
import { quickSanityCheck } from '../utils/sanity-check';
import type { CourseAuditFinding } from '../quality/course-audit';
import type { Json } from '@megacampus/shared-types';
import type { LessonContent, LessonQualitySignals } from '@megacampus/shared-types/lesson-content';

export const STAGE6_TERMINAL_LESSON_STATUSES = new Set([
  'completed',
  'review_required',
  'failed',
  'approved',
]);
export const STAGE6_FULLY_COMPLETED_STATUSES = new Set(['completed', 'approved']);

export type StoredLessonContentRow = {
  lesson_id: string;
  status: string;
  created_at: string;
  content?: Json | null;
  metadata?: Json | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * QA signals are stored in two locations with different casing:
 * 1. metadata.qaSignals (camelCase) — written by saveLessonContent/handlePartialSuccess
 *    to the top-level metadata JSONB column
 * 2. content.metadata.qa_signals (snake_case) — embedded in the LessonContent JSON
 *    via the Zod schema (LessonContentMetadataSchema)
 * Both paths are checked for backward compatibility.
 */
export function getQaSignalsFromStoredRow(
  row: StoredLessonContentRow
): Partial<LessonQualitySignals> | null {
  if (isRecord(row.metadata) && isRecord(row.metadata.qaSignals)) {
    return row.metadata.qaSignals as Partial<LessonQualitySignals>;
  }

  if (
    isRecord(row.content) &&
    isRecord(row.content.metadata) &&
    isRecord(row.content.metadata.qa_signals)
  ) {
    return row.content.metadata.qa_signals as Partial<LessonQualitySignals>;
  }

  return null;
}
export function getMarkdownFromStoredRow(row: StoredLessonContentRow): string {
  if (isRecord(row.metadata) && typeof row.metadata.markdownContent === 'string') {
    return row.metadata.markdownContent;
  }

  if (isRecord(row.content) && typeof row.content.raw_markdown === 'string') {
    return row.content.raw_markdown;
  }

  if (isRecord(row.content) && isRecord(row.content.content) && isRecord(row.content.metadata)) {
    return extractContentMarkdown(row.content as unknown as LessonContent);
  }

  return '';
}
export function getStoredSanityCheck(row: StoredLessonContentRow): Record<string, unknown> | null {
  if (isRecord(row.metadata) && isRecord(row.metadata.sanityCheck)) {
    return row.metadata.sanityCheck;
  }

  return null;
}
export function getStoredLessonPublishabilityFailure(row: StoredLessonContentRow): string | null {
  if (!STAGE6_FULLY_COMPLETED_STATUSES.has(row.status)) {
    return null;
  }

  const markdown = getMarkdownFromStoredRow(row);
  if (markdown.trim().length === 0) {
    return 'empty markdown content';
  }

  const storedSanityCheck = getStoredSanityCheck(row);
  if (storedSanityCheck?.passed === false) {
    const reason =
      typeof storedSanityCheck.reason === 'string' ? storedSanityCheck.reason : 'unknown';
    return `stored sanity check failed: ${reason}`;
  }

  const sanityResult = quickSanityCheck(markdown);
  if (!sanityResult.ok) {
    return `sanity check failed: ${sanityResult.reason ?? 'unknown'}`;
  }

  return null;
}
export function isStoredLessonPublishable(row: StoredLessonContentRow): boolean {
  return getStoredLessonPublishabilityFailure(row) === null;
}
export function getLessonLabelFromStoredRow(row: StoredLessonContentRow): string {
  if (isRecord(row.metadata) && typeof row.metadata.lessonLabel === 'string') {
    return row.metadata.lessonLabel;
  }

  return row.lesson_id;
}
export function getContentArchetypeFromStoredRow(row: StoredLessonContentRow): string | null {
  if (isRecord(row.content) && isRecord(row.content.metadata)) {
    const archetype = row.content.metadata.archetype_used;
    return typeof archetype === 'string' ? archetype : null;
  }

  return null;
}
export function summarizeCourseAuditFindings(findings: CourseAuditFinding[]): string {
  return findings
    .slice(0, 3)
    .map(finding => `${finding.kind} [${finding.lessonLabels.join(', ')}]`)
    .join('; ');
}
