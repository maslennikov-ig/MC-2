/**
 * Characterization tests for `buildJudgeProgressSummary`.
 *
 * The function had none. `tests/stages/stage6-lesson-content/nodes/progress-summary.test.ts`
 * records the gap in a comment and explains why it was left: "in orchestrator.ts and is called
 * by the judgeNode function. Testing it requires ... mocking the entire judge pipeline". That
 * has not been true for some time — it lives in `judge/judge-progress.ts`, it is exported, it
 * takes eight plain arguments and returns a plain object, and it performs no I/O. So it can
 * simply be called.
 *
 * These tests pin the OBSERVABLE behaviour — every branch of the recommendation switch, both
 * languages, the null-cascade path, issue counting, cascade-stage description, and the
 * appending of attempts — so that flattening the thirty-odd inline ternaries into a copy table
 * can be shown to change nothing.
 */

import { describe, it, expect } from 'vitest';
import { buildJudgeProgressSummary } from '@/stages/stage6-lesson-content/judge/judge-progress';
import { DecisionAction } from '@/stages/stage6-lesson-content/judge/decision-engine';
import type { CascadeResult } from '@/stages/stage6-lesson-content/judge/cascade/types';
import type { ProgressSummary } from '@megacampus/shared-types/judge-types';

function cascade(overrides: Partial<CascadeResult> = {}): CascadeResult {
  return {
    stage: 'heuristic',
    passed: true,
    finalScore: 0.87,
    finalRecommendation: 'ACCEPT',
    totalTokensUsed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalDurationMs: 0,
    costSavingsRatio: 0,
    heuristicResults: { passed: true, failureReasons: [] },
    ...overrides,
  } as CascadeResult;
}

