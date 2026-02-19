/**
 * Stage 5 Generation Orchestrator - Helper Functions
 *
 * Extracted from orchestrator.ts to reduce file size and function complexity.
 * Contains:
 * - Quality gate configuration and types
 * - Section quality validation
 * - Post-generation quality gate logic
 * - Result assembly utilities
 *
 * @module services/stage5/orchestrator-helpers
 */

import type {
  GenerationJobInput,
  GenerationMetadata,
  CourseStructure,
  CourseMetadata,
  Section,
} from '@megacampus/shared-types';
import { getCourseSizePreset } from '@megacampus/shared-types/course-size';
import type pino from 'pino';
import {
  QualityValidator,
  type CrossSectionOverlapResult,
} from '../../shared/validation/quality-validator';
import { calculateGenerationCost } from '../../shared/llm/cost-calculator';
import { MinimumLessonsValidator } from './validators/minimum-lessons-validator';
import { logTrace } from '../../shared/trace-logger';

// ============================================================================
// QUALITY GATE CONFIGURATION (T037)
// ============================================================================

/**
 * Quality gate configuration for section validation
 *
 * T037: Preparation for LLM Judge integration in Phase 6.5
 * Current implementation uses structural quality checks.
 */
export const QUALITY_CONFIG = {
  /** Semantic similarity threshold for quality validation */
  SIMILARITY_THRESHOLD: 0.75,
  /** Minimum lessons required per section for quality pass */
  MIN_LESSONS_PER_SECTION: 3,
  /** Minimum learning objectives required per lesson */
  MIN_OBJECTIVES_PER_LESSON: 1,
  /** Minimum key topics required per lesson */
  MIN_TOPICS_PER_LESSON: 2,
  /** Score penalty per failed quality check (each failure reduces score by 20%) */
  PENALTY_PER_FAILURE: 0.2,
  /** Enable LLM Judge validation (Phase 6.5 - T081-T094) */
  ENABLE_LLM_JUDGE: false,
} as const;

// ============================================================================
// SECTION QUALITY VALIDATION TYPES (T037)
// ============================================================================

/**
 * Result of section quality validation
 */
export interface SectionQualityValidationResult {
  /** Whether all quality checks passed */
  passed: boolean;
  /** Overall quality score (0-1 based on compliance percentage) */
  score: number;
  /** Sections that failed quality checks */
  failedSections: Array<{
    sectionNumber: number;
    score: number;
    reason: string;
  }>;
}

// ============================================================================
// STATE TYPES (re-exported for orchestrator)
// ============================================================================

/**
 * Token usage tracking from generation state
 */
export interface TokenUsageState {
  metadata: number;
  sections: number;
  validation: number;
  total: number;
}

/**
 * Model usage tracking from generation state
 */
export interface ModelUsedState {
  metadata: string;
  sections: string;
  validation?: string;
  sections_breakdown?: Array<{
    section_number: number;
    model: string;
    tier?: string;
    retry_count: number;
  }>;
}

/**
 * Retry count tracking from generation state
 */
export interface RetryCountState {
  metadata: number;
  sections: number[];
}

/**
 * Phase duration tracking from generation state
 */
export interface PhaseDurationsState {
  validate_input?: number;
  generate_metadata?: number;
  generate_sections?: number;
  validate_quality?: number;
}

/**
 * Quality scores tracking from generation state
 */
export interface QualityScoresState {
  metadata_similarity?: number;
  sections_similarity: number[];
  overall?: number;
}

// ============================================================================
// SECTION QUALITY VALIDATION (T037)
// ============================================================================

/**
 * Validate section quality with 0.75 threshold
 *
 * T037: Uses structural quality checks:
 * - Lesson count per section (min 3)
 * - Learning objectives per lesson (min 1)
 * - Key topics per lesson (min 2)
 *
 * Returns score 0-1 based on compliance percentage.
 */
