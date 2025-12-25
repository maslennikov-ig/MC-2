/**
 * Section Regenerator
 * @module stages/stage6-lesson-content/utils/section-regenerator
 *
 * Regenerates specific sections of lesson content while preserving
 * the rest of the document. Uses the existing generateSection() from
 * generator.ts for content generation.
 *
 * This is a minimal approach to section-level self-fix:
 * 1. Parse markdown to identify sections
 * 2. Regenerate only the problematic sections
 * 3. Merge regenerated content back into full document
 */

import { logger } from '@/shared/logger';
import type { LessonSpecificationV2, SectionSpecV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { generateSection } from '../nodes/generator';
import {
  parseMarkdownSections,
  mergeSectionIntoMarkdown,
  getSectionContext,
} from './markdown-section-parser';

/**
 * Result of section regeneration
 */
export interface SectionRegenerationResult {
  /** Success flag */
  success: boolean;
  /** Updated markdown content */
  content: string;
  /** Total tokens used for regeneration */
  tokensUsed: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Sections that were regenerated */
  regeneratedSections: string[];
  /** Sections that failed to regenerate */
  failedSections: string[];
  /** Error message if any */
  errorMessage?: string;
}

/**
 * Input for section regeneration
 */
export interface SectionRegenerationInput {
  /** Raw markdown content */
  markdown: string;
  /** Section IDs to regenerate */
  sectionIds: string[];
  /** Lesson specification */
  lessonSpec: LessonSpecificationV2;
  /** RAG chunks for grounding */
  ragChunks: RAGChunk[];
  /** Target language */
  language: string;
  /** Optional model override */
  modelOverride?: string | null;
}

/**
 * Map section ID to section spec from lesson specification
 *
 * @param sectionId - Section ID (introduction, section_1, summary, etc.)
 * @param lessonSpec - Lesson specification
 * @returns Matching section spec or null
 */
function findSectionSpec(
  sectionId: string,
  lessonSpec: LessonSpecificationV2
): SectionSpecV2 | null {
  // Introduction and summary are special - we handle them differently
  if (sectionId === 'introduction' || sectionId === 'summary') {
    // These don't have direct section specs, return null
    // They will be regenerated using the intro/summary generators
    return null;
  }

  // Match section_N to lessonSpec.sections[N-1]
  const match = sectionId.match(/section_(\d+)/);
  if (match) {
    const index = parseInt(match[1], 10) - 1;
    if (index >= 0 && index < lessonSpec.sections.length) {
      return lessonSpec.sections[index];
    }
  }

  return null;
}

/**
 * Generate introduction content
 *
 * Simplified version for regeneration - uses minimal prompt.
 */
async function regenerateIntroduction(
  lessonSpec: LessonSpecificationV2,
  language: string,
  modelOverride?: string | null
): Promise<{ content: string; tokensUsed: number }> {
  // Create a synthetic section spec for introduction
  const introSection: SectionSpecV2 = {
    title: language === 'ru' ? 'Введение' : 'Introduction',
    key_points_to_cover: lessonSpec.intro_blueprint.key_learning_objectives.split(', '),
    rag_context_id: 'introduction',
    content_archetype: 'concept_explainer',
    constraints: {
      depth: 'summary',
      required_keywords: [],
      prohibited_terms: [],
    },
  };

  return generateSection(
    introSection,
    lessonSpec,
    [], // No RAG for intro
    '', // No previous context for intro
    language,
    modelOverride
  );
}

/**
 * Generate summary content
 *
 * Simplified version for regeneration.
 */
async function regenerateSummary(
  lessonSpec: LessonSpecificationV2,
  previousContext: string,
  language: string,
  modelOverride?: string | null
): Promise<{ content: string; tokensUsed: number }> {
  // Create a synthetic section spec for summary
  const summarySection: SectionSpecV2 = {
    title: language === 'ru' ? 'Итог' : 'Summary',
    key_points_to_cover: lessonSpec.learning_objectives.map((lo) => lo.objective),
    rag_context_id: 'summary',
    content_archetype: 'concept_explainer',
    constraints: {
      depth: 'summary',
      required_keywords: [],
      prohibited_terms: [],
    },
  };

  return generateSection(
    summarySection,
    lessonSpec,
    [], // No RAG for summary
    previousContext,
    language,
    modelOverride
  );
}

/**
 * Regenerate specific sections of lesson content
 *
 * Takes a list of section IDs and regenerates only those sections,
 * merging the results back into the full markdown document.
 *
 * @param input - Section regeneration input
 * @returns Regeneration result with updated content
 */
export async function regenerateSections(
  input: SectionRegenerationInput
): Promise<SectionRegenerationResult> {
  const startTime = performance.now();
  const {
    markdown,
    sectionIds,
    lessonSpec,
    ragChunks,
    language,
    modelOverride,
  } = input;

  const nodeLogger = logger.child({
    component: 'section-regenerator',
    lessonId: lessonSpec.lesson_id,
    sectionsToRegenerate: sectionIds,
  });

  nodeLogger.info({ msg: 'Starting section regeneration', sectionCount: sectionIds.length });

  try {
    // Parse markdown into sections
    const parsed = parseMarkdownSections(markdown);
    nodeLogger.debug({
      msg: 'Parsed markdown',
      sectionsFound: parsed.sections.map((s) => s.id),
    });

    let currentMarkdown = markdown;
    let totalTokens = 0;
    const regeneratedSections: string[] = [];
    const failedSections: string[] = [];

    // Regenerate each section
    for (const sectionId of sectionIds) {
      try {
        nodeLogger.debug({ msg: 'Regenerating section', sectionId });

        // Re-parse after each change to get updated line numbers
        const currentParsed = parseMarkdownSections(currentMarkdown);
        const context = getSectionContext(currentParsed, sectionId);

        let result: { content: string; tokensUsed: number };

        if (sectionId === 'introduction') {
          result = await regenerateIntroduction(lessonSpec, language, modelOverride);
        } else if (sectionId === 'summary') {
          result = await regenerateSummary(lessonSpec, context, language, modelOverride);
        } else {
          const sectionSpec = findSectionSpec(sectionId, lessonSpec);
          if (!sectionSpec) {
            nodeLogger.warn({ msg: 'Section spec not found', sectionId });
            failedSections.push(sectionId);
            continue;
          }

          result = await generateSection(
            sectionSpec,
            lessonSpec,
            ragChunks,
            context,
            language,
            modelOverride
          );
        }

        // The generated content doesn't include the header, so add it
        const section = currentParsed.sections.find((s) => s.id === sectionId);
        const sectionTitle = section?.title || sectionId;
        const newSectionContent = `## ${sectionTitle}\n\n${result.content}`;

        // Merge back into markdown
        currentMarkdown = mergeSectionIntoMarkdown(
          currentParsed,
          sectionId,
          newSectionContent
        );

        totalTokens += result.tokensUsed;
        regeneratedSections.push(sectionId);

        nodeLogger.debug({
          msg: 'Section regenerated',
          sectionId,
          tokensUsed: result.tokensUsed,
          contentLength: result.content.length,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        nodeLogger.error({
          msg: 'Failed to regenerate section',
          sectionId,
          error: errorMessage,
        });
        failedSections.push(sectionId);
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    const success = failedSections.length === 0;
    nodeLogger.info({
      msg: 'Section regeneration complete',
      success,
      regeneratedCount: regeneratedSections.length,
      failedCount: failedSections.length,
      totalTokens,
      durationMs,
    });

    return {
      success,
      content: currentMarkdown,
      tokensUsed: totalTokens,
      durationMs,
      regeneratedSections,
      failedSections,
      errorMessage: failedSections.length > 0
        ? `Failed to regenerate sections: ${failedSections.join(', ')}`
        : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Math.round(performance.now() - startTime);

    nodeLogger.error({
      msg: 'Section regeneration failed',
      error: errorMessage,
    });

    return {
      success: false,
      content: markdown, // Return original on failure
      tokensUsed: 0,
      durationMs,
      regeneratedSections: [],
      failedSections: sectionIds,
      errorMessage,
    };
  }
}
