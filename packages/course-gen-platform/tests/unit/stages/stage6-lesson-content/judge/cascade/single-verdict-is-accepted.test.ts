/**
 * Contract: what it takes for one judge to settle a lesson, and what the panel
 * is asked to do when it cannot.
 *
 * Stated as behaviour, not as a number, because the number moved once already
 * and will move again. The measurement behind it: across 1302 stored
 * single-judge verdicts the scores run 0.520 to 0.930 with a median of 0.820,
 * and the old 0.8 threshold sat a hundredth under that median — the steepest
 * point of the curve, splitting the corpus nearly in half and sending 45.5% to
 * a full panel against a design target of 15-20% (mc2-r31fw).
 *
 * Two clauses were removed with it. `score < 1 - threshold` never fired once in
 * those 1302 verdicts; it made a one-sided rule read as a band. The confidence
 * gate stays: it has never blocked either — no verdict in the corpus is `low` —
 * but unlike the other it is a real guard rather than an unreachable one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OSCQR_RUBRIC, type JudgeVerdict } from '@megacampus/shared-types';

const { singleJudgeMock, clevMock } = vi.hoisted(() => ({
  singleJudgeMock: vi.fn(),
  clevMock: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: noop, default: noop };
});
vi.mock('@/stages/stage6-lesson-content/judge/cascade/single-judge', () => ({
  executeSingleJudge: singleJudgeMock,
}));
vi.mock('@/stages/stage6-lesson-content/judge/clev-voter', () => ({
  executeCLEVVoting: clevMock,
  selectJudgeModels: vi.fn(),
}));

import { executeCascadeEvaluation } from '@/stages/stage6-lesson-content/judge/cascade/orchestrator';

/** The heuristics and the factual pass are other contracts; this one is the gate. */
const CONFIG = {
  skipHeuristics: true,
  skipFactualVerification: true,
  rubric: DEFAULT_OSCQR_RUBRIC,
} as const;

const INPUT = {
  lessonContent: { intro: 'x', sections: [], examples: [], exercises: [] },
  lessonSpec: { lesson_id: 'lesson-1', learning_objectives: [] },
  ragChunks: [],
  language: 'ru',
} as never;

function verdict(overallScore: number, confidence: 'high' | 'medium' | 'low'): JudgeVerdict {
  return {
    overallScore,
    passed: overallScore >= 0.7,
    confidence,
    criteriaScores: {} as never,
    issues: [],
    recommendation: 'ACCEPT',
    tokensUsed: 5_908,
    inputTokens: 5_144,
    outputTokens: 764,
  } as unknown as JudgeVerdict;
}

beforeEach(() => {
  vi.clearAllMocks();
  clevMock.mockResolvedValue({
    verdicts: [],
    aggregatedScore: 0.8,
    finalRecommendation: 'ACCEPT',
    votingMethod: 'unanimous',
    consensusReached: true,
  });
});

describe('when one judge is enough', () => {
  it('settles a confident, clearly good lesson without calling the panel', async () => {
    singleJudgeMock.mockResolvedValue(verdict(0.92, 'high'));

    const result = await executeCascadeEvaluation(INPUT, CONFIG);

    expect(result.stage).toBe('single_judge');
    expect(clevMock).not.toHaveBeenCalled();
  });

  it('sends a genuinely borderline lesson to the panel', async () => {
    // 0.6 is inside the weak tail — p10 of the measured corpus is 0.700 — and a
    // lesson there is exactly what a second opinion is for.
    singleJudgeMock.mockResolvedValue(verdict(0.6, 'high'));

    const result = await executeCascadeEvaluation(INPUT, CONFIG);

    expect(result.stage).toBe('clev_voting');
    expect(clevMock).toHaveBeenCalled();
  });

  it('sends a lesson the judge is unsure about, however it scored it', async () => {
    singleJudgeMock.mockResolvedValue(verdict(0.95, 'low'));

    const result = await executeCascadeEvaluation(INPUT, CONFIG);

    expect(result.stage).toBe('clev_voting');
  });

  it('does not wave through a disastrous score as if it were a good one', async () => {
    // The removed clause accepted anything below `1 - threshold` on the grounds
    // that it was past arguing about. A lesson this bad now gets the panel like
    // any other failure, which is what everybody assumed already happened.
    singleJudgeMock.mockResolvedValue(verdict(0.05, 'high'));

    const result = await executeCascadeEvaluation(INPUT, CONFIG);

    expect(result.stage).toBe('clev_voting');
  });

  it('hands the single verdict to the panel instead of paying for it twice', async () => {
    const cast = verdict(0.6, 'high');
    singleJudgeMock.mockResolvedValue(cast);

    await executeCascadeEvaluation(INPUT, CONFIG);

    // Third argument: the vote the panel would otherwise re-cast with the same
    // model, on the same lesson, with the same prompt.
    expect(clevMock.mock.calls[0]?.[2]).toBe(cast);
  });

  it('counts a reused verdict once, not twice', async () => {
    const cast = verdict(0.6, 'high');
    singleJudgeMock.mockResolvedValue(cast);
    clevMock.mockResolvedValue({
      verdicts: [cast, verdict(0.71, 'high')],
      aggregatedScore: 0.655,
      finalRecommendation: 'REFINE',
      votingMethod: 'weighted',
      consensusReached: true,
    });

    const result = await executeCascadeEvaluation(INPUT, CONFIG);

    // One reused verdict plus one fresh one: 5908 x 2, never x 3.
    expect(result.totalTokensUsed).toBe(5_908 * 2);
  });
});