export function validateSectionQuality(
  sections: Section[],
  input: GenerationJobInput,
  sectionLogger: pino.Logger
): SectionQualityValidationResult {
  sectionLogger.info(
    { sectionCount: sections.length, courseId: input.course_id },
    'Starting section quality validation (T037)'
  );

  const failedSections: SectionQualityValidationResult['failedSections'] = [];
  let totalChecks = 0;
  let passedChecks = 0;

  for (const section of sections) {
    const sectionNumber = section.section_number ?? 0;
    const reasons: string[] = [];

    // Check 1: Minimum lessons per section (min 3)
    totalChecks++;
    const lessonCount = section.lessons?.length ?? 0;
    if (lessonCount >= QUALITY_CONFIG.MIN_LESSONS_PER_SECTION) {
      passedChecks++;
    } else {
      reasons.push(
        `Insufficient lessons: ${lessonCount}/${QUALITY_CONFIG.MIN_LESSONS_PER_SECTION} required`
      );
    }

    // Check lessons for objectives and key topics
    for (const lesson of section.lessons ?? []) {
      // Check 2: Minimum lesson objectives per lesson (min 1)
      totalChecks++;
      const objectivesCount = lesson.lesson_objectives?.length ?? 0;
      if (objectivesCount >= QUALITY_CONFIG.MIN_OBJECTIVES_PER_LESSON) {
        passedChecks++;
      } else {
        reasons.push(
          `Lesson "${lesson.lesson_title}": ${objectivesCount}/${QUALITY_CONFIG.MIN_OBJECTIVES_PER_LESSON} lesson objectives`
        );
      }

      // Check 3: Minimum key topics per lesson (min 2)
      totalChecks++;
      const topicsCount = lesson.key_topics?.length ?? 0;
      if (topicsCount >= QUALITY_CONFIG.MIN_TOPICS_PER_LESSON) {
        passedChecks++;
      } else {
        reasons.push(
          `Lesson "${lesson.lesson_title}": ${topicsCount}/${QUALITY_CONFIG.MIN_TOPICS_PER_LESSON} key topics`
        );
      }
    }

    // If any reasons, this section failed
    if (reasons.length > 0) {
      const sectionScore = Math.max(0, 1 - reasons.length * QUALITY_CONFIG.PENALTY_PER_FAILURE);
      failedSections.push({
        sectionNumber,
        score: sectionScore,
        reason: reasons.join('; '),
      });
    }
  }

  // Calculate overall score based on compliance percentage
  const score = totalChecks > 0 ? passedChecks / totalChecks : 0;
  const passed = score >= QUALITY_CONFIG.SIMILARITY_THRESHOLD;

  const result: SectionQualityValidationResult = { passed, score, failedSections };

  if (!result.passed) {
    sectionLogger.warn(
      {
        qualityScore: result.score,
        threshold: QUALITY_CONFIG.SIMILARITY_THRESHOLD,
        failedSections: result.failedSections,
        courseId: input.course_id,
      },
      'Quality validation failed, may need regeneration'
    );
  } else {
    sectionLogger.info(
      {
        qualityScore: result.score,
        threshold: QUALITY_CONFIG.SIMILARITY_THRESHOLD,
        courseId: input.course_id,
      },
      'Quality validation passed'
    );
  }

  return result;
}

// ============================================================================
// POST-GENERATION QUALITY GATE
// ============================================================================

/**
 * Perform additional quality gate validation after section generation.
 *
 * T037: Integrates structural quality checks and minimum lessons validation.
 * Called after StateGraph execution.
 */
export async function performPostGenerationQualityGate(
  sections: Section[],
  input: GenerationJobInput,
  qualityLogger: pino.Logger
): Promise<{
  qualityResult: SectionQualityValidationResult;
  lessonsResult: ReturnType<MinimumLessonsValidator['validateSections']>;
  overlapResult: CrossSectionOverlapResult | null;
}> {
  // T037: Quality validation with 0.75 threshold
  const qualityResult = validateSectionQuality(sections, input, qualityLogger);

  if (!qualityResult.passed) {
    qualityLogger.warn(
      {
        qualityScore: qualityResult.score,
        threshold: QUALITY_CONFIG.SIMILARITY_THRESHOLD,
        failedSections: qualityResult.failedSections,
      },
      'Quality validation failed, may need regeneration'
    );
  }

  // Cross-section overlap detection (non-blocking, logging only)
  const detectedOverlap = await detectOverlap(sections, input, qualityLogger);

  // T037: Minimum lessons validation (FR-015)
  const lessonsResult = validateMinimumLessons(sections, input, qualityLogger);

  return { qualityResult, lessonsResult, overlapResult: detectedOverlap };
}

