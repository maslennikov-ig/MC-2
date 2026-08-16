/**
 * Contract: a judge is not told the lesson has no examples when nothing in the
 * pipeline could have put any there.
 *
 * All three lessons of the live run came out with `examples: 0` (mc2-2pplo).
 * That is not a run's bad luck: the generator writes markdown, the structured
 * body is rebuilt from it in `parseMarkdownContentBody` with `examples: []`
 * written in, and the heuristic's own `minExamples` sits at 0 marked "examples
 * extraction not implemented yet". The array is empty for every lesson there
 * has ever been.
 *
 * The judge prompt printed "Examples (0 total)" and an empty list while scoring
 * `engagement_examples` at 15% of the rubric — asking it to mark a lesson down
 * for a field the pipeline never fills. The examples themselves are in the
 * sections it is already reading.
 */

import { describe, expect, it } from 'vitest';
import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';

import { buildJudgePrompt } from '@/stages/stage6-lesson-content/judge/clev-voter-helpers';
import { DEFAULT_OSCQR_RUBRIC } from '@megacampus/shared-types';

function lesson(examples: LessonContentBody['examples']): LessonContentBody {
  return {
    intro: 'Фотосинтез превращает свет в химическую энергию, и это можно проследить по шагам.',
    sections: [
      {
        section_id: 'sec_1',
        title: 'Где идёт фотосинтез',
        content: 'В хлоропластах. Например, в клетках листа их сотни.',
      },
    ] as LessonContentBody['sections'],
    examples,
    exercises: [
      { question: 'Назовите место, где идёт световая фаза', solution: 'Тилакоидная мембрана' },
    ],
  };
}

function promptFor(examples: LessonContentBody['examples']): string {
  return buildJudgePrompt(
    {
      lessonContent: lesson(examples),
      lessonSpec: {
        title: 'Фотосинтез',
        description: 'Как растение делает питание из света',
        difficulty_level: 'beginner',
        learning_objectives: [{ objective: 'Объяснить световую фазу', bloom_level: 'understand' }],
        metadata: { target_audience: 'школьники', content_archetype: 'concept' },
      } as never,
      ragChunks: [],
      language: 'ru',
    },
    DEFAULT_OSCQR_RUBRIC
  );
}

describe('judge prompt and empty examples', () => {
  it('says nothing about examples when there are none', () => {
    const prompt = promptFor([]);

    expect(prompt).not.toContain('(0 total)');
    expect(prompt).not.toMatch(/Примеры \(/);
  });

  it('still shows them when there are some', () => {
    const prompt = promptFor([
      { title: 'Лист комнатного растения', content: 'Зелёный из-за хлорофилла' },
    ] as LessonContentBody['examples']);

    expect(prompt).toContain('Примеры (1 total)');
    expect(prompt).toContain('Лист комнатного растения');
  });

  it('leaves the rest of the lesson where the judge expects it', () => {
    const prompt = promptFor([]);

    expect(prompt).toContain('## Sections (1 total)');
    expect(prompt).toContain('Назовите место, где идёт световая фаза');
  });
});
