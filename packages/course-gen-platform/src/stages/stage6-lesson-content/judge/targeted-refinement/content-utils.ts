import type {
  LessonContent,
  SectionRefinementTask,
  JudgeIssue,
  IterationResult,
} from '@megacampus/shared-types';
import type { IterationHistoryEntry } from '../fix-templates';
import { logger } from '../../../../shared/logger';

/**
 * Extract section content from lesson content by section ID
 *
 * Handles:
 * - sec_intro / intro: returns intro field
 * - sec_N: returns section at index N-1
 * - sec_conclusion: returns last section (or empty for new section)
 * - sec_introduction: returns first section (or intro)
 * - sec_global: returns empty (global issues affect whole content)
 */
export function extractSectionContent(content: LessonContent, sectionId: string): string {
  const body = content.content;

  // Handle intro request (special case)
  if (sectionId === 'sec_intro' || sectionId === 'intro') {
    return body.intro;
  }

  // Handle named sections
  const sectionIdLower = sectionId.toLowerCase();

  // Introduction: return first section or intro
  if (sectionIdLower === 'sec_introduction') {
    if (body.sections.length > 0) {
      return body.sections[0].content;
    }
    return body.intro;
  }

  // Conclusion: return existing conclusion content OR empty for new section creation
  if (sectionIdLower === 'sec_conclusion') {
    // Check if last section is already a conclusion
    const lastSection = body.sections[body.sections.length - 1];
    const isConclusionSection = lastSection &&
      /^(conclusion|заключение|итоги|выводы)$/i.test(lastSection.title.trim());

    if (isConclusionSection) {
      logger.info({ sectionId, conclusionTitle: lastSection.title, contentLength: lastSection.content.length },
        'Extracting existing conclusion section for update');
      return lastSection.content;
    }

    // Return empty string to signal that a new conclusion section needs to be created
    logger.info({ sectionId, totalSections: body.sections.length },
      'Conclusion section missing - returning empty for new section creation');
    return '';
  }

  // Global: return empty (global issues are handled differently)
  if (sectionIdLower === 'sec_global') {
    logger.info({ sectionId }, 'Global section requested - returning empty');
    return '';
  }

  // Parse section index from ID
  const match = sectionId.match(/sec_(\d+)/);
  if (!match) {
    logger.warn({ sectionId }, 'Invalid section ID format');
    return '';
  }

  const sectionIndex = parseInt(match[1], 10) - 1; // Convert to 0-indexed

  if (sectionIndex < 0 || sectionIndex >= body.sections.length) {
    logger.warn({
      sectionId,
      sectionIndex,
      totalSections: body.sections.length,
    }, 'Section index out of bounds');
    return '';
  }

  const section = body.sections[sectionIndex];
  logger.debug({
    sectionId,
    sectionTitle: section.title,
    contentLength: section.content.length,
  }, 'Extracted section content');

  return section.content;
}

/**
 * Apply patched content to a specific section (immutable update)
 *
 * Handles:
 * - sec_intro / intro: updates intro field
 * - sec_N: updates section at index N-1
 * - sec_conclusion: ADDS new conclusion section at end
 * - sec_introduction: updates first section
 * - sec_global: logs warning and returns unchanged (global issues need different handling)
 */
