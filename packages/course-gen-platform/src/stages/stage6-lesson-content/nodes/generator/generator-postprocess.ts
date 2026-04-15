import { logger } from '@/shared/logger';
import { CONCLUSION_HEADINGS, getContentLabels } from '@megacampus/shared-types';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip unwanted conclusion/summary sections from generated content.
 * Safety net for cases where LLM adds conclusion despite prompt instructions.
 * Does NOT strip the digest section or exercises.
 */
export function stripUnwantedConclusionSections(
  markdown: string,
  labels: ReturnType<typeof getContentLabels>
): string {
  const protectedHeadings = [labels.lessonDigest, labels.exercises, labels.introduction].map(h =>
    h.toLowerCase().trim()
  );

  const lines = markdown.split('\n');
  const result: string[] = [];
  let skipping = false;
  const strippedHeaders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      const headerText = headerMatch[1].trim();
      const headerLower = headerText.toLowerCase();
      const isProtected = protectedHeadings.some(ph => headerLower.startsWith(ph));

      if (isProtected) {
        skipping = false;
        result.push(line);
        continue;
      }

      const isConclusion = CONCLUSION_HEADINGS.some(ch => headerLower.startsWith(ch));
      if (isConclusion) {
        skipping = true;
        strippedHeaders.push(headerText);
        continue;
      }

      skipping = false;
      result.push(line);
      continue;
    }

    if (!skipping) {
      result.push(line);
    }
  }

  if (strippedHeaders.length > 0) {
    logger.info(
      { strippedHeaders, count: strippedHeaders.length },
      'Stripped unwanted conclusion/summary sections from generated content'
    );
  }

  return result
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/**
 * Extract lesson digest from generated markdown.
 */
export function extractLessonDigest(
  markdown: string,
  expectedHeader?: string
): {
  content: string;
  digest: string;
} {
  const headerAlternatives: string[] = [];
  if (expectedHeader) {
    headerAlternatives.push(escapeRegex(expectedHeader));
  }
  headerAlternatives.push('Lesson Digest', 'Краткое содержание урока', 'Дайджест урока');

  const unique = [...new Set(headerAlternatives)];
  const pattern = new RegExp(`^##\\s+(?:${unique.join('|')}).*$`, 'im');
  const match = markdown.match(pattern);

  if (!match || match.index === undefined) {
    logger.warn('No digest section found in generated content');
    return { content: markdown.trim(), digest: '' };
  }

  const digestStart = match.index;
  const contentBefore = markdown.slice(0, digestStart).trim();
  const digestRaw = markdown.slice(digestStart + match[0].length).trim();
  const digestClean = digestRaw
    .replace(/^[\s\n]*---[\s\n]*$/m, '')
    .replace(/^[\s\n]*\*\*\*[\s\n]*$/m, '')
    .trim();

  logger.debug(
    {
      digestLength: digestClean.length,
      contentLength: contentBefore.length,
    },
    'Extracted lesson digest from generated content'
  );

  return {
    content: contentBefore,
    digest: digestClean,
  };
}
