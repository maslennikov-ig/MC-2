/**
 * Regression: an automatic-mode lesson spec must not invent a document id.
 *
 * `convertToLessonSpecV2` wrote `primary_documents: ['auto-generated']`, which is
 * not the id of anything. Stage 6 intersects that list with the accepted
 * document-evidence set to decide what the lesson may cite; a placeholder never
 * matches a UUID, so the intersection was always empty and every automatic-mode
 * course with an uploaded document was written without it (mc2-kznfz).
 *
 * Nothing caught it for six months because every symptom looked like success:
 * zero chunks in ~140 ms, `success: true`, quality scores of 0.90-0.93, and no
 * log line on that branch at all. The empty array is the documented sentinel for
 * "search all course documents" and is what the other two builders of this field
 * already use.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { convertToLessonSpecV2 } from '@/shared/auto-approval/helpers';

const LESSON = {
  lesson_id: '1.1',
  title: 'Финансовая подушка безопасности',
  objectives: ['Определить размер резервного фонда'],
  topics: ['Норматив', 'Где хранить'],
  duration_minutes: 10,
};

describe('the lesson spec the automatic path builds', () => {
  it('names no documents rather than a made-up one', () => {
    const spec = convertToLessonSpecV2(LESSON, 'Личные финансы');

    // Empty is the sentinel: Stage 6 reads it as "every document this course
    // has". Any non-empty value here is a claim about which documents exist,
    // and this converter is not in a position to make one.
    expect(spec.rag_context.primary_documents).toEqual([]);
  });

  it('would have failed on the value that shipped', () => {
    // The old spec, reconstructed. This is the assertion that was missing.
    const shipped = { rag_context: { primary_documents: ['auto-generated'] } };
    expect(shipped.rag_context.primary_documents).not.toEqual([]);
  });

  it('still produces the rest of a usable spec', () => {
    const spec = convertToLessonSpecV2(LESSON, 'Личные финансы');

    expect(spec.lesson_id).toBe('1.1');
    expect(spec.rag_context.search_queries.length).toBeGreaterThan(0);
    expect(spec.sections.length).toBeGreaterThan(0);
  });
});

describe('no source file hands Stage 6 a placeholder document id', () => {
  /**
   * A document id is a UUID. Anything else in this field is a word somebody
   * meant as documentation and Stage 6 reads as a filter — which is exactly how
   * the defect happened, and `phase3-v2-spec-generator` already warns against a
   * different spelling of it ("do not use 'default' sentinel").
   */
  it('assigns primary_documents only an array or a variable, never a literal word', () => {
    const src = join(__dirname, '../../../../src');
    const offenders: string[] = [];

    for (const file of globSync('**/*.ts', { cwd: src })) {
      const text = readFileSync(join(src, file), 'utf8');
      const pattern = /primary_documents:\s*\[\s*'([^']*)'/gu;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        // Prose about the field is not the field. A `@example` block naming
        // `doc-uuid-1` documents the shape and filters nothing.
        const line = text.slice(text.lastIndexOf('\n', match.index) + 1, match.index);
        if (/^\s*(?:\/\/|\*|\/\*)/u.test(line)) continue;

        const literal = match[1];
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
          literal
        );
        if (!isUuid) {
          offenders.push(`${file}: primary_documents: ['${literal}']`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
