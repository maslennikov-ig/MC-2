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
  it('downgrades 3-4 callouts to WARN_ONLY', () => {
    const result = createBaseResult();
    result.failures = [
      {
        filter: 'calloutDensity',
        expected: 'At most 2 callout blocks',
        actual: '3 callouts',
        severity: 'major',
      },
    ];
    result.metrics.calloutDensity = {
      calloutCount: 3,
      calloutTypes: ['TIP'],
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.action).toBe(QualityRemediationAction.WARN_ONLY);
    expect(summary.lessonFlags).toContain('callout_density_warning');
  });

  it('upgrades 5+ callouts to FULL_REGEN', () => {
    const result = createBaseResult();
    result.failures = [
      {
        filter: 'calloutDensity',
        expected: 'At most 2 callout blocks',
        actual: '5 callouts',
        severity: 'critical',
      },
    ];
    result.metrics.calloutDensity = {
      calloutCount: 5,
      calloutTypes: ['TIP', 'NOTE'],
    };

    const summary = summarizeDetailedHeuristicResult(result);

    expect(summary.action).toBe(QualityRemediationAction.FULL_REGEN);
    expect(summary.lessonFlags).toContain('callout_density_blocking');
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
