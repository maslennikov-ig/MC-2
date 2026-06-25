import { describe, expect, it, vi } from 'vitest';
import { extractContentBody } from '@/stages/stage6-lesson-content/judge/judge-helpers';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';

vi.mock('@/shared/logger', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child = vi.fn(() => logger);
  return { logger, default: logger };
});

function words(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(' ');
}

describe('extractContentBody', () => {
  it('parses markdown generatedContent into a valid lesson content body', () => {
    const markdown = [
      '# Lesson Title',
      '',
      '## Introduction',
      words('intro', 70),
      '',
      '## Main Workflow',
      words('section', 140),
      '',
      '## Exercises',
      '1. Explain how the workflow should be applied in a real team.',
    ].join('\n');

    const body = extractContentBody({ generatedContent: markdown } as LessonGraphStateType);

    expect(body).toMatchObject({
      intro: expect.stringContaining('intro1'),
      sections: [
        expect.objectContaining({
          title: 'Main Workflow',
          content: expect.stringContaining('section1'),
        }),
      ],
    });
  });

  it('rejects JSON-repaired bodies that do not satisfy LessonContentBody schema', () => {
    const repairedMarkdownShape = JSON.stringify({
      0: '# Lesson Title',
      1: '## Main Workflow',
      intro: '',
      sections: [],
      examples: [],
      exercises: [],
    });

    const body = extractContentBody({
      generatedContent: repairedMarkdownShape,
    } as LessonGraphStateType);

    expect(body).toBeNull();
  });

  it('does not trust invalid structured lessonContent from state', () => {
    const body = extractContentBody({
      lessonContent: {
        content: {
          intro: '',
          sections: [],
          examples: [],
          exercises: [],
        },
      },
    } as unknown as LessonGraphStateType);

    expect(body).toBeNull();
  });
});
