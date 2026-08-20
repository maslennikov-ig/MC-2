/**
 * Contract: a quiz survives a model saying "no limit" the way JSON says it.
 *
 * `deepseek/deepseek-v4-flash` returned a complete, valid quiz with
 * `"time_limit_minutes": null` — the natural way to write "there is no limit".
 * The schema accepted a missing key and rejected an explicit null, so the whole
 * quiz was discarded, retried, refused identically, and both attempts were
 * billed: 9788 and 10061 tokens on the paid run of 2026-08-16.
 *
 * The error said 'Failed to parse quiz output - invalid JSON structure', which
 * was wrong twice: the JSON was valid, and the real reason was logged elsewhere
 * and dropped from the error (mc2-d3726).
 */

import { describe, expect, it } from 'vitest';
import { quizEnrichmentContentSchema as quizOutputSchema } from '@megacampus/shared-types/enrichment-content';
import { quizSettingsSchema } from '@megacampus/shared-types/enrichment-settings';

const QUIZ = {
  type: 'quiz' as const,
  quiz_title: 'Time management basics',
  instructions: 'Answer every question to the best of your ability.',
  questions: [
    {
      id: 'q1',
      type: 'true_false',
      bloom_level: 'remember',
      difficulty: 'easy',
      question: 'Is planning a part of time management?',
      correct_answer: true,
      explanation: 'Planning is the first step of managing time.',
      points: 1,
    },
  ],
  passing_score: 70,
  metadata: { total_points: 1, estimated_minutes: 5, bloom_coverage: { remember: 1 } },
};

describe('quiz output tolerates a nulled optional field', () => {
  it('reads a null time limit as no time limit', () => {
    const result = quizOutputSchema.safeParse({ ...QUIZ, time_limit_minutes: null });

    expect(result.success).toBe(true);
    expect(result.success && result.data.time_limit_minutes).toBeUndefined();
  });

  it('reads nulled options as no options, which true/false questions have', () => {
    const result = quizOutputSchema.safeParse({
      ...QUIZ,
      questions: [{ ...QUIZ.questions[0], options: null }],
    });

    expect(result.success).toBe(true);
  });

  it('still keeps a real time limit', () => {
    const result = quizOutputSchema.safeParse({ ...QUIZ, time_limit_minutes: 15 });

    expect(result.success && result.data.time_limit_minutes).toBe(15);
  });

  it('still refuses a nonsense time limit', () => {
    expect(quizOutputSchema.safeParse({ ...QUIZ, time_limit_minutes: -5 }).success).toBe(false);
  });

  it('accepts the same null in the settings a course can store', () => {
    expect(quizSettingsSchema.safeParse({ time_limit_minutes: null }).success).toBe(true);
  });
});
