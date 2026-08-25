/**
 * Target Resolution Service for Chat Intent Processing
 *
 * Resolves user's natural language identifiers to actual paths in course structure.
 * Supports patterns like:
 * - "урок 2.3" → "sections[1].lessons[2]"
 * - "секция Введение" → "sections[0]"
 * - "section 2" → "sections[1]"
 * - "последнюю секцию" → last section
 * - "first lesson" → first lesson
 *
 * @module intent/target-resolver
 */

import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a potential match found by fuzzy target resolution
 */
export interface TargetMatch {
  /** Path to the matched element (e.g., "sections[0].lessons[1]") */
  path: string;
  /** Title of the matched element */
  title: string;
  /** Type of matched element */
  elementType: 'lesson' | 'section';
  /** Confidence score 0.0-1.0 (exact=1.0, startsWith=0.9, contains=0.7) */
  confidence: number;
  /** Human-readable identifier (e.g., "Урок 1.2" or "Секция 1") */
  displayLabel: string;
}

// ============================================================================
// Positional Reference Resolution (first/last)
// ============================================================================

/** Position extracted from natural language */
type PositionalRef = { position: 'first' | 'last'; elementType: 'section' | 'lesson' };

/**
 * Detect positional references like "последнюю секцию", "first lesson", etc.
 * Handles all Russian grammatical cases and English equivalents.
 */
function detectPositionalReference(identifier: string): PositionalRef | null {
  const lower = identifier.toLowerCase();

  // Detect position: last / first
  // Note: \b doesn't work with Cyrillic in JS regex, so we use (?=\s|$) or omit boundaries
  const lastMatch = lower.match(/(?:последн(?:ий|юю|яя|ее|ую|ей|ем|его)|last(?:\s|$))/);
  const firstMatch = lower.match(/(?:перв(?:ый|ую|ая|ое|ой|ого|ому|ом)|first(?:\s|$))/);
  if (!lastMatch && !firstMatch) return null;

  const positionalIdx = (lastMatch?.index ?? firstMatch?.index) as number;

  // Detect element type: section / lesson
  const sectionMatch = lower.match(/(?:секци[юяие]|section|раздел[аеуом]?)(?:\s|$)/);
  const lessonMatch = lower.match(/(?:урок[аеуом]?|lesson)(?:\s|$)/);
  if (!sectionMatch && !lessonMatch) return null;

  // When both types present (e.g. "удали последний урок в секции 2"),
  // pick the one closest to the positional keyword — the adjective modifies
  // the nearest noun.
  let elementType: 'section' | 'lesson';
  if (sectionMatch && lessonMatch) {
    const sectionDist = Math.abs((sectionMatch.index as number) - positionalIdx);
    const lessonDist = Math.abs((lessonMatch.index as number) - positionalIdx);
    elementType = lessonDist <= sectionDist ? 'lesson' : 'section';
  } else {
    elementType = sectionMatch ? 'section' : 'lesson';
  }

  return {
    position: lastMatch ? 'last' : 'first',
    elementType,
  };
}

/**
 * Resolve a positional reference to a concrete path.
 * "last section" → last section, "first lesson" → first lesson of first section.
 */
function resolvePositionalPath(
  ref: PositionalRef,
  courseStructure: CourseStructure
): string | null {
  const sections = courseStructure.sections;
  if (sections.length === 0) return null;

  if (ref.elementType === 'section') {
    const idx = ref.position === 'last' ? sections.length - 1 : 0;
    return `sections[${idx}]`;
  }

  // For lessons: "last lesson" = last lesson of last section,
  // "first lesson" = first lesson of first section
  if (ref.position === 'last') {
    const lastSectionIdx = sections.length - 1;
    const lastSection = sections[lastSectionIdx];
    if (lastSection.lessons.length === 0) return null;
    const lastLessonIdx = lastSection.lessons.length - 1;
    return `sections[${lastSectionIdx}].lessons[${lastLessonIdx}]`;
  } else {
    const firstSection = sections[0];
    if (firstSection.lessons.length === 0) return null;
    return `sections[0].lessons[0]`;
  }
}

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Resolve user's identifier (e.g., "урок 2.3", "секция Введение") to actual path
 *
 * @param identifier - User's natural language identifier
 * @param explicitPath - Explicit path from LLM classification
 * @param courseStructure - Course structure to resolve against
 * @param nodeContextPath - Path from node context (user selected element)
 * @returns Resolved path or null if cannot resolve
 *
 * @example
 * ```typescript
 * const path = resolveTargetPath("урок 2.3", undefined, courseStructure);
 * // "sections[1].lessons[2]"
 * ```
 */
