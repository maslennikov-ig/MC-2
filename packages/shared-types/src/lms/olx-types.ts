/**
 * OLX (Open Learning XML) Type Schemas
 * @module lms/olx-types
 *
 * Zod schemas for Open edX OLX course structure.
 * These types are in-memory only (not persisted to database).
 *
 * OLX Structure:
 * Course → Chapters → Sequentials → Verticals → Components
 *
 * Mapping to MegaCampus:
 * - Course: Complete course
 * - Chapter: MegaCampus Section (top-level)
 * - Sequential: MegaCampus Lesson (subsection)
 * - Vertical: Content unit
 * - Component: HTML block
 */

import { z } from 'zod';

/**
 * OLX Course Metadata Schema
 *
 * Course-level metadata for OLX package.
 * Used in course.xml and policy.json files.
 *
 * Validation rules:
 * - org, course, run: ASCII only, max 50 chars
 * - display_name: UTF-8, supports Cyrillic
 * - language: 2-letter ISO code (default: 'ru')
 * - start/end: ISO 8601 date strings (optional)
 */
export const OlxCourseMetaSchema = z.object({
  /** Organization code (ASCII, no spaces) */
  org: z.string().min(1).max(50),
  /** Course code (ASCII, no spaces) */
  course: z.string().min(1).max(50),
  /** Course run identifier (ASCII, no spaces) */
  run: z.string().min(1).max(50),
  /** Human-readable course name (UTF-8, supports Cyrillic) */
  display_name: z.string().min(1),
  /** Course language code (2-letter ISO 639-1) */
  language: z.string().length(2).default('ru'),
  /** Course start date (ISO 8601 format) */
  start: z.string().optional(),
  /** Course end date (ISO 8601 format) */
  end: z.string().optional(),
});

/** OLX Course Meta type (inferred from schema) */
export type OlxCourseMeta = z.infer<typeof OlxCourseMetaSchema>;

/**
 * OLX Component Schema
 *
 * Represents a single content block (HTML, video, problem, etc.).
 * Currently only supports 'html' type.
 *
 * Future: Support 'video', 'problem', 'discussion' types.
 */
export const OlxComponentSchema = z.object({
  /** Component type (currently only 'html') */
  type: z.literal('html'),
  /** URL name (ASCII identifier, max 100 chars) */
  url_name: z.string().min(1).max(100),
  /** Display name (UTF-8, supports Cyrillic) */
  display_name: z.string().min(1),
  /** HTML content */
  content: z.string(),
});

/** OLX Component type (inferred from schema) */
export type OlxComponent = z.infer<typeof OlxComponentSchema>;

/**
 * OLX Vertical Schema
 *
 * Represents a unit (container for components).
 * Maps to a single content block in MegaCampus.
 *
 * Must contain at least one component.
 */
export const OlxVerticalSchema = z.object({
  /** URL name (ASCII identifier, max 100 chars) */
  url_name: z.string().min(1).max(100),
  /** Display name (UTF-8, supports Cyrillic) */
  display_name: z.string().min(1),
  /** Components within this vertical */
  components: z.array(z.lazy(() => OlxComponentSchema)),
});

/** OLX Vertical type (inferred from schema) */
export type OlxVertical = z.infer<typeof OlxVerticalSchema>;

/**
 * OLX Sequential Schema
 *
 * Represents a subsection (maps to MegaCampus Lesson).
 * Contains multiple verticals (units).
 *
 * Must contain at least one vertical.
 */
export const OlxSequentialSchema = z.object({
  /** URL name (ASCII identifier, max 100 chars) */
  url_name: z.string().min(1).max(100),
  /** Display name (UTF-8, supports Cyrillic) */
  display_name: z.string().min(1),
  /** Verticals (units) within this sequential */
  verticals: z.array(z.lazy(() => OlxVerticalSchema)),
});

/** OLX Sequential type (inferred from schema) */
export type OlxSequential = z.infer<typeof OlxSequentialSchema>;

/**
 * OLX Chapter Schema
 *
 * Represents a top-level section (maps to MegaCampus Section).
 * Contains multiple sequentials (subsections/lessons).
 *
 * Must contain at least one sequential.
 */
export const OlxChapterSchema = z.object({
  /** URL name (ASCII identifier, max 100 chars) */
  url_name: z.string().min(1).max(100),
  /** Display name (UTF-8, supports Cyrillic) */
  display_name: z.string().min(1),
  /** Sequentials (subsections) within this chapter */
  sequentials: z.array(z.lazy(() => OlxSequentialSchema)),
});

/** OLX Chapter type (inferred from schema) */
export type OlxChapter = z.infer<typeof OlxChapterSchema>;

/**
 * OLX Course Schema
 *
 * Complete OLX course structure.
 * Used for generating OLX tar.gz package.
 *
 * Must contain:
 * - meta: Course metadata
 * - chapters: At least one chapter
 */
export const OlxCourseSchema = z.object({
  /** Course metadata */
  meta: OlxCourseMetaSchema,
  /** Course chapters (sections) */
  chapters: z.array(OlxChapterSchema),
});

/** OLX Course type (inferred from schema) */
export type OlxCourse = z.infer<typeof OlxCourseSchema>;
