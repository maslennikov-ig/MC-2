/**
 * Lesson Content Parser
 * Handles various JSONB structures in lesson.content field
 */
import type { Lesson } from '@/types/database'

/**
 * Type guard for validating section structure from JSONB
 */
function isValidSection(item: unknown): item is { title: string; content: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'title' in item &&
    'content' in item &&
    typeof (item as Record<string, unknown>).title === 'string' &&
    typeof (item as Record<string, unknown>).content === 'string'
  )
}

/**
 * Type guard for validating example structure from JSONB
 */
function isValidExample(
  item: unknown
): item is { title: string; code?: string; explanation: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'title' in item &&
    'explanation' in item &&
    typeof (item as Record<string, unknown>).title === 'string' &&
    typeof (item as Record<string, unknown>).explanation === 'string'
  )
}

export interface ParsedLessonContent {
  markdown: string
  structured?: {
    sections?: Array<{ title: string; content: string }>
    keyPoints?: string[]
    examples?: Array<{ title: string; code?: string; explanation: string }>
  }
}

/**
 * Parse lesson content from various possible JSONB structures.
 *
 * The lesson.content field in the database is JSONB and can have different structures:
 * - { markdown: "..." } - Primary structure with markdown content
 * - { text: "..." } - Alternative text field
 * - { content: "..." } - Nested content field
 * - { body: "..." } - Body field variant
 *
 * Additionally supports structured content with:
 * - sections: Array of titled content sections
 * - keyPoints: Array of key learning points
 * - examples: Array of code examples with explanations
 *
 * @param lesson - The lesson object from the database
 * @returns ParsedLessonContent with markdown string and optional structured data
 */
export function parseLessonContent(lesson: Lesson): ParsedLessonContent {
  // Priority 1: content_text (legacy plain markdown)
  if (lesson.content_text && typeof lesson.content_text === 'string') {
    return { markdown: lesson.content_text }
  }

  // Priority 2: content JSONB
  if (lesson.content && typeof lesson.content === 'object') {
    const content = lesson.content as Record<string, unknown>

    // Handle various JSONB structures
    if (typeof content.markdown === 'string') {
      return {
        markdown: content.markdown,
        structured: {
          sections: Array.isArray(content.sections)
            ? content.sections.filter(isValidSection)
            : undefined,
          keyPoints: Array.isArray(content.keyPoints)
            ? content.keyPoints.filter((k): k is string => typeof k === 'string')
            : undefined,
          examples: Array.isArray(content.examples)
            ? content.examples.filter(isValidExample)
            : undefined,
        },
      }
    }
    if (typeof content.text === 'string') {
      return { markdown: content.text }
    }
    if (typeof content.content === 'string') {
      return { markdown: content.content }
    }
    if (typeof content.body === 'string') {
      return { markdown: content.body }
    }

    // If it's an object but no known string field, log for debugging
    if (process.env.NODE_ENV === 'development') {
      console.warn('Unknown lesson.content structure:', Object.keys(content))
    }
    return { markdown: '' }
  }

  // Priority 3: content as string (shouldn't happen but handle it)
  if (typeof lesson.content === 'string') {
    return { markdown: lesson.content }
  }

  return { markdown: '' }
}

/**
 * Check if parsed content has any displayable markdown
 */
export function hasDisplayableContent(parsed: ParsedLessonContent): boolean {
  return parsed.markdown.trim().length > 0
}

/**
 * Check if parsed content has structured data
 */
export function hasStructuredContent(parsed: ParsedLessonContent): boolean {
  if (!parsed.structured) return false
  const { sections, keyPoints, examples } = parsed.structured
  return Boolean(
    (sections && sections.length > 0) ||
    (keyPoints && keyPoints.length > 0) ||
    (examples && examples.length > 0)
  )
}
