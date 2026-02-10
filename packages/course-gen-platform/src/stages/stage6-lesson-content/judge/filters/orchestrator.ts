/**
 * Main orchestrator for heuristic filters
 * @module stages/stage6-lesson-content/judge/filters/orchestrator
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { logger } from '@/shared/logger';
import { validateMarkdownStructure, applyMarkdownAutoFixes } from '../markdown-structure-filter';

import type { HeuristicFilterConfig, HeuristicFilterResult } from './types';
import { DEFAULT_HEURISTIC_CONFIG, FILTER_WEIGHTS } from './types';
import {
  checkWordCount,
  checkFleschKincaid,
  checkSectionHeaders,
  checkKeywordCoverage,
  checkContentDensity,
} from './basic-checks';
import { checkLearningObjectiveCoverage, checkLanguageConsistency } from './content-quality';
import { checkMermaidSyntax } from './structural-checks';
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
// MAIN HEURISTIC FILTER FUNCTION
// ============================================================================

/**
 * Run all heuristic pre-filters on content
 *
 * Stage 1 of cascade evaluation - filters 30-50% of content instantly.
 * Checks: word count, Flesch-Kincaid, required sections, keywords, content density
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

  const failures: HeuristicFilterResult['failures'] = [];
  const suggestions: string[] = [];
  let weightedScore = 0;

  // Run individual filters
  const wordCountResult = checkWordCount(content, finalConfig.wordCount);
  weightedScore += wordCountResult.scoreContribution * FILTER_WEIGHTS.wordCount;
  if (wordCountResult.failure) failures.push(wordCountResult.failure);
  if (wordCountResult.suggestion) suggestions.push(wordCountResult.suggestion);

  const fleschResult = checkFleschKincaid(content, finalConfig.fleschKincaid);
  weightedScore += fleschResult.scoreContribution * FILTER_WEIGHTS.fleschKincaid;
  if (fleschResult.failure) failures.push(fleschResult.failure);
  if (fleschResult.suggestion) suggestions.push(fleschResult.suggestion);

  const sectionsResult = checkSectionHeaders(content, finalConfig.requiredSections);
  weightedScore += sectionsResult.scoreContribution * FILTER_WEIGHTS.sections;
  if (sectionsResult.failure) failures.push(sectionsResult.failure);
  if (sectionsResult.suggestion) suggestions.push(sectionsResult.suggestion);

  const keywords = extractKeywordsFromSpec(lessonSpec);
  const keywordResult = checkKeywordCoverage(content, keywords);
  weightedScore += keywordResult.scoreContribution * FILTER_WEIGHTS.keywordCoverage;
  if (keywordResult.failure) failures.push(keywordResult.failure);
  if (keywordResult.suggestion) suggestions.push(keywordResult.suggestion);

  const densityResult = checkContentDensity(content, finalConfig.contentDensityThreshold);
  weightedScore += densityResult.scoreContribution * FILTER_WEIGHTS.contentDensity;
  if (densityResult.failure) failures.push(densityResult.failure);
  if (densityResult.suggestion) suggestions.push(densityResult.suggestion);

  // Run markdown structure validation
  const markdownResult = validateMarkdownStructure(content);

  // Apply auto-fixes for cosmetic issues
  const { content: _fixedContent, fixedRules } = applyMarkdownAutoFixes(content);
  markdownResult.autoFixedIssues = fixedRules;

  // Add markdown score contribution
  weightedScore += markdownResult.score * FILTER_WEIGHTS.markdownStructure;

  // Add failures from critical/major markdown issues
  if (markdownResult.issuesBySeverity.critical.length > 0) {
    failures.push({
      filter: 'markdownStructure',
      expected: 'No critical markdown errors',
      actual: `${markdownResult.issuesBySeverity.critical.length} critical errors`,
      severity: 'critical',
    });
  }

  if (markdownResult.issuesBySeverity.major.length > 0) {
    failures.push({
      filter: 'markdownStructure',
      expected: 'No major markdown errors',
      actual: `${markdownResult.issuesBySeverity.major.length} major errors`,
      severity: 'major',
    });
  }

  // Add suggestions for markdown issues
  if (!markdownResult.passed) {
    suggestions.push(
      `Markdown validation failed with ${markdownResult.issues.length} issues. Fix heading hierarchy, add code block languages, and ensure proper formatting.`
    );
  }

  // Run learning objective coverage check
  const objectiveCoverageResult = checkLearningObjectiveCoverage(content, lessonSpec);
  weightedScore +=
    objectiveCoverageResult.scoreContribution * FILTER_WEIGHTS.learningObjectiveCoverage;
  if (objectiveCoverageResult.failure) failures.push(objectiveCoverageResult.failure);
  if (objectiveCoverageResult.suggestion) suggestions.push(objectiveCoverageResult.suggestion);

  // Run prohibited terms check
  const prohibitedTermsResult = checkProhibitedTerms(content, lessonSpec);
  weightedScore += prohibitedTermsResult.scoreContribution * FILTER_WEIGHTS.prohibitedTerms;
  if (prohibitedTermsResult.failure) failures.push(prohibitedTermsResult.failure);
  if (prohibitedTermsResult.suggestion) suggestions.push(prohibitedTermsResult.suggestion);

  // Run prompt markers check (CRITICAL: detects LLM hallucination)
  const promptMarkersResult = checkPromptMarkers(content);
  weightedScore += promptMarkersResult.scoreContribution * FILTER_WEIGHTS.promptMarkers;
  if (promptMarkersResult.failure) failures.push(promptMarkersResult.failure);
  if (promptMarkersResult.suggestion) suggestions.push(promptMarkersResult.suggestion);

  // Run language consistency check (CRITICAL: detects CJK in Russian, etc.)
  const languageResult = checkLanguageConsistency(content, language);
  weightedScore += languageResult.scoreContribution * FILTER_WEIGHTS.languageConsistency;
  if (languageResult.failure) failures.push(languageResult.failure);
  if (languageResult.suggestion) suggestions.push(languageResult.suggestion);

  // Run Mermaid syntax check (HIGH: diagram validity)
  const mermaidResult = checkMermaidSyntax(content);
  weightedScore += mermaidResult.scoreContribution * FILTER_WEIGHTS.mermaidSyntax;
  if (mermaidResult.failure) failures.push(mermaidResult.failure);
  if (mermaidResult.suggestion) suggestions.push(mermaidResult.suggestion);

  // Run section duplication check (HIGH: detects generation loops)
  const duplicationResult = checkSectionDuplication(content);
  weightedScore += duplicationResult.scoreContribution * FILTER_WEIGHTS.sectionDuplication;
  if (duplicationResult.failure) failures.push(duplicationResult.failure);
  if (duplicationResult.suggestion) suggestions.push(duplicationResult.suggestion);

  // Calculate sentence stats
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = content.match(/\b[a-zA-Z]+\b/g) || [];
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;

  const passed =
    failures.filter(f => f.severity === 'critical' || f.severity === 'major').length === 0;
  const durationMs = Date.now() - startTime;

  logger.info({
    msg: 'Heuristic pre-filter complete',
    lessonId: lessonSpec.lesson_id,
    passed,
    score: weightedScore.toFixed(3),
    failureCount: failures.length,
    criticalFailures: failures.filter(f => f.severity === 'critical').length,
    durationMs,
  });

  return {
    passed,
    score: weightedScore,
    failures,
    suggestions,
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
        totalSections: duplicationResult.totalSections,
      },
    },
    durationMs,
  };
}
