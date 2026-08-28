import { describe, expect, it } from 'vitest';
import type { HeuristicFilterResult } from '@/stages/stage6-lesson-content/judge/heuristic-filter';
import {
  QualityRemediationAction,
  summarizeDetailedHeuristicResult,
} from '@/stages/stage6-lesson-content/quality/remediation';

function createBaseResult(): HeuristicFilterResult {
  return {
    passed: true,
    score: 1,
    failures: [],
    suggestions: [],
    metrics: {
      wordCount: 900,
      fleschKincaidGrade: 0,
      fleschReadingEase: 0,
      foundSections: ['Introduction'],
      missingSections: [],
      keywordCoverage: 1,
      contentDensity: 200,
      sectionCount: 3,
      sentenceCount: 20,
      avgSentenceLength: 10,
      learningObjectiveCoverage: 1,
      coveredObjectives: 2,
      totalObjectives: 2,
      prohibitedTermsViolations: [],
      promptMarkersFound: [],
      calloutDensity: {
        calloutCount: 0,
        calloutTypes: [],
      },
      codeBlockAudienceMatch: {
        codeBlockCount: 0,
        contentArchetype: 'concept_explainer',
      },
      headerLanguage: {
        englishHeaders: [],
        totalHeaders: 3,
      },
    },
    durationMs: 5,
  };
}

describe('summarizeDetailedHeuristicResult', () => {
  it('warns when callouts exceed the budget', () => {
    const result = createBaseResult();
    result.failures = [
      {
        filter: 'calloutDensity',
        expected: 'At most 3 callout blocks (about one per section)',
        actual: '4 callouts',
        severity: 'major',
      },
    ];
    result.metrics.calloutDensity = {
      calloutCount: 4,
      calloutTypes: ['TIP'],
      calloutBudget: 3,
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.action).toBe(QualityRemediationAction.WARN_ONLY);
    expect(summary.lessonFlags).toContain('callout_density_warning');
  });

  it('says nothing when the callouts fit the budget the sections earn', () => {
    // Six sections, six callouts: exactly what the prompts ask for, and what the old
    // flat cap of two called a critical failure.
    const result = createBaseResult();
    result.metrics.calloutDensity = {
      calloutCount: 6,
      calloutTypes: ['TIP', 'WARNING'],
      calloutBudget: 6,
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.lessonFlags).not.toContain('callout_density_warning');
    expect(summary.action).not.toBe(QualityRemediationAction.FULL_REGEN);
  });

  /**
   * mc2-udj0b. Callouts used to force a FULL_REGEN at five or more — the same lever as
   * "the content has zero sections" — and the mapping arrived as a side effect of a
   * refactor, three days after the filter shipped as a 0.03-weight deduction.
   *
   * Measured over 20 generations: 0 of 20 lessons met the old cap, 11 were regenerated
   * twice, every one came back over it again (once with eight), all 11 landed in
   * review_required, and they scored 0.778 against 0.907 for the lessons left alone.
   * Regenerating for this never worked and cost twice.
   */
  it('never regenerates for callouts, however many there are', () => {
    const result = createBaseResult();
    result.failures = [
      {
        filter: 'calloutDensity',
        expected: 'At most 2 callout blocks (about one per section)',
        actual: '12 callouts',
        severity: 'critical',
      },
    ];
    result.metrics.calloutDensity = {
      calloutCount: 12,
      calloutTypes: ['TIP', 'NOTE', 'WARNING'],
      calloutBudget: 2,
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.action).toBe(QualityRemediationAction.WARN_ONLY);
    expect(summary.lessonFlags).toContain('callout_density_warning');
    expect(summary.lessonFlags).not.toContain('callout_density_blocking');
  });

  it('downgrades 1-3 non-technical code blocks to WARN_ONLY', () => {
    const result = createBaseResult();
    result.failures = [
      {
        filter: 'codeBlockAudienceMatch',
        expected: 'No code blocks in non-technical content',
        actual: '2 code blocks found',
        severity: 'major',
      },
    ];
    result.metrics.codeBlockAudienceMatch = {
      codeBlockCount: 2,
      contentArchetype: 'concept_explainer',
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.action).toBe(QualityRemediationAction.WARN_ONLY);
    expect(summary.lessonFlags).toContain('code_blocks_warn_only');
  });

  it('treats 4+ non-technical code blocks as FULL_REGEN', () => {
    const result = createBaseResult();
    result.failures = [
      {
        filter: 'codeBlockAudienceMatch',
        expected: 'No code blocks in non-technical content',
        actual: '4 code blocks found',
        severity: 'critical',
      },
    ];
    result.metrics.codeBlockAudienceMatch = {
      codeBlockCount: 4,
      contentArchetype: 'concept_explainer',
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.action).toBe(QualityRemediationAction.FULL_REGEN);
    expect(summary.lessonFlags).toContain('code_blocks_blocking');
  });

  it('maps a single strict English header to PARTIAL_REGEN', () => {
    const result = createBaseResult();
    result.failures = [
      {
        filter: 'headerLanguage',
        expected: 'Headers in ru',
        actual: '1 headers appear to be in English',
        severity: 'major',
      },
    ];
    result.metrics.headerLanguage = {
      englishHeaders: ['Key Learning Outcomes'],
      totalHeaders: 3,
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.action).toBe(QualityRemediationAction.PARTIAL_REGEN);
    expect(summary.lessonFlags).toContain('header_language_partial_regen');
  });

  it('records SAFE_AUTO_FIX when deterministic repairs were applied without blocking issues', () => {
    const result = createBaseResult();
    result.metrics.markdownStructure = {
      score: 1,
      totalIssues: 1,
      criticalIssues: 0,
      majorIssues: 0,
      minorIssues: 1,
      autoFixedRules: ['quoteWrappedCallout'],
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.action).toBe(QualityRemediationAction.SAFE_AUTO_FIX);
    expect(summary.lessonFlags).toContain('deterministic_autofix_applied');
  });
});