export function applyPatchToContent(
  content: LessonContent,
  sectionId: string,
  patchedContent: string
): LessonContent {
  const body = content.content;

  // Handle intro update (special case)
  if (sectionId === 'sec_intro' || sectionId === 'intro') {
    return {
      ...content,
      content: {
        ...body,
        intro: patchedContent,
      },
      updated_at: new Date(),
    };
  }

  // Handle named sections
  const sectionIdLower = sectionId.toLowerCase();

  // Introduction: update first section
  if (sectionIdLower === 'sec_introduction') {
    if (body.sections.length > 0) {
      const updatedSections = body.sections.map((section, index) => {
        if (index === 0) {
          logger.info({
            sectionId,
            oldLength: section.content.length,
            newLength: patchedContent.length,
          }, 'Updating introduction section');
          return { ...section, content: patchedContent };
        }
        return section;
      });

      return {
        ...content,
        content: { ...body, sections: updatedSections },
        updated_at: new Date(),
      };
    }
    // No sections exist, update intro instead
    return {
      ...content,
      content: { ...body, intro: patchedContent },
      updated_at: new Date(),
    };
  }

  // Conclusion: UPDATE existing or ADD new section at the end
  if (sectionIdLower === 'sec_conclusion') {
    // Check if last section is already a conclusion (for update)
    const lastSection = body.sections[body.sections.length - 1];
    const isConclusionSection = lastSection &&
      /^(conclusion|заключение|итоги|выводы)$/i.test(lastSection.title.trim());

    if (isConclusionSection) {
      // UPDATE existing conclusion section
      logger.info({
        sectionId,
        conclusionTitle: lastSection.title,
        oldLength: lastSection.content.length,
        newLength: patchedContent.length,
      }, 'Updating existing conclusion section');

      const updatedSections = body.sections.map((section, index) => {
        if (index === body.sections.length - 1) {
          return { ...section, content: patchedContent };
        }
        return section;
      });

      return {
        ...content,
        content: { ...body, sections: updatedSections },
        updated_at: new Date(),
      };
    }

    // ADD new conclusion section
    // Determine conclusion title based on existing content language
    const existingText = body.intro + body.sections.map(s => s.title).join('');
    const isRussian = /[а-яё]/i.test(existingText);
    const conclusionTitle = isRussian ? 'Заключение' : 'Conclusion';

    const newSection = {
      title: conclusionTitle,
      content: patchedContent,
    };

    logger.info({
      sectionId,
      conclusionTitle,
      contentLength: patchedContent.length,
      totalSectionsBefore: body.sections.length,
    }, 'Adding new conclusion section');

    return {
      ...content,
      content: {
        ...body,
        sections: [...body.sections, newSection],
      },
      updated_at: new Date(),
    };
  }

  // Global: cannot apply patch to global (would need to modify entire content)
  if (sectionIdLower === 'sec_global') {
    logger.warn({ sectionId },
      'Cannot apply patch to sec_global - global issues require different handling');
    return content;
  }

  const match = sectionId.match(/sec_(\d+)/);
  if (!match) {
    logger.warn({ sectionId }, 'Invalid section ID format, returning unchanged');
    return content;
  }

  const sectionIndex = parseInt(match[1], 10) - 1;

  if (sectionIndex < 0 || sectionIndex >= body.sections.length) {
    logger.warn({ sectionId, sectionIndex }, 'Section index out of bounds, returning unchanged');
    return content;
  }

  const updatedSections = body.sections.map((section, index) => {
    if (index === sectionIndex) {
      logger.debug({
        sectionId,
        sectionTitle: section.title,
        oldLength: section.content.length,
        newLength: patchedContent.length,
      }, 'Applying patch to section');

      return {
        ...section,
        content: patchedContent,
      };
    }
    return section;
  });

  return {
    ...content,
    content: {
      ...body,
      sections: updatedSections,
    },
    updated_at: new Date(),
  };
}

/**
 * Collect all issues from refinement tasks
 */
export function collectAllIssues(tasks: SectionRefinementTask[]): JudgeIssue[] {
  const allIssues: JudgeIssue[] = [];
  for (const task of tasks) {
    for (const targetedIssue of task.sourceIssues) {
      const { id, targetSectionId, fixAction, contextWindow, fixInstructions, ...judgeIssue } = targetedIssue;
      allIssues.push(judgeIssue as JudgeIssue);
    }
  }
  return allIssues;
}

/**
 * Convert contentHistory to IterationHistoryEntry[] for fix-templates
 */
export function convertToIterationHistory(
  contentHistory: IterationResult[]
): IterationHistoryEntry[] {
  // Slice off the last entry (current iteration)
  return contentHistory.slice(0, -1).map((result, index) => ({
    feedback: result.remainingIssues.length > 0
      ? `Iteration ${index + 1}: ${result.remainingIssues.length} issues remaining. ` +
        result.remainingIssues.slice(0, 3).map(i => i.description || 'No description').join('; ')
      : `Iteration ${index + 1}: No issues found.`,
    score: result.score,
  }));
}
