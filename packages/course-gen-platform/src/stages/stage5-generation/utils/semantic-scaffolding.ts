/**
 * Semantic Scaffolding Utilities for V2 LessonSpecification
 * @module stages/stage5-generation/utils/semantic-scaffolding
 *
 * Provides utility functions to infer Semantic Scaffolding properties for
 * V2 LessonSpecification generation based on analysis result data.
 *
 * These utilities analyze section breakdowns from Stage 4 analysis results
 * and determine appropriate content archetypes, hook strategies, depth levels,
 * and target audiences for Stage 5 content generation.
 *
 * @see specs/010-stages-456-pipeline/data-model.md
 * @see packages/shared-types/src/lesson-specification-v2.ts
 */

import type {
  ContentArchetype,
  HookStrategyV2,
  SectionDepthV2,
  TargetAudienceV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import { CONTENT_ARCHETYPE_TEMPERATURES_V2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-schemas';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import logger from '@/shared/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Section importance level from analysis breakdown
 */
type SectionImportance = 'core' | 'important' | 'optional';

/**
 * Difficulty level from section breakdown
 */
type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

// ============================================================================
// CONTENT ARCHETYPE INFERENCE
// ============================================================================

/**
 * Infer content archetype from section breakdown
 *
 * Analyzes section metadata (key_topics, pedagogical_approach, importance)
 * to determine the most appropriate content archetype for temperature routing.
 *
 * @param section - Section breakdown from AnalysisResult.recommended_structure.sections_breakdown
 * @returns Content archetype for the section
 *
 * @example
 * ```typescript
 * const section = analysisResult.recommended_structure.sections_breakdown[0];
 * const archetype = inferContentArchetype(section);
 * // Returns: 'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning'
 * ```
 */
export function inferContentArchetype(section: SectionBreakdown): ContentArchetype {
  // Handle edge cases
  if (!section) {
    logger.warn({ section }, 'inferContentArchetype: received null/undefined section, defaulting to concept_explainer');
    return 'concept_explainer';
  }

  const keyTopics = section.key_topics ?? [];
  const pedagogicalApproach = section.pedagogical_approach ?? '';
  const importance = section.importance ?? 'important';
  const area = section.area ?? '';

  // Combine text for keyword analysis (case-insensitive)
  const combinedText = [
    ...keyTopics,
    pedagogicalApproach,
    area,
  ].join(' ').toLowerCase();

  // Check for legal/compliance content (highest priority - lowest temperature needed)
  // Importance must be 'core' for legal content to ensure strict compliance
  const legalKeywords = ['legal', 'compliance', 'regulation', 'regulatory', 'law', 'policy', 'gdpr', 'hipaa', 'requirement'];
  if (importance === 'core' && legalKeywords.some(keyword => combinedText.includes(keyword))) {
    logger.debug({
      sectionArea: section.area,
      archetype: 'legal_warning',
      reason: 'Core section with legal/compliance keywords',
      matchedKeywords: legalKeywords.filter(kw => combinedText.includes(kw)),
    }, 'Content archetype inferred: legal_warning');
    return 'legal_warning';
  }

  // Check for code/programming content (lower temperature for precision)
  const codeKeywords = ['code', 'coding', 'programming', 'implementation', 'implement', 'develop', 'algorithm', 'function', 'api', 'sdk', 'debug', 'refactor'];
  if (codeKeywords.some(keyword => combinedText.includes(keyword))) {
    logger.debug({
      sectionArea: section.area,
      archetype: 'code_tutorial',
      reason: 'Section contains code/programming keywords',
      matchedKeywords: codeKeywords.filter(kw => combinedText.includes(kw)),
    }, 'Content archetype inferred: code_tutorial');
    return 'code_tutorial';
  }

  // Check for case study content (higher temperature for narrative style)
  const caseStudyKeywords = ['case study', 'case-study', 'real-world', 'real world', 'example', 'scenario', 'application', 'practical application', 'industry'];
  if (caseStudyKeywords.some(keyword => combinedText.includes(keyword))) {
    logger.debug({
      sectionArea: section.area,
      archetype: 'case_study',
      reason: 'Section contains case study/real-world keywords',
      matchedKeywords: caseStudyKeywords.filter(kw => combinedText.includes(kw)),
    }, 'Content archetype inferred: case_study');
    return 'case_study';
  }

  // Check pedagogical approach for case study hints
  if (pedagogicalApproach.toLowerCase().includes('case study') ||
      pedagogicalApproach.toLowerCase().includes('real-world')) {
    logger.debug({
      sectionArea: section.area,
      archetype: 'case_study',
      reason: 'Pedagogical approach mentions case study or real-world',
    }, 'Content archetype inferred: case_study');
    return 'case_study';
  }

  // Default to concept explainer (balanced temperature)
  logger.debug({
    sectionArea: section.area,
    archetype: 'concept_explainer',
    reason: 'No specific keywords matched, defaulting to concept_explainer',
  }, 'Content archetype inferred: concept_explainer');
  return 'concept_explainer';
}

// ============================================================================
// HOOK STRATEGY INFERENCE
// ============================================================================

/**
 * Infer hook strategy from learning objectives and key topics
 *
 * Analyzes the content of learning objectives and key topics to determine
 * the most engaging hook strategy for lesson introductions.
 *
 * @param learningObjectives - Section's learning_objectives array
 * @param keyTopics - Section's key_topics array
 * @returns Hook strategy for lesson introduction
 *
 * @example
 * ```typescript
 * const hookStrategy = inferHookStrategy(
 *   ['Compare React and Vue frameworks', 'Implement state management'],
 *   ['React', 'Vue', 'State Management']
 * );
 * // Returns: 'analogy' (because objective contains 'compare')
 * ```
 */
export function inferHookStrategy(
  learningObjectives: string[],
  keyTopics: string[]
): HookStrategyV2 {
  // Handle edge cases
  const objectives = learningObjectives ?? [];
  const topics = keyTopics ?? [];

  // Combine objectives for analysis (case-insensitive)
  const objectivesText = objectives.join(' ').toLowerCase();
  const topicsText = topics.join(' ').toLowerCase();
  const combinedText = `${objectivesText} ${topicsText}`;

  // Check for comparison/analogy keywords
  const analogyKeywords = ['compare', 'contrast', 'relate', 'similar', 'difference', 'analogy', 'like', 'versus', 'vs'];
  if (analogyKeywords.some(keyword => objectivesText.includes(keyword))) {
    logger.debug({
      strategy: 'analogy',
      reason: 'Objectives contain comparison keywords',
      matchedKeywords: analogyKeywords.filter(kw => objectivesText.includes(kw)),
    }, 'Hook strategy inferred: analogy');
    return 'analogy';
  }

  // Check for statistical/numerical content
  const statisticPatterns = /\d+%|\d+\s*percent|statistic|data|metric|measure|number|rate|ratio|percentage/i;
  if (statisticPatterns.test(combinedText)) {
    logger.debug({
      strategy: 'statistic',
      reason: 'Content contains numbers, percentages, or statistical keywords',
    }, 'Hook strategy inferred: statistic');
    return 'statistic';
  }

  // Check for problem-solving/challenge keywords (check objectives specifically)
  const challengeKeywords = ['solve', 'fix', 'debug', 'implement', 'build', 'create', 'develop', 'design', 'optimize', 'troubleshoot'];
  const objectivesStartWithChallenge = objectives.some(obj => {
    const firstWord = obj.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    return challengeKeywords.includes(firstWord);
  });

  if (objectivesStartWithChallenge) {
    logger.debug({
      strategy: 'challenge',
      reason: 'Objectives start with problem-solving verbs',
    }, 'Hook strategy inferred: challenge');
    return 'challenge';
  }

  // Check for challenge keywords anywhere in objectives
  if (challengeKeywords.some(keyword => objectivesText.includes(keyword))) {
    logger.debug({
      strategy: 'challenge',
      reason: 'Objectives contain problem-solving keywords',
      matchedKeywords: challengeKeywords.filter(kw => objectivesText.includes(kw)),
    }, 'Hook strategy inferred: challenge');
    return 'challenge';
  }

  // Default to question (thought-provoking opener)
  logger.debug({
    strategy: 'question',
    reason: 'No specific patterns matched, defaulting to question',
  }, 'Hook strategy inferred: question');
  return 'question';
}

// ============================================================================
// DEPTH MAPPING
// ============================================================================

/**
 * Map depth level based on difficulty and importance
 *
 * Determines the appropriate content depth (word count target) based on
 * section difficulty level and importance classification.
 *
 * Depth Mapping:
 * - summary: 200-400 words (beginner + optional)
 * - detailed_analysis: 500-1000 words (beginner+core/important OR intermediate)
 * - comprehensive: 1000+ words (advanced OR any+core)
 *
 * @param difficulty - Section difficulty level ('beginner' | 'intermediate' | 'advanced')
 * @param importance - Section importance ('core' | 'important' | 'optional')
 * @returns Section depth level
 *
 * @example
 * ```typescript
 * const depth = mapDepth('advanced', 'core');
 * // Returns: 'comprehensive'
 *
 * const depth2 = mapDepth('beginner', 'optional');
 * // Returns: 'summary'
 * ```
 */
export function mapDepth(
  difficulty: DifficultyLevel | undefined,
  importance: SectionImportance | undefined
): SectionDepthV2 {
  // Handle edge cases with sensible defaults
  const effectiveDifficulty = difficulty ?? 'beginner';
  const effectiveImportance = importance ?? 'important';

  // Advanced difficulty always gets comprehensive coverage
  if (effectiveDifficulty === 'advanced') {
    logger.debug({
      difficulty: effectiveDifficulty,
      importance: effectiveImportance,
      depth: 'comprehensive',
      reason: 'Advanced difficulty requires comprehensive coverage',
    }, 'Depth mapped: comprehensive');
    return 'comprehensive';
  }

  // Core importance gets comprehensive coverage regardless of difficulty
  if (effectiveImportance === 'core') {
    logger.debug({
      difficulty: effectiveDifficulty,
      importance: effectiveImportance,
      depth: 'comprehensive',
      reason: 'Core importance requires comprehensive coverage',
    }, 'Depth mapped: comprehensive');
    return 'comprehensive';
  }

  // Beginner + optional gets summary (minimal coverage)
  if (effectiveDifficulty === 'beginner' && effectiveImportance === 'optional') {
    logger.debug({
      difficulty: effectiveDifficulty,
      importance: effectiveImportance,
      depth: 'summary',
      reason: 'Beginner difficulty with optional importance gets summary',
    }, 'Depth mapped: summary');
    return 'summary';
  }

  // Intermediate difficulty OR (beginner + important) gets detailed analysis
  if (effectiveDifficulty === 'intermediate' ||
      (effectiveDifficulty === 'beginner' && effectiveImportance === 'important')) {
    logger.debug({
      difficulty: effectiveDifficulty,
      importance: effectiveImportance,
      depth: 'detailed_analysis',
      reason: 'Intermediate or beginner+important gets detailed analysis',
    }, 'Depth mapped: detailed_analysis');
    return 'detailed_analysis';
  }

  // Default to detailed_analysis for any unhandled cases
  logger.debug({
    difficulty: effectiveDifficulty,
    importance: effectiveImportance,
    depth: 'detailed_analysis',
    reason: 'Default fallback to detailed_analysis',
  }, 'Depth mapped: detailed_analysis');
  return 'detailed_analysis';
}

// ============================================================================
// TARGET AUDIENCE INFERENCE
// ============================================================================

/**
 * Infer target audience from full analysis result
 *
 * Maps the analysis result's target_audience and course_category to
 * V2 LessonSpecification target audience types.
 *
 * Mapping Logic:
 * - beginner -> 'novice'
 * - advanced + professional category -> 'executive'
 * - all other cases -> 'practitioner'
 *
 * @param analysisResult - Full analysis result from Stage 4
 * @returns V2 target audience type
 *
 * @example
 * ```typescript
 * const audience = inferTargetAudience(analysisResult);
 * // Returns: 'executive' | 'practitioner' | 'novice'
 * ```
 */
export function inferTargetAudience(analysisResult: AnalysisResult | null | undefined): TargetAudienceV2 {
  // Handle null/undefined analysis result
  if (!analysisResult) {
    logger.warn({
      audience: 'practitioner',
      reason: 'No analysis result provided, defaulting to practitioner',
    }, 'Target audience inferred: practitioner (no analysis)');
    return 'practitioner';
  }

  const targetAudience = analysisResult.topic_analysis?.target_audience;
  const primaryCategory = analysisResult.course_category?.primary;

  // Beginner audience maps to novice
  if (targetAudience === 'beginner') {
    logger.debug({
      targetAudience,
      primaryCategory,
      audience: 'novice',
      reason: 'Beginner target audience maps to novice',
    }, 'Target audience inferred: novice');
    return 'novice';
  }

  // Advanced + professional category maps to executive
  if (targetAudience === 'advanced' && primaryCategory === 'professional') {
    logger.debug({
      targetAudience,
      primaryCategory,
      audience: 'executive',
      reason: 'Advanced audience with professional category maps to executive',
    }, 'Target audience inferred: executive');
    return 'executive';
  }

  // Default to practitioner for intermediate, mixed, or other combinations
  logger.debug({
    targetAudience,
    primaryCategory,
    audience: 'practitioner',
    reason: 'Default mapping to practitioner',
  }, 'Target audience inferred: practitioner');
  return 'practitioner';
}

// ============================================================================
// TEMPERATURE UTILITIES
// ============================================================================

/**
 * Get recommended temperature for a content archetype
 *
 * Returns the middle value of the temperature range for the given archetype.
 * Temperature affects LLM creativity vs consistency tradeoff.
 *
 * Temperature Ranges:
 * - code_tutorial: 0.2-0.3 (returns 0.25) - precise, deterministic
 * - concept_explainer: 0.6-0.7 (returns 0.65) - balanced creativity
 * - case_study: 0.5-0.6 (returns 0.55) - narrative flexibility
 * - legal_warning: 0.0-0.1 (returns 0.05) - maximum precision
 *
 * @param archetype - Content archetype
 * @returns Recommended temperature (middle of range)
 *
 * @example
 * ```typescript
 * const temp = getTemperatureForArchetype('code_tutorial');
 * // Returns: 0.25
 *
 * const temp2 = getTemperatureForArchetype('legal_warning');
 * // Returns: 0.05
 * ```
 */
export function getTemperatureForArchetype(archetype: ContentArchetype): number {
  // Validate archetype and get range
  const range = CONTENT_ARCHETYPE_TEMPERATURES_V2[archetype];

  if (!range) {
    logger.warn({
      archetype,
      defaultTemperature: 0.5,
      reason: 'Unknown archetype, using default temperature',
    }, 'getTemperatureForArchetype: unknown archetype');
    return 0.5; // Safe default
  }

  // Calculate middle of range
  const temperature = (range.min + range.max) / 2;

  logger.debug({
    archetype,
    range,
    temperature,
  }, 'Temperature calculated for archetype');

  return temperature;
}

// ============================================================================
// COMPOSITE UTILITY
// ============================================================================

/**
 * Semantic scaffolding inference result
 */
export interface SemanticScaffoldingResult {
  contentArchetype: ContentArchetype;
  hookStrategy: HookStrategyV2;
  depth: SectionDepthV2;
  targetAudience: TargetAudienceV2;
  temperature: number;
}

/**
 * Infer all semantic scaffolding properties for a section
 *
 * Convenience function that combines all inference utilities to generate
 * a complete semantic scaffolding configuration for a section.
 *
 * @param section - Section breakdown from analysis result
 * @param analysisResult - Full analysis result (for target audience inference)
 * @returns Complete semantic scaffolding configuration
 *
 * @example
 * ```typescript
 * const scaffolding = inferSemanticScaffolding(section, analysisResult);
 * // Returns: {
 * //   contentArchetype: 'code_tutorial',
 * //   hookStrategy: 'challenge',
 * //   depth: 'comprehensive',
 * //   targetAudience: 'practitioner',
 * //   temperature: 0.25
 * // }
 * ```
 */
export function inferSemanticScaffolding(
  section: SectionBreakdown,
  analysisResult: AnalysisResult | null | undefined
): SemanticScaffoldingResult {
  const contentArchetype = inferContentArchetype(section);
  const hookStrategy = inferHookStrategy(
    section.learning_objectives ?? [],
    section.key_topics ?? []
  );
  const depth = mapDepth(section.difficulty, section.importance);
  const targetAudience = inferTargetAudience(analysisResult);
  const temperature = getTemperatureForArchetype(contentArchetype);

  logger.info({
    sectionArea: section.area,
    contentArchetype,
    hookStrategy,
    depth,
    targetAudience,
    temperature,
  }, 'Semantic scaffolding inferred for section');

  return {
    contentArchetype,
    hookStrategy,
    depth,
    targetAudience,
    temperature,
  };
}
