import { describe, expect, it } from 'vitest';
import type { JudgeAggregatedResult, JudgeVerdict } from '@megacampus/shared-types';
import type { LessonContentBody, RAGChunk } from '@megacampus/shared-types/lesson-content';
import { verifyClaimWithRAG } from '@/stages/stage6-lesson-content/judge/claim-extraction';
import type { FactualVerificationResult } from '@/stages/stage6-lesson-content/judge/factual-verifier';
import type { CascadeResult } from '@/stages/stage6-lesson-content/judge/cascade/types';
import {
  buildFactualWarnings,
  buildReviewInfo,
} from '@/stages/stage6-lesson-content/nodes/judge-refinement-helpers';
import {
  applySourceGroundingRemediation,
  buildSourceGroundingRemediationTasks,
} from '@/stages/stage6-lesson-content/judge/source-grounding-remediation';
import { applyFactualIssueVeto } from '@/stages/stage6-lesson-content/judge/factual-issue-veto';

function makeChunk(content: string): RAGChunk {
  return {
    chunk_id: 'chunk-1',
    document_id: 'doc-1',
    document_name: 'standard.pdf',
    content,
    page_or_section: '4.2.c',
    relevance_score: 0.9,
    metadata: {},
  };
}

function makeFactualResult(
  overrides: Partial<FactualVerificationResult>
): FactualVerificationResult {
  return {
    claims: [],
    overallAccuracyScore: 1,
    contradictedClaims: 0,
    unverifiedClaims: 0,
    verifiedClaims: 0,
    noEvidenceClaims: 0,
    requiresHumanReview: false,
    flaggedSentences: [],
    ...overrides,
  };
}

function makeCascadeResult(factualResult: FactualVerificationResult): CascadeResult {
  return {
    stage: 'single_judge',
    passed: true,
    factualVerificationResult: factualResult,
    finalScore: 0.85,
    finalRecommendation: 'ACCEPT_WITH_MINOR_REVISION',
    totalTokensUsed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalDurationMs: 0,
    costSavingsRatio: 0.67,
  };
}

function makeVerdict(overrides: Partial<JudgeVerdict>): JudgeVerdict {
  return {
    overallScore: 0.9,
    passed: true,
    confidence: 'high',
    criteriaScores: {
      learning_objective_alignment: 0.9,
      pedagogical_structure: 0.9,
      factual_accuracy: 0.9,
      clarity_readability: 0.9,
      engagement_examples: 0.9,
      completeness: 0.9,
    },
    issues: [],
    strengths: [],
    recommendation: 'ACCEPT',
    judgeModel: 'test-model',
    temperature: 0.1,
    tokensUsed: 0,
    durationMs: 0,
    ...overrides,
  };
}

