type LessonContentLike = {
  status?: unknown;
  content?: unknown;
  metadata?: unknown;
};

const USABLE_LESSON_CONTENT_STATUSES = new Set(['completed', 'approved']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function buildMarkdownFromContent(content: Record<string, unknown>): string {
  const directMarkdown =
    getNonEmptyString(content.markdown) ??
    getNonEmptyString(content.rawMarkdown) ??
    getNonEmptyString(content.raw_markdown) ??
    getNonEmptyString(content.text);

  if (directMarkdown) {
    return directMarkdown;
  }

  const sections = Array.isArray(content.sections)
    ? (content.sections as Array<Record<string, unknown>>)
    : [];
  const exercises = Array.isArray(content.exercises)
    ? (content.exercises as Array<Record<string, unknown>>)
    : [];
  const parts: string[] = [];

  const intro = getNonEmptyString(content.intro) ?? getNonEmptyString(content.introduction);
  if (intro) {
    parts.push(`## Introduction\n\n${intro}`);
  }

  const mainContent =
    getNonEmptyString(content.mainContent) ?? getNonEmptyString(content.main_content);
  if (mainContent) {
    parts.push(`## Main Content\n\n${mainContent}`);
  }

  for (const section of sections) {
    const title = getNonEmptyString(section.title);
    const body = getNonEmptyString(section.content);

    if (title) {
      parts.push(`## ${title}`);
    }
    if (body) {
      parts.push(body);
    }
  }

  const summary = getNonEmptyString(content.summary);
  if (summary) {
    parts.push(`## Summary\n\n${summary}`);
  }

  if (exercises.length > 0) {
    parts.push('## Exercises');

    for (const exercise of exercises) {
      const title = getNonEmptyString(exercise.title);
      const description =
        getNonEmptyString(exercise.description) ?? getNonEmptyString(exercise.question);

      if (title) {
        parts.push(`### ${title}`);
      }
      if (description) {
        parts.push(description);
      }
    }
  }

  if (parts.length > 0) {
    return parts.join('\n\n');
  }

  return getNonEmptyString(content.body) ?? '';
}

export function getLessonContentMarkdown(row: LessonContentLike | null | undefined): string | null {
  if (!row) {
    return null;
  }

  const metadata = isRecord(row.metadata) ? row.metadata : null;
  const metadataMarkdown = metadata ? getNonEmptyString(metadata.markdownContent) : null;
  if (metadataMarkdown) {
    return metadataMarkdown;
  }

  if (typeof row.content === 'string') {
    return getNonEmptyString(row.content);
  }

  if (!isRecord(row.content)) {
    return null;
  }

  const nestedContent = isRecord(row.content.content)
    ? (row.content.content)
    : null;

  const markdown = buildMarkdownFromContent(nestedContent ?? row.content);
  return markdown.trim().length > 0 ? markdown : null;
}

export function isLessonContentUsable(row: LessonContentLike | null | undefined): boolean {
  if (!row) {
    return false;
  }

  if (typeof row.status === 'string' && !USABLE_LESSON_CONTENT_STATUSES.has(row.status)) {
    return false;
  }

  return getLessonContentMarkdown(row) !== null;
}

export function getLatestUsableLessonContent<T extends LessonContentLike>(
  rows: T[] | null | undefined
): T | null {
  if (!rows || rows.length === 0) {
    return null;
  }

  for (const row of rows) {
    if (isLessonContentUsable(row)) {
      return row;
    }
  }

  return null;
}
