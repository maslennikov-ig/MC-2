/**
 * LMS Course Input Schemas
 * @module lms/course-input
 *
 * LMS-agnostic course structure schemas.
 * Intermediate format for mapping MegaCampus courses to LMS-specific formats (OLX, etc.).
 */

import { z } from 'zod';
import { languageSchema } from '../common-enums';

/**
 * Unit Input Schema
 *
 * Represents a single content block within a section.
 * Maps to:
 * - Open edX: Vertical + HTML component
 * - Moodle: Page or Label
 */
export const UnitInputSchema = z.object({
  /** Unit identifier (ASCII or will be transliterated) */
  id: z.string(),
  /** Unit title (UTF-8, supports Cyrillic) */
  title: z.string().min(1),
  /** HTML content */
  content: z.string(),
  /** Static asset URLs (images, etc.) */
  assets: z.array(z.string().url()).optional(),
});

/** Unit Input type (inferred from schema) */
export type UnitInput = z.infer<typeof UnitInputSchema>;

/**
 * Section Input Schema
 *
 * Represents a subsection containing multiple units.
 * Maps to:
 * - Open edX: Sequential (subsection)
 * - Moodle: Section or Topic
 */
export const SectionInputSchema = z.object({
  /** Section identifier */
  id: z.string(),
  /** Section title (UTF-8, supports Cyrillic) */
  title: z.string().min(1),
  /** Units within this section (minimum 1) */
  units: z.array(UnitInputSchema).min(1),
});

/** Section Input type (inferred from schema) */
export type SectionInput = z.infer<typeof SectionInputSchema>;

/**
 * Chapter Input Schema
 *
 * Represents a top-level course division.
 * Maps to:
 * - Open edX: Chapter (top-level section)
 * - Moodle: Section group or Module
 */
export const ChapterInputSchema = z.object({
  /** Chapter identifier */
  id: z.string(),
  /** Chapter title (UTF-8, supports Cyrillic) */
  title: z.string().min(1),
  /** Sections within this chapter (minimum 1) */
  sections: z.array(SectionInputSchema).min(1),
});

/** Chapter Input type (inferred from schema) */
export type ChapterInput = z.infer<typeof ChapterInputSchema>;

/**
 * Course Input Schema
 *
 * Complete course structure for LMS publishing.
 * LMS-agnostic format that can be converted to:
 * - Open edX OLX
 * - Moodle MBZ
 * - Canvas course package
 *
 * Validation rules:
 * - courseId: ASCII alphanumeric, no spaces
 * - org: ASCII alphanumeric, no spaces
 * - run: ASCII alphanumeric, no spaces
 * - title: 1-255 characters, UTF-8
 * - language: Uses shared languageSchema (19 supported languages)
 * - chapters: Minimum 1 chapter required
 */
export const CourseInputSchema = z.object({
  /** Unique course identifier (ASCII, no spaces) */
  courseId: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Course ID must be ASCII alphanumeric'),

  /** Course title (UTF-8, displayed to users) */
  title: z.string().min(1).max(255),

  /** Course description (optional) */
  description: z.string().optional(),

  /** Organization identifier (ASCII) */
  org: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  /** Course run identifier (e.g., "2025_Q1", "self_paced") */
  run: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  /** ISO 8601 course start date (optional) */
  startDate: z.string().datetime().optional(),

  /** ISO 8601 enrollment start date (optional) */
  enrollmentStart: z.string().datetime().optional(),

  /** ISO 8601 enrollment end date (optional) */
  enrollmentEnd: z.string().datetime().optional(),

  /** Course language code - uses shared languageSchema (19 languages) */
  language: languageSchema.default('ru'),

  /** Course chapters (sections) - minimum 1 required */
  chapters: z.array(ChapterInputSchema).min(1),
});

/** Course Input type (inferred from schema) */
export type CourseInput = z.infer<typeof CourseInputSchema>;