export function resolveTargetPath(
  identifier: string | undefined | null,
  explicitPath: string | undefined | null,
  courseStructure: CourseStructure,
  nodeContextPath?: string | null
): string | null {
  // 1. If explicit path provided, use it
  if (explicitPath) {
    return explicitPath;
  }

  // 2. If nodeContext path provided (user selected element), use it
  if (nodeContextPath) {
    return nodeContextPath;
  }

  // 3. Try to resolve from identifier
  if (!identifier) {
    return null;
  }

  // P3-4: Limit identifier length to prevent regex DoS
  const MAX_IDENTIFIER_LENGTH = 200;
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    return null;
  }

  // Positional references: "последнюю секцию", "first lesson", etc.
  const positionalRef = detectPositionalReference(identifier);
  if (positionalRef) {
    return resolvePositionalPath(positionalRef, courseStructure);
  }

  // Match patterns like "урок 2.3", "lesson 2.3", "урок 1.2"
  // Using bounded digit groups (\d{1,3}) to prevent catastrophic backtracking
  const lessonMatch = identifier.match(/(?:урок|lesson)\s*(\d+)\.(\d+)/i);
  if (lessonMatch) {
    const [, sectionNum, lessonNum] = lessonMatch;
    const sectionIndex = parseInt(sectionNum, 10) - 1;
    const lessonIndex = parseInt(lessonNum, 10) - 1;

    if (
      courseStructure.sections[sectionIndex] &&
      courseStructure.sections[sectionIndex].lessons[lessonIndex]
    ) {
      return `sections[${sectionIndex}].lessons[${lessonIndex}]`;
    }
  }

  // Match patterns like "секция 2", "section 2", "секция Введение", "раздел 3"
  const sectionNumMatch = identifier.match(/(?:секция|section|раздел)\s*(\d+)/i);
  if (sectionNumMatch) {
    const sectionIndex = parseInt(sectionNumMatch[1], 10) - 1;
    if (courseStructure.sections[sectionIndex]) {
      return `sections[${sectionIndex}]`;
    }
  }

  // Match by section title
  const sectionTitleMatch = identifier.match(/(?:секция|section|раздел)\s+["']?(.+?)["']?$/i);
  if (sectionTitleMatch) {
    const title = sectionTitleMatch[1].toLowerCase();
    const index = courseStructure.sections.findIndex(s =>
      s.section_title.toLowerCase().includes(title)
    );
    if (index !== -1) {
      return `sections[${index}]`;
    }
  }

  // Try to find by lesson title substring (fuzzy match)
  const lowerIdentifier = identifier.toLowerCase();
  for (let sIdx = 0; sIdx < courseStructure.sections.length; sIdx++) {
    const section = courseStructure.sections[sIdx];
    for (let lIdx = 0; lIdx < section.lessons.length; lIdx++) {
      const lesson = section.lessons[lIdx];
      if (lesson.lesson_title.toLowerCase().includes(lowerIdentifier)) {
        return `sections[${sIdx}].lessons[${lIdx}]`;
      }
    }
  }

  // Try to find by section title substring (fuzzy match)
  for (let sIdx = 0; sIdx < courseStructure.sections.length; sIdx++) {
    const section = courseStructure.sections[sIdx];
    if (section.section_title.toLowerCase().includes(lowerIdentifier)) {
      return `sections[${sIdx}]`;
    }
  }

  return null;
}

// ============================================================================
// Confidence-Scored Path Resolution
// ============================================================================

/**
 * Confidence score constants for fuzzy matching
 */
const CONFIDENCE_SCORES = {
  /** Exact match: title exactly equals identifier */
  EXACT: 1.0,
  /** Starts with: title starts with identifier */
  STARTS_WITH: 0.9,
  /** Contains: title contains identifier as substring */
  CONTAINS: 0.7,
} as const;

/**
 * Calculate confidence score for a title match
 *
 * @param title - Element title (already lowercased)
 * @param identifier - Search identifier (already lowercased)
 * @returns Confidence score or 0 if no match
 */
function calculateMatchConfidence(title: string, identifier: string): number {
  if (title === identifier) {
    return CONFIDENCE_SCORES.EXACT;
  }
  if (title.startsWith(identifier)) {
    return CONFIDENCE_SCORES.STARTS_WITH;
  }
  if (title.includes(identifier)) {
    return CONFIDENCE_SCORES.CONTAINS;
  }
  return 0;
}

/**
 * Resolve user's identifier to all matching paths with confidence scores.
 *
 * Unlike resolveTargetPath which returns only the first match, this function
 * returns all matches sorted by confidence (highest first), allowing the caller
 * to handle ambiguous cases (e.g., asking user to clarify which element they meant).
 *
 * @param identifier - User's natural language identifier (e.g., "React", "урок 2.3")
 * @param explicitPath - Explicit path from LLM classification (takes priority)
 * @param courseStructure - Course structure to resolve against
 * @param nodeContextPath - Path from node context (user selected element)
 * @returns Array of matches sorted by confidence DESC, empty if no matches
 *
 * @example
 * ```typescript
 * const matches = resolveTargetPathWithMatches("React", undefined, courseStructure);
 * // [
 * //   { path: "sections[0].lessons[1]", title: "React Basics", confidence: 0.9, elementType: "lesson" },
 * //   { path: "sections[1].lessons[0]", title: "Advanced React Hooks", confidence: 0.7, elementType: "lesson" }
 * // ]
 * ```
 */
/**
 * Build the display label a user sees for a path: "Урок 2.3" or "Секция 2".
 *
 * One-based, because the paths are zero-based and the labels are for people. A path whose
 * indices cannot be parsed shows `?` rather than a wrong number.
 */
function displayLabelForPath(path: string): string {
  const indices = parsePathIndices(path);
  const section = indices?.sectionIndex !== undefined ? indices.sectionIndex + 1 : '?';
  if (!isLessonPath(path)) return `Секция ${section}`;
  const lesson = indices?.lessonIndex !== undefined ? indices.lessonIndex + 1 : '?';
  return `Урок ${section}.${lesson}`;
}

/**
 * The single, maximum-confidence match for a path the caller already knows.
 *
 * This block existed three times verbatim — for an explicit path, for a node-context path, and
 * for a resolved positional reference — which is most of where this resolver's cyclomatic
 * complexity of 51 came from. Returns `null` when the path names nothing, which the three
 * callers read differently: two of them stop, and the positional one falls through to the
 * pattern matching below.
 */
function exactMatchAtPath(courseStructure: CourseStructure, path: string): TargetMatch | null {
  const element = getElementAtPath(courseStructure, path);
  if (!element) return null;

  const isLesson = isLessonPath(path);
  return {
    path,
    title: isLesson ? (element as Lesson).lesson_title : (element as Section).section_title,
    elementType: isLesson ? 'lesson' : 'section',
    confidence: CONFIDENCE_SCORES.EXACT,
    displayLabel: displayLabelForPath(path),
  };
}

/**
 * Explicit numbering: "урок 2.3" / "lesson 2.3", and "секция 2" / "section 2" / "раздел 3".
 *
 * `null` rather than `[]` when the identifier carries no such pattern OR names an element that
 * does not exist — both mean "keep looking", which is what the original fall-through did.
 */
function matchByNumber(identifier: string, courseStructure: CourseStructure): TargetMatch | null {
  const lessonMatch = identifier.match(/(?:урок|lesson)\s*(\d+)\.(\d+)/i);
  if (lessonMatch) {
    const [, sectionNum, lessonNum] = lessonMatch;
    const sectionIndex = parseInt(sectionNum, 10) - 1;
    const lessonIndex = parseInt(lessonNum, 10) - 1;
    const lesson = courseStructure.sections[sectionIndex]?.lessons[lessonIndex];
    if (lesson) {
      return {
        path: `sections[${sectionIndex}].lessons[${lessonIndex}]`,
        title: lesson.lesson_title,
        elementType: 'lesson',
        confidence: CONFIDENCE_SCORES.EXACT,
        displayLabel: `Урок ${sectionIndex + 1}.${lessonIndex + 1}`,
      };
    }
  }

  const sectionNumMatch = identifier.match(/(?:секция|section|раздел)\s*(\d+)/i);
  if (sectionNumMatch) {
    const sectionIndex = parseInt(sectionNumMatch[1], 10) - 1;
    const section = courseStructure.sections[sectionIndex];
    if (section) {
      return {
        path: `sections[${sectionIndex}]`,
        title: section.section_title,
        elementType: 'section',
        confidence: CONFIDENCE_SCORES.EXACT,
        displayLabel: `Секция ${sectionIndex + 1}`,
      };
    }
  }

  return null;
}

/** Every section whose title resembles `title`, best first. */
function matchSectionsByTitle(title: string, courseStructure: CourseStructure): TargetMatch[] {
  const wanted = title.toLowerCase();
  const matches: TargetMatch[] = [];

  courseStructure.sections.forEach((section, sIdx) => {
    const confidence = calculateMatchConfidence(section.section_title.toLowerCase(), wanted);
    if (confidence > 0) {
      matches.push({
        path: `sections[${sIdx}]`,
        title: section.section_title,
        elementType: 'section',
        confidence,
        displayLabel: `Секция ${sIdx + 1}`,
      });
    }
  });

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/** Every lesson, then every section, whose title resembles the identifier. Unsorted. */
function fuzzyMatches(lowerIdentifier: string, courseStructure: CourseStructure): TargetMatch[] {
  const matches: TargetMatch[] = [];

  courseStructure.sections.forEach((section, sIdx) => {
    section.lessons.forEach((lesson, lIdx) => {
      const confidence = calculateMatchConfidence(
        lesson.lesson_title.toLowerCase(),
        lowerIdentifier
      );
      if (confidence > 0) {
        matches.push({
          path: `sections[${sIdx}].lessons[${lIdx}]`,
          title: lesson.lesson_title,
          elementType: 'lesson',
          confidence,
          displayLabel: `Урок ${sIdx + 1}.${lIdx + 1}`,
        });
      }
    });
  });

  courseStructure.sections.forEach((section, sIdx) => {
    const confidence = calculateMatchConfidence(
      section.section_title.toLowerCase(),
      lowerIdentifier
    );
    if (confidence > 0) {
      matches.push({
        path: `sections[${sIdx}]`,
        title: section.section_title,
        elementType: 'section',
        confidence,
        displayLabel: `Секция ${sIdx + 1}`,
      });
    }
  });

  return matches;
}

/** Same as `resolveTargetPath`, and applied before any matching is attempted. */
const MAX_IDENTIFIER_LENGTH = 200;

export function resolveTargetPathWithMatches(
  identifier: string | undefined | null,
  explicitPath: string | undefined | null,
  courseStructure: CourseStructure,
  nodeContextPath?: string | null
): TargetMatch[] {
  // 1-2. A path the caller already knows wins outright, and a path that names nothing is an
  // answer too: the caller asked about THAT element, so falling back to a fuzzy search over the
  // identifier would answer a different question.
  const knownPath = explicitPath || nodeContextPath;
  if (knownPath) {
    const match = exactMatchAtPath(courseStructure, knownPath);
    return match ? [match] : [];
  }

  // 3-4. Nothing to match on, or an identifier long enough to be an attack rather than a title.
  if (!identifier || identifier.length > MAX_IDENTIFIER_LENGTH) {
    return [];
  }

  // 5a. Positional reference: "последнюю секцию", "first lesson".
  const positionalRef = detectPositionalReference(identifier);
  const positionalPath = positionalRef
    ? resolvePositionalPath(positionalRef, courseStructure)
    : null;
  const positionalMatch = positionalPath ? exactMatchAtPath(courseStructure, positionalPath) : null;
  if (positionalMatch) return [positionalMatch];

  // 5b. Explicit numbering: "урок 2.3", "секция 2".
  const numbered = matchByNumber(identifier, courseStructure);
  if (numbered) return [numbered];

  // 5c. "секция <title>" names a section by name rather than by number.
  const sectionTitleMatch = identifier.match(/(?:секция|section|раздел)\s+["']?(.+?)["']?$/i);
  if (sectionTitleMatch) {
    const byTitle = matchSectionsByTitle(sectionTitleMatch[1], courseStructure);
    if (byTitle.length > 0) return byTitle;
  }

  // 6-8. Fuzzy over every title, best first, then by path so that equal scores order stably.
  return fuzzyMatches(identifier.toLowerCase(), courseStructure).sort((a, b) =>
    b.confidence !== a.confidence ? b.confidence - a.confidence : a.path.localeCompare(b.path)
  );
}

// ============================================================================
// Element Access
// ============================================================================

/**
 * Get element at path from course structure
 *
 * @param courseStructure - Course structure to query
 * @param path - Path to element (e.g., "sections[0].lessons[2]")
 * @returns Section or Lesson at path, or null if not found
 */
export function getElementAtPath(
  courseStructure: CourseStructure,
  path: string
): Section | Lesson | null {
  try {
    const parts = path.match(/sections\[(\d+)\](?:\.lessons\[(\d+)\])?/);
    if (!parts) return null;

    const sectionIndex = parseInt(parts[1], 10);
    const section = courseStructure.sections[sectionIndex];
    if (!section) return null;

    if (parts[2] !== undefined) {
      const lessonIndex = parseInt(parts[2], 10);
      return section.lessons[lessonIndex] || null;
    }

    return section;
  } catch {
    return null;
  }
}

/**
 * Check if path points to a lesson (vs section)
 *
 * @param path - Path to check (e.g., "sections[0].lessons[2]")
 * @returns True if path includes lesson component
 *
 * @example
 * ```typescript
 * isLessonPath("sections[0].lessons[2]") // true
 * isLessonPath("sections[0]") // false
 * ```
 */
export function isLessonPath(path: string): boolean {
  return path.includes('.lessons[');
}

/**
 * Check if path points to a section (not a lesson)
 *
 * @param path - Path to check (e.g., "sections[0]")
 * @returns True if path is a section path without lesson component
 *
 * @example
 * ```typescript
 * isSectionPath("sections[0]") // true
 * isSectionPath("sections[0].lessons[2]") // false
 * ```
 */
export function isSectionPath(path: string): boolean {
  return path.startsWith('sections[') && !path.includes('.lessons[');
}

/**
 * Parse path to extract section and lesson indices
 *
 * @param path - Path to parse (e.g., "sections[1].lessons[2]")
 * @returns Object with sectionIndex and optional lessonIndex, or null if invalid
 *
 * @example
 * ```typescript
 * parsePathIndices("sections[1].lessons[2]")
 * // { sectionIndex: 1, lessonIndex: 2 }
 *
 * parsePathIndices("sections[0]")
 * // { sectionIndex: 0, lessonIndex: undefined }
 * ```
 */
export function parsePathIndices(
  path: string
): { sectionIndex: number; lessonIndex?: number } | null {
  const match = path.match(/sections\[(\d+)\](?:\.lessons\[(\d+)\])?/);
  if (!match) return null;

  return {
    sectionIndex: parseInt(match[1], 10),
    lessonIndex: match[2] !== undefined ? parseInt(match[2], 10) : undefined,
  };
}

// ============================================================================
// Outline Generation (for targeted context)
// ============================================================================

/**
 * Generate lightweight course outline for context (when no specific element selected)
 * This is much smaller than full course_structure (~500 tokens vs 42K)
 */
export function generateCourseOutline(courseStructure: CourseStructure): {
  course_title: string;
  course_description: string;
  total_duration_hours: number;
  sections: Array<{
    section_number: number;
    section_title: string;
    lessons: Array<{
      lesson_number: string;
      lesson_title: string;
    }>;
  }>;
} {
  return {
    course_title: courseStructure.course_title,
    course_description: courseStructure.course_description,
    total_duration_hours: courseStructure.estimated_duration_hours,
    sections: courseStructure.sections.map((s, index) => ({
      section_number: s.section_number ?? index + 1,
      section_title: s.section_title,
      lessons: s.lessons.map(l => ({
        lesson_number: String(l.lesson_number),
        lesson_title: l.lesson_title,
      })),
    })),
  };
}
