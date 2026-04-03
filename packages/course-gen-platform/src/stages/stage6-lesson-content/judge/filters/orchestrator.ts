/**
 * Main orchestrator for heuristic filters
 * @module stages/stage6-lesson-content/judge/filters/orchestrator
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { logger } from '@/shared/logger';
import { validateMarkdownStructure, applyMarkdownAutoFixes } from '../markdown-structure-filter';
import { runTableFixPipeline } from '../../utils/table-fix-pipeline';

import type { FilterCheckResult, HeuristicFilterConfig, HeuristicFilterResult } from './types';
import { DEFAULT_HEURISTIC_CONFIG, FILTER_WEIGHTS } from './types';
import {
  checkWordCount,
  checkFleschKincaid,
  checkSectionHeaders,
  checkKeywordCoverage,
  checkContentDensity,
} from './basic-checks';
import {
  checkLearningObjectiveCoverage,
  checkLanguageConsistency,
  checkHeaderLanguage,
} from './content-quality';
import {
  checkContentTruncation,
  checkMermaidSyntax,
  checkCalloutDensity,
  checkCodeBlockAudienceMatch,
} from './structural-checks';
import { checkProhibitedTerms, checkPromptMarkers } from './prohibited-content';
import { checkSectionDuplication } from './duplication-checks';

// ============================================================================
// KEYWORD EXTRACTION
// ============================================================================

/**
 * Extract keywords from learning objectives
 *
 * @param lessonSpec - Lesson specification with learning objectives
 * @returns Array of extracted keywords
 */
export function extractKeywordsFromSpec(lessonSpec: LessonSpecificationV2): string[] {
  const keywords = new Set<string>();
  const commonWords = new Set([
    'the',
    'and',
    'for',
    'that',
    'this',
    'with',
    'from',
    'have',
    'will',
    'able',
    'about',
    'into',
    'more',
    'when',
    'than',
    'also',
    'their',
    'which',
    'each',
    'other',
    'understand',
    'explain',
    'describe',
    'identify',
    'demonstrate',
    'apply',
    'analyze',
    'create',
    'evaluate',
  ]);

  // Extract from learning objectives
  for (const objective of lessonSpec.learning_objectives) {
    const words = objective.objective.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    for (const word of words) {
      if (!commonWords.has(word)) {
        keywords.add(word);
      }
    }
  }

  // Extract from section required keywords
  for (const section of lessonSpec.sections) {
    if (section.constraints?.required_keywords) {
      for (const keyword of section.constraints.required_keywords) {
        keywords.add(keyword.toLowerCase());
      }
    }
  }

  return Array.from(keywords);
}

// ============================================================================
// FILTER RESULT ACCUMULATOR
// ============================================================================

/**
 * Accumulate a single filter result into the running totals.
 * Reduces cyclomatic complexity of the main orchestrator function.
 */
function accumulateFilterResult(
  result: FilterCheckResult,
  weight: number,
  acc: { score: number; failures: HeuristicFilterResult['failures']; suggestions: string[] }
): void {
  acc.score += result.scoreContribution * weight;
  if (result.failure) acc.failures.push(result.failure);
  if (result.suggestion) acc.suggestions.push(result.suggestion);
}

// ============================================================================
// MAIN HEURISTIC FILTER FUNCTION
// ============================================================================

/**
 * Run all heuristic pre-filters on content
 *
 * Stage 1 of cascade evaluation - filters 30-50% of content instantly.
 * Checks: word count, Flesch-Kincaid, required sections, keywords, content density,
 * markdown structure, learning objectives, prohibited terms, prompt markers,
 * language consistency, Mermaid syntax, section duplication, content truncation
 *
 * @param content - Content to evaluate (markdown string)
 * @param lessonSpec - Lesson specification for context (keywords, objectives)
 * @param config - Optional custom configuration
 * @param language - Expected language code (default: 'en')
 * @returns Comprehensive filter result with score, failures, and suggestions
 */