describe('Stage 6 factual quality gate', () => {
  it('keeps no_evidence-only accepted factual results as warnings, not terminal review_required', () => {
    const factualResult = makeFactualResult({
      claims: [
        {
          text: 'Конверсия выросла с 2.1% до 3.8%.',
          sentenceIndex: 0,
          entropyScore: 0,
          ragEvidence: [],
          verificationStatus: 'no_evidence',
          confidence: 0.5,
        },
      ],
      overallAccuracyScore: 0.5,
      noEvidenceClaims: 1,
      requiresHumanReview: true,
    });

    const cascadeResult = makeCascadeResult(factualResult);

    expect(buildReviewInfo(false, cascadeResult)).toBeNull();
    expect(buildFactualWarnings(cascadeResult)).toMatchObject({
      hasWarnings: true,
      noEvidenceClaims: 1,
      unverifiedClaims: 0,
      contradictedClaims: 0,
    });
  });

  it('classifies Russian numeric source mismatches as contradictions', () => {
    const result = verifyClaimWithRAG(
      'Материал должен быть передан дизайнеру за 5 дней до публикации.',
      [makeChunk('Материал должен быть передан дизайнеру за 7 дней до даты публикации.')]
    );

    expect(result.verificationStatus).toBe('contradicted');
    expect(result.diagnostics?.mismatchReason).toContain('5 дней');
    expect(result.diagnostics?.mismatchReason).toContain('7 дней');
  });

  it('creates source-grounding remediation for unsupported precise numeric examples', () => {
    const factualResult = makeFactualResult({
      claims: [
        {
          text: 'Онлайн-школа увеличила конверсию с 2.1% до 3.8% и получила 1.7 млн рублей.',
          sentenceIndex: 0,
          entropyScore: 0,
          ragEvidence: [],
          verificationStatus: 'no_evidence',
          confidence: 0.5,
        },
      ],
      overallAccuracyScore: 0.5,
      noEvidenceClaims: 1,
      requiresHumanReview: true,
    });

    const tasks = buildSourceGroundingRemediationTasks(factualResult, 'ru');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      action: 'label_as_hypothetical',
      claimText: 'Онлайн-школа увеличила конверсию с 2.1% до 3.8% и получила 1.7 млн рублей.',
    });

    const content: LessonContentBody = {
      intro: '',
      sections: [
        {
          title: 'Пример',
          content: 'Онлайн-школа увеличила конверсию с 2.1% до 3.8% и получила 1.7 млн рублей.',
        },
      ],
      examples: [],
      exercises: [],
    };

    const remediated = applySourceGroundingRemediation(content, tasks, 'ru');

    expect(remediated.changed).toBe(true);
    expect(remediated.content.sections[0].content).toContain('Условный пример:');
  });

  it('rewrites contradicted numeric claims from matched source evidence', () => {
    const factualResult = makeFactualResult({
      claims: [
        {
          text: 'Материал должен быть передан дизайнеру за 5 дней до публикации.',
          sentenceIndex: 0,
          entropyScore: 0,
          ragEvidence: [
            makeChunk('Материал должен быть передан дизайнеру за 7 дней до даты публикации.'),
          ],
          verificationStatus: 'contradicted',
          confidence: 0.9,
          diagnostics: {
            mismatchReason: 'Numeric mismatch: claim has 5 дней, evidence has 7 дней',
            matchedEvidenceChunkIds: ['chunk-1'],
          },
        },
      ],
      overallAccuracyScore: 0.4,
      contradictedClaims: 1,
      requiresHumanReview: true,
    });

    const tasks = buildSourceGroundingRemediationTasks(factualResult, 'ru');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      action: 'replace_from_source',
      replacementText: 'Материал должен быть передан дизайнеру за 7 дней до публикации.',
    });

    const content: LessonContentBody = {
      intro: '',
      sections: [
        {
          title: 'Срок',
          content: 'Материал должен быть передан дизайнеру за 5 дней до публикации.',
        },
      ],
      examples: [],
      exercises: [],
    };

    const remediated = applySourceGroundingRemediation(content, tasks, 'ru');

    expect(remediated.changed).toBe(true);
    expect(remediated.content.sections[0].content).toBe(
      'Материал должен быть передан дизайнеру за 7 дней до публикации.'
    );
  });

  it('does not let CLEV majority hide a concrete major factual_accuracy issue', () => {
    const factualIssueVerdict = makeVerdict({
      overallScore: 0.77,
      recommendation: 'ITERATIVE_REFINEMENT',
      judgeModel: 'factual-judge',
      criteriaScores: {
        learning_objective_alignment: 0.85,
        pedagogical_structure: 0.85,
        factual_accuracy: 0.7,
        clarity_readability: 0.85,
        engagement_examples: 0.85,
        completeness: 0.85,
      },
      issues: [
        {
          criterion: 'factual_accuracy',
          severity: 'major',
          location: 'sec_1',
          quotedText: 'за 5 дней до публикации',
          description: 'The source standard says 7 days before publication, not 5 days.',
          suggestedFix: 'Replace 5 days with 7 days according to the source standard.',
        },
      ],
    });
    const acceptedVerdict = makeVerdict({ judgeModel: 'accepting-judge' });
    const clevResult: JudgeAggregatedResult = {
      verdicts: [acceptedVerdict, factualIssueVerdict, acceptedVerdict],
      aggregatedScore: 0.88,
      finalRecommendation: 'ACCEPT_WITH_MINOR_REVISION',
      votingMethod: 'majority',
      consensusReached: true,
      totalTokensUsed: 0,
      totalDurationMs: 0,
    };

    const result = applyFactualIssueVeto(clevResult);

    expect(result.finalRecommendation).toBe('ITERATIVE_REFINEMENT');
    expect(result.blockingFactualIssue?.quotedText).toBe('за 5 дней до публикации');
  });
});
