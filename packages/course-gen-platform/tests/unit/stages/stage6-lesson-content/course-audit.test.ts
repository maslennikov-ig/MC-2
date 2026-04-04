import { describe, expect, it } from 'vitest';
import {
  runCourseQualityAudit,
  type CourseAuditLesson,
} from '@/stages/stage6-lesson-content/quality/course-audit';

function createLesson(overrides: Partial<CourseAuditLesson> = {}): CourseAuditLesson {
  return {
    lessonId: 'lesson-1',
    lessonLabel: '1.1',
    targetAudience: 'novice',
    contentArchetype: 'concept_explainer',
    markdown: `## Введение
Корпоративная социальная сеть похожа на чертеж здания: сначала проектируют каркас, потом заполняют его жизнью.

## Практика
Сформулируйте план пилота для внутреннего сообщества.

## Упражнения
Опишите первый шаг запуска сообщества.
`,
    qaSignals: {
      lesson_counters: {
        callout_count: 1,
        code_block_count: 0,
      },
    },
    ...overrides,
  };
}

describe('runCourseQualityAudit', () => {
  it('flags repeated analogy phrases across lessons', () => {
    const result = runCourseQualityAudit([
      createLesson({ lessonId: 'lesson-1', lessonLabel: '1.1' }),
      createLesson({ lessonId: 'lesson-2', lessonLabel: '1.2' }),
    ]);

    expect(result.findings.some(f => f.kind === 'repeated_analogy_phrase')).toBe(true);
    expect(result.affectedLessonIds.sort()).toEqual(['lesson-1', 'lesson-2']);
  });

  it('flags repeated exercise prompts across lessons', () => {
    const result = runCourseQualityAudit([
      createLesson({
        lessonId: 'lesson-1',
        markdown: `## Введение
Текст.

## Упражнения
Опишите первый шаг запуска сообщества.`,
      }),
      createLesson({
        lessonId: 'lesson-2',
        markdown: `## Введение
Другой текст.

## Упражнения
Опишите первый шаг запуска сообщества.`,
      }),
    ]);

    expect(result.findings.some(f => f.kind === 'repeated_exercise_prompt')).toBe(true);
  });

  it('flags anomalous code-block distribution for novice non-code content', () => {
    const result = runCourseQualityAudit([
      createLesson({
        lessonId: 'lesson-1',
        qaSignals: { lesson_counters: { callout_count: 0, code_block_count: 4 } },
      }),
      createLesson({
        lessonId: 'lesson-2',
        qaSignals: { lesson_counters: { callout_count: 0, code_block_count: 3 } },
      }),
      createLesson({
        lessonId: 'lesson-3',
        qaSignals: { lesson_counters: { callout_count: 0, code_block_count: 0 } },
      }),
    ]);

    expect(result.findings.some(f => f.kind === 'course_code_block_anomaly')).toBe(true);
    expect(result.affectedLessonIds).toContain('lesson-1');
    expect(result.affectedLessonIds).toContain('lesson-2');
  });

  it('does not overcount mixed mermaid and code fences in fallback code-block detection', () => {
    const mixedMarkdown = `## Введение
Текст.

\`\`\`mermaid
flowchart TD
A-->B
\`\`\`

\`\`\`mermaid
flowchart TD
B-->C
\`\`\`

\`\`\`json
{"ok": true}
\`\`\`

\`\`\`python
print("ok")
\`\`\`
`;

    const result = runCourseQualityAudit([
      createLesson({
        lessonId: 'lesson-1',
        targetAudience: 'business',
        qaSignals: undefined,
        markdown: mixedMarkdown,
      }),
      createLesson({
        lessonId: 'lesson-2',
        targetAudience: 'business',
        qaSignals: undefined,
        markdown: mixedMarkdown,
      }),
    ]);

    expect(result.findings.some(f => f.kind === 'course_code_block_anomaly')).toBe(false);
  });
});