export function runHeuristicFilters(
  content: string,
  lessonSpec: LessonSpecificationV2,
  config: Partial<HeuristicFilterConfig> = {},
  language: string = 'en'
): HeuristicFilterResult {
  const startTime = Date.now();

  // Merge with defaults
  const finalConfig: HeuristicFilterConfig = {
    ...DEFAULT_HEURISTIC_CONFIG,
    ...config,
    wordCount: { ...DEFAULT_HEURISTIC_CONFIG.wordCount, ...config.wordCount },
    fleschKincaid: { ...DEFAULT_HEURISTIC_CONFIG.fleschKincaid, ...config.fleschKincaid },
  };

  const acc = {
    score: 0,
    failures: [] as HeuristicFilterResult['failures'],
    suggestions: [] as string[],
  };

  // Run individual filters
  const wordCountResult = checkWordCount(content, finalConfig.wordCount);
  accumulateFilterResult(wordCountResult, FILTER_WEIGHTS.wordCount, acc);

  const fleschResult = checkFleschKincaid(content, finalConfig.fleschKincaid);
  accumulateFilterResult(fleschResult, FILTER_WEIGHTS.fleschKincaid, acc);

  const sectionsResult = checkSectionHeaders(content, finalConfig.requiredSections);
  accumulateFilterResult(sectionsResult, FILTER_WEIGHTS.sections, acc);

  const keywords = extractKeywordsFromSpec(lessonSpec);
  const keywordResult = checkKeywordCoverage(content, keywords);
  accumulateFilterResult(keywordResult, FILTER_WEIGHTS.keywordCoverage, acc);

  const densityResult = checkContentDensity(content, finalConfig.contentDensityThreshold);
  accumulateFilterResult(densityResult, FILTER_WEIGHTS.contentDensity, acc);

  // Run deterministic table repair and markdown auto-fixes before markdown validation
  // so score/failures reflect the normalized version that proceeds through the pipeline.
  const tableFixResult = runTableFixPipeline(content);
  const autoFixResult = applyMarkdownAutoFixes(tableFixResult.content);
  const markdownResult = validateMarkdownStructure(autoFixResult.content);
  markdownResult.autoFixedIssues = autoFixResult.fixedRules;

  // Add markdown score contribution
  acc.score += markdownResult.score * FILTER_WEIGHTS.markdownStructure;

  // Add failures from critical/major markdown issues
  if (markdownResult.issuesBySeverity.critical.length > 0) {
    acc.failures.push({
      filter: 'markdownStructure',
      expected: 'No critical markdown errors',
      actual: `${markdownResult.issuesBySeverity.critical.length} critical errors`,
      severity: 'critical',
    });
  }

  if (markdownResult.issuesBySeverity.major.length > 0) {
    acc.failures.push({
      filter: 'markdownStructure',
      expected: 'No major markdown errors',
      actual: `${markdownResult.issuesBySeverity.major.length} major errors`,
      severity: 'major',
    });
  }

  if (!markdownResult.passed) {
    acc.suggestions.push(
      `Markdown validation failed with ${markdownResult.issues.length} issues. Fix heading hierarchy, add code block languages, and ensure proper formatting.`
    );
  }

  // Run remaining checks via accumulator
  const objectiveCoverageResult = checkLearningObjectiveCoverage(content, lessonSpec);
  accumulateFilterResult(objectiveCoverageResult, FILTER_WEIGHTS.learningObjectiveCoverage, acc);

  const prohibitedTermsResult = checkProhibitedTerms(content, lessonSpec);
  accumulateFilterResult(prohibitedTermsResult, FILTER_WEIGHTS.prohibitedTerms, acc);

  const promptMarkersResult = checkPromptMarkers(content);
  accumulateFilterResult(promptMarkersResult, FILTER_WEIGHTS.promptMarkers, acc);

  const languageResult = checkLanguageConsistency(content, language);
  accumulateFilterResult(languageResult, FILTER_WEIGHTS.languageConsistency, acc);

  const mermaidResult = checkMermaidSyntax(content);
  accumulateFilterResult(mermaidResult, FILTER_WEIGHTS.mermaidSyntax, acc);

  const duplicationResult = checkSectionDuplication(content);
  accumulateFilterResult(duplicationResult, FILTER_WEIGHTS.sectionDuplication, acc);

  const truncationResult = checkContentTruncation(content);
  accumulateFilterResult(truncationResult, FILTER_WEIGHTS.contentTruncation, acc);

  const calloutDensityResult = checkCalloutDensity(content);
  accumulateFilterResult(calloutDensityResult, FILTER_WEIGHTS.calloutDensity, acc);

  const contentArchetype = lessonSpec.metadata?.content_archetype ?? 'concept_explainer';
  const codeBlockAudienceResult = checkCodeBlockAudienceMatch(content, contentArchetype);
  accumulateFilterResult(codeBlockAudienceResult, FILTER_WEIGHTS.codeBlockAudienceMatch, acc);

  const headerLanguageResult = checkHeaderLanguage(content, language);
  accumulateFilterResult(headerLanguageResult, FILTER_WEIGHTS.headerLanguage, acc);

  // Check for zero-section content (all content in intro, no ## headers parsed)
  if (densityResult.sectionCount === 0) {
    acc.failures.push({
      filter: 'emptySections',
      expected: 'At least 1 content section with ## header',
      actual: '0 sections found — all content appears to be in the introduction',
      severity: 'critical',
    });
    acc.suggestions.push(
      'Content has no sections (0 ## headers found). The entire lesson was placed into the introduction. Regenerate with proper section structure.'
    );
  }

  // Calculate sentence stats
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = content.match(/\b[a-zA-Z]+\b/g) || [];
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;

  const passed =
    acc.failures.filter(f => f.severity === 'critical' || f.severity === 'major').length === 0;
  const durationMs = Date.now() - startTime;

  logger.info({
    msg: 'Heuristic pre-filter complete',
    lessonId: lessonSpec.lesson_id,
    passed,
    score: acc.score.toFixed(3),
    failureCount: acc.failures.length,
    criticalFailures: acc.failures.filter(f => f.severity === 'critical').length,
    durationMs,
  });

  return {
    passed,
    score: acc.score,
    failures: acc.failures,
    suggestions: acc.suggestions,
    metrics: {
      wordCount: typeof wordCountResult.actual === 'number' ? wordCountResult.actual : 0,
      fleschKincaidGrade: fleschResult.gradeLevel,
      fleschReadingEase: fleschResult.readingEase,
      foundSections: sectionsResult.foundSections,
      missingSections: sectionsResult.missingSections,
      keywordCoverage: keywordResult.coverage,
      contentDensity: densityResult.avgWordsPerSection,
      sectionCount: densityResult.sectionCount,
      sentenceCount: sentences.length,
      avgSentenceLength,
      markdownStructure: {
        score: markdownResult.score,
        totalIssues: markdownResult.issues.length,
        criticalIssues: markdownResult.issuesBySeverity.critical.length,
        majorIssues: markdownResult.issuesBySeverity.major.length,
        minorIssues: markdownResult.issuesBySeverity.minor.length,
        autoFixedRules: markdownResult.autoFixedIssues,
      },
      learningObjectiveCoverage: objectiveCoverageResult.objectiveCoverage,
      coveredObjectives: objectiveCoverageResult.coveredObjectives,
      totalObjectives: objectiveCoverageResult.totalObjectives,
      prohibitedTermsViolations: prohibitedTermsResult.violations,
      promptMarkersFound: promptMarkersResult.detectedMarkers,
      languageConsistency: {
        foreignCharacters: languageResult.foreignCharacters,
        foreignSamples: languageResult.foreignSamples,
        scriptsFound: languageResult.scriptsFound,
      },
      mermaidSyntax: {
        mermaidIssues: mermaidResult.mermaidIssues,
        affectedDiagrams: mermaidResult.affectedDiagrams,
        totalDiagrams: mermaidResult.totalDiagrams,
      },
      sectionDuplication: {
        duplicatePairs: duplicationResult.duplicatePairs,
        overlapPairs: duplicationResult.overlapPairs,
        introOverlapPairs: duplicationResult.introOverlapPairs,
        totalSections: duplicationResult.totalSections,
      },
      contentTruncation: {
        truncationIssues: truncationResult.truncationIssues,
        lastCharacter: truncationResult.lastCharacter,
        hasMatchedCodeBlocks: truncationResult.hasMatchedCodeBlocks,
      },
      calloutDensity: {
        calloutCount: calloutDensityResult.calloutCount,
        calloutTypes: calloutDensityResult.calloutTypes,
      },
      codeBlockAudienceMatch: {
        codeBlockCount: codeBlockAudienceResult.codeBlockCount,
        contentArchetype: codeBlockAudienceResult.contentArchetype,
      },
      headerLanguage: {
        englishHeaders: headerLanguageResult.englishHeaders,
        totalHeaders: headerLanguageResult.totalHeaders,
      },
    },
    durationMs,
  };
}