describe('buildJudgeProgressSummary', () => {
  describe('without cascade data', () => {
    it('reports a minimal completed summary and says the data was missing', () => {
      const summary = buildJudgeProgressSummary('ACCEPT', null, null, 'en', 1234, 56, 1, null);

      expect(summary.status).toBe('completed');
      expect(summary.currentPhase).toBe('Quality evaluation');
      expect(summary.language).toBe('en');
      expect(summary.outcome).toBe('Evaluation completed');
      expect(summary.attempts).toHaveLength(1);
      expect(summary.attempts[0]).toEqual({
        node: 'judge',
        attempt: 1,
        status: 'completed',
        resultLabel: 'ACCEPT',
        issuesFound: [],
        actionsPerformed: [],
        outcome: 'No cascade evaluation data',
        durationMs: 1234,
        tokensUsed: 56,
      });
    });

    it('localizes the same summary into Russian', () => {
      const summary = buildJudgeProgressSummary('ACCEPT', null, null, 'ru', 0, 0, 1, null);

      expect(summary.currentPhase).toBe('Оценка качества');
      expect(summary.outcome).toBe('Оценка завершена');
      expect(summary.attempts[0].outcome).toBe('Нет данных каскадной оценки');
    });

    it('marks REGENERATE as failed at both the summary and the attempt', () => {
      const summary = buildJudgeProgressSummary('REGENERATE', null, null, 'en', 0, 0, 2, null);

      expect(summary.status).toBe('failed');
      expect(summary.attempts[0].status).toBe('failed');
    });

    it('appends to existing attempts rather than replacing them', () => {
      const existing = {
        status: 'in_progress',
        currentPhase: 'earlier',
        language: 'en',
        attempts: [{ node: 'generator', attempt: 1 }],
        outcome: 'earlier',
      } as unknown as ProgressSummary;

      const summary = buildJudgeProgressSummary('ACCEPT', null, null, 'en', 0, 0, 2, existing);

      expect(summary.attempts).toHaveLength(2);
      expect(summary.attempts[0].node).toBe('generator');
      expect(summary.attempts[1].node).toBe('judge');
    });
  });

  describe('outcome message per recommendation', () => {
    const score = cascade({ finalScore: 0.873 });

    it.each([
      ['ACCEPT', '✓ Content accepted (score: 87%)', '✓ Контент принят (оценка: 87%)'],
      [
        'ACCEPT_WITH_MINOR_REVISION',
        '✓ Content accepted with revisions (score: 87%)',
        '✓ Контент принят с исправлениями (оценка: 87%)',
      ],
      [
        'ITERATIVE_REFINEMENT',
        '→ Iterative refinement completed',
        '→ Выполнено итеративное улучшение',
      ],
      [
        'REGENERATE',
        '✗ Regeneration required (score: 87%)',
        '✗ Требуется регенерация (оценка: 87%)',
      ],
      ['ESCALATE_TO_HUMAN', '⚠ Human review required', '⚠ Требуется проверка человеком'],
    ])('%s', (recommendation, english, russian) => {
      const en = buildJudgeProgressSummary(
        recommendation as 'ACCEPT',
        score,
        null,
        'en',
        0,
        0,
        1,
        null
      );
      const ru = buildJudgeProgressSummary(
        recommendation as 'ACCEPT',
        score,
        null,
        'ru',
        0,
        0,
        1,
        null
      );

      expect(en.outcome).toBe(english);
      expect(ru.outcome).toBe(russian);
      // The attempt carries the same sentence as the summary.
      expect(en.attempts[0].outcome).toBe(english);
    });

    it('falls back to a generic outcome for an unrecognised recommendation', () => {
      const summary = buildJudgeProgressSummary(
        'SOMETHING_ELSE' as 'ACCEPT',
        score,
        null,
        'en',
        0,
        0,
        1,
        null
      );

      expect(summary.outcome).toBe('Evaluation completed');
    });

    it('treats a missing score as zero rather than NaN', () => {
      const summary = buildJudgeProgressSummary(
        'ACCEPT',
        cascade({ finalScore: undefined as unknown as number }),
        null,
        'en',
        0,
        0,
        1,
        null
      );

      expect(summary.outcome).toBe('✓ Content accepted (score: 0%)');
    });
  });

  describe('issues found', () => {
    it('lists every heuristic failure reason verbatim as a warning', () => {
      const summary = buildJudgeProgressSummary(
        'REGENERATE',
        cascade({
          heuristicResults: { passed: false, failureReasons: ['too short', 'no examples'] },
        } as Partial<CascadeResult>),
        null,
        'en',
        0,
        0,
        1,
        null
      );

      expect(summary.attempts[0].issuesFound).toEqual([
        { text: 'too short', severity: 'warning' },
        { text: 'no examples', severity: 'warning' },
      ]);
    });

    it('counts critical and major verdict issues separately, in both languages', () => {
      const withIssues = cascade({
        stage: 'single_judge',
        singleJudgeVerdict: {
          confidence: 'high',
          issues: [
            { severity: 'critical' },
            { severity: 'critical' },
            { severity: 'major' },
            { severity: 'minor' },
          ],
        },
      } as unknown as Partial<CascadeResult>);

      const en = buildJudgeProgressSummary('REGENERATE', withIssues, null, 'en', 0, 0, 1, null);
      const ru = buildJudgeProgressSummary('REGENERATE', withIssues, null, 'ru', 0, 0, 1, null);

      expect(en.attempts[0].issuesFound).toEqual([
        { text: 'Found 2 critical issues', severity: 'error' },
        { text: 'Found 1 major issues', severity: 'warning' },
      ]);
      expect(ru.attempts[0].issuesFound).toEqual([
        { text: 'Найдено 2 критических проблем', severity: 'error' },
        { text: 'Найдено 1 значительных проблем', severity: 'warning' },
      ]);
    });

    it('says nothing about a severity with no issues', () => {
      const summary = buildJudgeProgressSummary(
        'ACCEPT',
        cascade({
          stage: 'single_judge',
          singleJudgeVerdict: { confidence: 'high', issues: [{ severity: 'minor' }] },
        } as unknown as Partial<CascadeResult>),
        null,
        'en',
        0,
        0,
        1,
        null
      );

      expect(summary.attempts[0].issuesFound).toEqual([]);
    });

    it('reads the first CLEV verdict when there is no single-judge verdict', () => {
      const summary = buildJudgeProgressSummary(
        'REGENERATE',
        cascade({
          stage: 'clev_voting',
          clevResult: {
            verdicts: [{ confidence: 'medium', issues: [{ severity: 'critical' }] }, {}],
          },
        } as unknown as Partial<CascadeResult>),
        null,
        'en',
        0,
        0,
        1,
        null
      );

      expect(summary.attempts[0].issuesFound).toEqual([
        { text: 'Found 1 critical issues', severity: 'error' },
      ]);
    });
  });

  describe('actions performed', () => {
    it('always describes the heuristic check, by outcome', () => {
      const passed = buildJudgeProgressSummary('ACCEPT', cascade(), null, 'en', 0, 0, 1, null);
      const failed = buildJudgeProgressSummary(
        'REGENERATE',
        cascade({ heuristicResults: { passed: false, failureReasons: [] } }),
        null,
        'en',
        0,
        0,
        1,
        null
      );

      expect(passed.attempts[0].actionsPerformed[0]).toEqual({
        text: 'Heuristic check: passed',
        severity: 'info',
      });
      expect(failed.attempts[0].actionsPerformed[0]).toEqual({
        text: 'Heuristic check: issues found',
        severity: 'info',
      });
    });

    it('names the judge confidence for a single-judge cascade', () => {
      const summary = buildJudgeProgressSummary(
        'ACCEPT',
        cascade({
          stage: 'single_judge',
          singleJudgeVerdict: { confidence: 'high' },
        } as unknown as Partial<CascadeResult>),
        null,
        'ru',
        0,
        0,
        1,
        null
      );

      expect(summary.attempts[0].actionsPerformed[1]).toEqual({
        text: 'Оценка судьи: high уверенность',
        severity: 'info',
      });
    });

    it('counts the voters for a CLEV cascade, and reads zero when there are none', () => {
      const three = buildJudgeProgressSummary(
        'ACCEPT',
        cascade({
          stage: 'clev_voting',
          clevResult: { verdicts: [{}, {}, {}] },
        } as unknown as Partial<CascadeResult>),
        null,
        'en',
        0,
        0,
        1,
        null
      );
      const none = buildJudgeProgressSummary(
        'ACCEPT',
        cascade({ stage: 'clev_voting' }),
        null,
        'en',
        0,
        0,
        1,
        null
      );

      expect(three.attempts[0].actionsPerformed[1]).toEqual({
        text: 'CLEV voting: 3 judges',
        severity: 'info',
      });
      expect(none.attempts[0].actionsPerformed[1]).toEqual({
        text: 'CLEV voting: 0 judges',
        severity: 'info',
      });
    });

    it.each([
      [DecisionAction.ACCEPT, 'Content accepted', 'Контент принят', 'info'],
      [
        DecisionAction.TARGETED_FIX,
        'Targeted fixes applied',
        'Выполнены точечные исправления',
        'warning',
      ],
      [
        DecisionAction.ITERATIVE_REFINEMENT,
        'Iterative refinement applied',
        'Выполнено итеративное улучшение',
        'warning',
      ],
      [
        DecisionAction.REGENERATE,
        'Full regeneration required',
        'Требуется полная регенерация',
        'warning',
      ],
      [
        DecisionAction.ESCALATE_TO_HUMAN,
        'Human review required',
        'Требуется проверка человеком',
        'warning',
      ],
    ])('describes decision %s', (action, english, russian, severity) => {
      const en = buildJudgeProgressSummary('ACCEPT', cascade(), action, 'en', 0, 0, 1, null);
      const ru = buildJudgeProgressSummary('ACCEPT', cascade(), action, 'ru', 0, 0, 1, null);

      expect(en.attempts[0].actionsPerformed.at(-1)).toEqual({ text: english, severity });
      expect(ru.attempts[0].actionsPerformed.at(-1)).toEqual({ text: russian, severity });
    });

    it('adds no decision line when there is no decision', () => {
      const summary = buildJudgeProgressSummary('ACCEPT', cascade(), null, 'en', 0, 0, 1, null);

      expect(summary.attempts[0].actionsPerformed).toHaveLength(1);
    });
  });

  it('routes any language that is not "ru" to English', () => {
    const summary = buildJudgeProgressSummary('ACCEPT', cascade(), null, 'de', 0, 0, 1, null);

    expect(summary.language).toBe('de');
    expect(summary.currentPhase).toBe('Quality evaluation');
    expect(summary.outcome).toBe('✓ Content accepted (score: 87%)');
  });
});