/**
 * Detect cross-section content overlap (non-blocking).
 * Exported for use in orchestrator overlap retry loop.
 */
export async function detectOverlap(
  sections: Section[],
  input: GenerationJobInput,
  overlapLogger: pino.Logger
): Promise<CrossSectionOverlapResult | null> {
  try {
    const qualityValidator = new QualityValidator(overlapLogger);
    const language = input.frontend_parameters?.language || 'en';
    const detectedOverlap = await qualityValidator.detectCrossSectionOverlap(sections, language);

    if (detectedOverlap.hasOverlap) {
      const summary = detectedOverlap.overlappingPairs
        .map(p => `S${p.sectionA}<>S${p.sectionB} (${p.similarity.toFixed(2)})`)
        .join(', ');

      overlapLogger.warn(
        {
          courseId: input.course_id,
          overlapCount: detectedOverlap.overlapCount,
          summary,
          overlappingPairs: detectedOverlap.overlappingPairs.map(p => ({
            sections: [p.sectionA, p.sectionB],
            similarity: p.similarity.toFixed(4),
            titles: [p.sectionATitle, p.sectionBTitle],
          })),
        },
        `Cross-section content overlap detected (informational only): ${summary}`
      );
    }

    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'validate_quality',
      stepName: 'overlap_detection',
      outputData: {
        hasOverlap: detectedOverlap.hasOverlap,
        overlapCount: detectedOverlap.overlapCount,
        overlappingPairs: detectedOverlap.overlappingPairs,
      },
      durationMs: 0,
      qualityScore: detectedOverlap.hasOverlap ? 0 : 1,
    });

    return detectedOverlap;
  } catch (overlapError) {
    overlapLogger.warn(
      { error: overlapError instanceof Error ? overlapError.message : String(overlapError) },
      'Cross-section overlap detection failed (non-blocking)'
    );
    return null;
  }
}

/**
 * Validate minimum lessons requirement.
 * Priority: user-edited total_lessons > course_size preset > default (10)
 */
function validateMinimumLessons(
  sections: Section[],
  input: GenerationJobInput,
  lessonsLogger: pino.Logger
): ReturnType<MinimumLessonsValidator['validateSections']> {
  const userEditedTotalLessons = input.analysis_result?.recommended_structure?.total_lessons;
  const userEditedTotalSections = input.analysis_result?.recommended_structure?.total_sections;

  const courseSize = input.frontend_parameters?.course_size ?? 'auto';
  const sizePreset = courseSize !== 'auto' ? getCourseSizePreset(courseSize) : undefined;

  let minLessons: number;
  let maxLessons: number | undefined;

  if (userEditedTotalLessons !== undefined && userEditedTotalLessons > 0) {
    minLessons = Math.max(1, Math.floor(userEditedTotalLessons * 0.8));
    maxLessons = Math.ceil(userEditedTotalLessons * 1.2);
    lessonsLogger.info(
      {
        userEditedTotalLessons,
        userEditedTotalSections,
        minLessons,
        maxLessons,
        source: 'user_edited',
      },
      'Using user-edited lesson constraints from Stage 4'
    );
  } else if (sizePreset) {
    minLessons = sizePreset.minLessons;
    maxLessons = sizePreset.maxLessons;
  } else {
    minLessons = 10;
    maxLessons = undefined;
  }

  const lessonsValidator = new MinimumLessonsValidator({
    minimumLessons: minLessons,
    maxLessons: maxLessons,
    maxLessonsTolerancePercent: 20,
  });
  const lessonsResult = lessonsValidator.validateSections(sections);

  if (!lessonsResult.passed) {
    lessonsLogger.warn(
      {
        totalLessons: lessonsResult.totalLessons,
        required: minLessons,
        courseSize,
        deficit: lessonsResult.deficit,
      },
      `Course does not meet minimum ${minLessons} lessons requirement for ${courseSize} preset`
    );
  }

  if (lessonsResult.maxExceeded) {
    lessonsLogger.warn(
      {
        totalLessons: lessonsResult.totalLessons,
        maxLessons,
        courseSize,
        excessPercentage: lessonsResult.excessPercentage,
      },
      `Course exceeds maximum ${maxLessons} lessons by ${lessonsResult.excessPercentage?.toFixed(1)}% for ${courseSize} preset`
    );
  }

  return lessonsResult;
}

