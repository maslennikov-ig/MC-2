/**
 * Reverse parser for buildMarkdownFromContent
 *
 * Converts raw markdown back into structured lesson content
 * that matches the backend lessonContentSchema (strict mode):
 *   { intro?: string, sections?: {title, content}[], summary?: string, exercises?: unknown[] }
 *
 * Mapping rules (mirroring buildMarkdownFromContent):
 *   - Text before first ## heading → intro
 *   - ## Введение / ## Introduction → intro
 *   - ## Заключение / ## Summary → summary
 *   - All other ## headings → sections[{title, content}]
 *   - ## Упражнения subsections → kept in sections (not parsed as exercises for MVP)
 */

export interface ParsedLessonContent {
  intro?: string
  sections?: { title: string; content: string }[]
  summary?: string
}

const INTRO_HEADINGS = ['введение', 'introduction']
const SUMMARY_HEADINGS = ['заключение', 'summary', 'итоги', 'выводы']

export function parseMarkdownToContent(markdown: string): ParsedLessonContent {
  const result: ParsedLessonContent = {}
  const sections: { title: string; content: string }[] = []

  // Split by ## headings while preserving the heading text
  // Regex matches lines starting with "## " at the beginning of a line
  const headingRegex = /^## (.+)$/gm
  const headings: { title: string; start: number; end: number }[] = []

  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(markdown)) !== null) {
    headings.push({
      title: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  // Text before the first heading → intro (if non-empty)
  if (headings.length === 0) {
    // No headings at all — treat entire markdown as intro
    const trimmed = markdown.trim()
    if (trimmed) {
      result.intro = trimmed
    }
    return result
  }

  const textBeforeFirstHeading = markdown.slice(0, headings[0].start).trim()
  if (textBeforeFirstHeading) {
    result.intro = textBeforeFirstHeading
  }

  // Process each heading section
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]
    const nextStart = i + 1 < headings.length ? headings[i + 1].start : markdown.length
    const body = markdown.slice(heading.end, nextStart).trim()
    const titleLower = heading.title.toLowerCase()

    if (INTRO_HEADINGS.includes(titleLower)) {
      // Merge into intro (append if there was text before first heading)
      result.intro = result.intro ? `${result.intro}\n\n${body}` : body
    } else if (SUMMARY_HEADINGS.includes(titleLower)) {
      result.summary = body
    } else {
      sections.push({ title: heading.title, content: body })
    }
  }

  if (sections.length > 0) {
    result.sections = sections
  }

  return result
}