// ============================================================================
// RESULT ASSEMBLY
// ============================================================================

/**
 * Assemble the final GenerationResult from the completed StateGraph state.
 */
export function assembleGenerationResult(
  metadata: CourseMetadata,
  sections: Section[],
  tokenUsage: TokenUsageState,
  modelUsed: ModelUsedState,
  qualityScores: QualityScoresState,
  phaseDurations: PhaseDurationsState,
  retryCount: RetryCountState,
  totalDuration: number
): { courseStructure: CourseStructure; generationMetadata: GenerationMetadata } {
  const courseStructure: CourseStructure = {
    ...(metadata as CourseStructure),
    sections,
  };

  // Calculate cost using cost-calculator service
  const costCalculationMetadata: Partial<GenerationMetadata> = {
    model_used: modelUsed,
    total_tokens: {
      metadata: tokenUsage.metadata,
      sections: tokenUsage.sections,
      validation: tokenUsage.validation,
      total: tokenUsage.total,
    },
  };
  const costBreakdown = calculateGenerationCost(costCalculationMetadata as GenerationMetadata);

  const generationMetadata: GenerationMetadata = {
    model_used: modelUsed,
    total_tokens: {
      metadata: tokenUsage.metadata,
      sections: tokenUsage.sections,
      validation: tokenUsage.validation,
      total: tokenUsage.total,
    },
    cost_usd: costBreakdown.total_cost_usd,
    duration_ms: {
      metadata: phaseDurations.generate_metadata || 0,
      sections: phaseDurations.generate_sections || 0,
      validation: phaseDurations.validate_quality || 0,
      total: totalDuration,
    },
    quality_scores: {
      metadata_similarity: qualityScores.metadata_similarity || 0,
      sections_similarity: qualityScores.sections_similarity,
      overall: qualityScores.overall || 0,
    },
    batch_count: sections.length,
    retry_count: {
      metadata: retryCount.metadata,
      sections: retryCount.sections,
    },
    created_at: new Date().toISOString(),
  };

  return { courseStructure, generationMetadata };
}

// ============================================================================
// OVERLAP RETRY FEEDBACK
// ============================================================================

/**
 * Build per-section overlap feedback for regeneration.
 *
 * For each section involved in an overlapping pair, creates specific
 * instructions about what the other section(s) already cover,
 * so the LLM can generate differentiated content on retry.
 *
 * @param overlapResult - Overlap detection result with pairs
 * @param sections - Current generated sections
 * @returns Map of sectionIndex (0-based) → feedback string
 */
export function buildSectionOverlapFeedback(
  overlapResult: CrossSectionOverlapResult,
  sections: Section[]
): Map<number, string> {
  const feedbackMap = new Map<number, string>();

  for (const pair of overlapResult.overlappingPairs) {
    // Convert section numbers to 0-based indices
    const idxA = pair.sectionA - 1;
    const idxB = pair.sectionB - 1;

    const addFeedback = (thisIdx: number, otherIdx: number) => {
      const otherSection = sections[otherIdx];
      if (!otherSection) return;

      const otherLessons =
        otherSection.lessons?.map(l => l.lesson_title).join(', ') || 'unknown topics';
      const newLine = `- Section ${otherIdx + 1} ("${otherSection.section_title || 'Unknown'}") already covers: ${otherLessons}. Your section MUST NOT duplicate these topics.`;
      const existing = feedbackMap.get(thisIdx) || '';
      feedbackMap.set(thisIdx, existing ? `${existing}\n${newLine}` : newLine);
    };

    addFeedback(idxA, idxB);
    addFeedback(idxB, idxA);
  }

  // Wrap each section's feedback with a header
  for (const [idx, lines] of feedbackMap) {
    feedbackMap.set(
      idx,
      `**OVERLAP CORRECTION** (CRITICAL — this section was REJECTED due to ${Math.round((overlapResult.overlappingPairs.find(p => p.sectionA - 1 === idx || p.sectionB - 1 === idx)?.similarity ?? 0) * 100)}% content overlap):
${lines}

You MUST regenerate this section with COMPLETELY DIFFERENT lesson topics from the sections listed above. Focus EXCLUSIVELY on the unique aspects defined by YOUR section's key topics from the course structure map.`
    );
  }

  return feedbackMap;
}
