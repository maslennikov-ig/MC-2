/**
 * Course Mapper - MegaCampus to LMS CourseInput
 * @module integrations/lms/course-mapper
 *
 * Maps MegaCampus course entities from database to CourseInput format
 * for LMS publishing. Handles:
 * - Database course → CourseInput transformation
 * - Organization metadata extraction
 * - Course structure mapping (sections → chapters, lessons → sections)
 * - ID transliteration (Cyrillic/Unicode → ASCII)
 *
 * @example
 * ```typescript
 * const courseInput = await mapCourseToInput(courseId, supabase);
 * const result = await adapter.publishCourse(courseInput);
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CourseInput } from '@megacampus/shared-types/lms';
import type { Database, Language } from '@megacampus/shared-types';
import { SUPPORTED_LANGUAGES } from '@megacampus/shared-types';
import { transliterate } from './openedx/utils/transliterate';
import { lmsLogger } from './logger';
import { z } from 'zod';

/**
 * Zod schema for CourseStructure JSONB validation
 * Validates the course_structure field from database
 */
const LessonSchema = z.object({
  lesson_id: z.string(),
  order_index: z.number(),
  title: z.string(),
  content: z.string().optional(),
});

const SectionSchema = z.object({
  section_id: z.string(),
  order_index: z.number(),
  title: z.string(),
  lessons: z.array(LessonSchema),
});

const CourseStructureSchema = z.object({
  sections: z.array(SectionSchema),
});

/**
 * Validate and convert database language value to Language type
 * Falls back to 'ru' if invalid or null
 */
function validateLanguage(lang: string | null): Language {
  if (!lang) return 'ru';
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
    return lang as Language;
  }
  lmsLogger.warn({ lang }, 'Unknown language, falling back to ru');
  return 'ru';
}

/**
 * File extensions treated as media when they appear behind an `<a href>`.
 *
 * `<img>`, `<video>` and `<source>` always point at a resource, so their `src`
 * needs no extension check. A link, by contrast, is usually navigation, and only
 * a link to a file belongs in the asset list.
 */
const MEDIA_FILE_EXTENSIONS = new Set([
  // images
  'apng',
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
  // video
  'avi',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'ogv',
  'webm',
  // audio
  'aac',
  'flac',
  'm4a',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  // documents and bundles shipped alongside a lesson
  'csv',
  'doc',
  'docx',
  'epub',
  'odp',
  'ods',
  'odt',
  'pdf',
  'ppt',
  'pptx',
  'rtf',
  'xls',
  'xlsx',
  'zip',
]);

/**
 * Decode the handful of HTML entities that legitimately appear inside a URL
 * attribute. `&amp;` is by far the common one, since a query string written as
 * `?a=1&b=2` must be escaped in HTML.
 *
 * `&amp;` is decoded last so that `&amp;quot;` does not collapse into a quote.
 */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&(?:quot|#34|#x22);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&(?:lt|#60|#x3c);/gi, '<')
    .replace(/&(?:gt|#62|#x3e);/gi, '>')
    .replace(/&(?:amp|#38|#x26);/gi, '&');
}

/**
 * Read a single attribute out of a raw tag body.
 *
 * The leading `(?:^|\s)` boundary is what keeps `srcset` and `data-src` from
 * being mistaken for `src`.
 */
function readAttribute(attributes: string, name: 'src' | 'href'): string | null {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'\`=<>]+))`,
    'i'
  );
  const match = pattern.exec(attributes);
  if (!match) {
    return null;
  }
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/**
 * Return the URL unchanged if it is an absolute http(s) URL, otherwise null.
 *
 * The filter is not cosmetic. `UnitInputSchema.assets` is
 * `z.array(z.string().url())`, so a relative path such as `/static/logo.png`
 * would not survive contract validation, and `new URL()` also accepts `data:`
 * and `mailto:` which have no business in a static asset list. Relative and
 * inline references stay where they are, inside the lesson HTML.
 */
function toAbsoluteHttpUrl(raw: string): string | null {
  const value = decodeHtmlEntities(raw).trim();
  if (!value) {
    return null;
  }
  try {
    const protocol = new URL(value).protocol;
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** True when the URL path ends in a recognised media file extension. */
function hasMediaExtension(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0) {
    return false;
  }
  return MEDIA_FILE_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase());
}

/**
 * Extract static asset URLs referenced by a lesson's HTML content.
 *
 * Scans `<img src>`, `<video src>`, `<source src>` and `<a href>` (media files
 * only), decodes HTML entities, keeps absolute http(s) URLs, and deduplicates
 * while preserving document order.
 *
 * @param html - Lesson HTML content (may be null or empty)
 * @returns Deduplicated asset URLs in the order they appear
 *
 * @example
 * ```typescript
 * extractAssetUrls('<img src="https://cdn.example.com/a.png">');
 * // ['https://cdn.example.com/a.png']
 * ```
 */
export function extractAssetUrls(html: string | null | undefined): string[] {
  if (!html) {
    return [];
  }

  const assets: string[] = [];
  const seen = new Set<string>();
  const tagPattern = /<(img|video|source|a)\b([^>]*)>/gi;

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    const raw = readAttribute(match[2], tagName === 'a' ? 'href' : 'src');
    if (raw === null) {
      continue;
    }

    const url = toAbsoluteHttpUrl(raw);
    if (!url) {
      continue;
    }

    if (tagName === 'a' && !hasMediaExtension(url)) {
      continue;
    }

    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    assets.push(url);
  }

  return assets;
}

/**
 * Database course row with joined organization
 */
type CourseWithOrg = Database['public']['Tables']['courses']['Row'] & {
  organization: Database['public']['Tables']['organizations']['Row'] | null;
};

/**
 * Generate ASCII-safe identifier from title
 *
 * Converts Unicode title to ASCII identifier suitable for use as
 * Open edX course ID or url_name. Handles:
 * - Transliteration (Cyrillic → Latin, etc.)
 * - Whitespace → underscores
 * - Special characters removal
 * - Lowercase normalization
 *
 * @param title - UTF-8 title (may contain Cyrillic, CJK, etc.)
 * @param prefix - Optional prefix for uniqueness
 * @returns ASCII alphanumeric identifier (a-z0-9_-)
 *
 * @example
 * ```typescript
 * generateId("Введение в программирование")
 * // Returns: "vvedenie_v_programmirovanie"
 *
 * generateId("AI 基础", "lesson")
 * // Returns: "lesson_ai_ji_chu"
 * ```
 */
function generateId(title: string, prefix?: string): string {
  // Step 1: Transliterate Unicode → ASCII
  const ascii = transliterate(title);

  // Step 2: Normalize to lowercase
  let normalized = ascii.toLowerCase();

  // Step 3: Replace whitespace with underscores
  normalized = normalized.replace(/\s+/g, '_');

  // Step 4: Remove non-alphanumeric characters (keep underscores and hyphens)
  normalized = normalized.replace(/[^a-z0-9_-]/g, '');

  // Step 5: Remove leading/trailing underscores
  normalized = normalized.replace(/^_+|_+$/g, '');

  // Step 6: Collapse multiple underscores
  normalized = normalized.replace(/_+/g, '_');

  // Step 7: Add prefix if provided
  if (prefix) {
    normalized = `${prefix}_${normalized}`;
  }

  // Step 8: Ensure non-empty (fallback to 'course' if empty)
  return normalized || 'course';
}

/**
 * Map database course to CourseInput for LMS publishing
 *
 * Transforms MegaCampus course structure from database into the
 * LMS-agnostic CourseInput format. This function:
 * 1. Fetches course with organization metadata
 * 2. Extracts course_structure from JSONB field
 * 3. Maps sections → chapters (top-level course divisions)
 * 4. Maps lessons → sections (subsections within chapters)
 * 5. Maps lesson content → units (individual content blocks)
 * 6. Generates ASCII IDs via transliteration
 *
 * Mapping structure:
 * - DB Section → CourseInput Chapter
 * - DB Lesson → CourseInput Section
 * - DB Lesson Content → CourseInput Unit
 *
 * @param courseId - MegaCampus course UUID
 * @param supabase - Supabase admin client
 * @returns CourseInput ready for LMS publishing
 * @throws {Error} If course not found or missing required fields
 *
 * @example
 * ```typescript
 * const courseInput = await mapCourseToInput(
 *   '123e4567-e89b-12d3-a456-426614174000',
 *   supabase
 * );
 *
 * // Returns:
 * // {
 * //   courseId: 'osnovy_ii',
 * //   title: 'Основы ИИ',
 * //   org: 'MegaCampus',
 * //   run: 'self_paced',
 * //   language: 'ru',
 * //   chapters: [
 * //     {
 * //       id: 'vvedenie',
 * //       title: 'Введение',
 * //       sections: [
 * //         {
 * //           id: 'chto_takoe_ii',
 * //           title: 'Что такое ИИ?',
 * //           units: [...]
 * //         }
 * //       ]
 * //     }
 * //   ]
 * // }
 * ```
 */
export async function mapCourseToInput(
  courseId: string,
  supabase: SupabaseClient<Database>
): Promise<CourseInput> {
  lmsLogger.info({ courseId }, 'Mapping course to CourseInput');

  // Step 1: Fetch course with organization metadata
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*, organization:organizations(*)')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    lmsLogger.error({ courseId, error: courseError }, 'Course not found');
    throw new Error(`Course not found: ${courseId}`);
  }

  // Validate course structure - no cast needed, course is correctly typed
  const courseWithOrg = course as CourseWithOrg;

  // Step 2: Extract and validate course structure from JSONB field
  const courseStructureResult = CourseStructureSchema.safeParse(courseWithOrg.course_structure);

  if (!courseStructureResult.success) {
    lmsLogger.error(
      {
        courseId,
        error: courseStructureResult.error,
        rawStructure: courseWithOrg.course_structure,
      },
      'Invalid course structure format'
    );
    throw new Error(
      `Course has invalid structure format: ${courseId}. ` +
        `Errors: ${JSON.stringify(courseStructureResult.error.errors)}`
    );
  }

  const courseStructure = courseStructureResult.data;

  if (!courseStructure.sections || courseStructure.sections.length === 0) {
    lmsLogger.warn({ courseId }, 'Course has no sections in course_structure');
    throw new Error(`Course has no content structure: ${courseId}`);
  }

  // Step 3: Extract organization name (default to 'MegaCampus')
  const orgName = courseWithOrg.organization?.name || 'MegaCampus';
  const orgId = generateId(orgName);

  // Step 4: Generate course identifier from title
  const courseIdAscii = generateId(courseWithOrg.title);

  lmsLogger.debug(
    {
      courseId,
      courseIdAscii,
      orgName,
      orgId,
      sectionCount: courseStructure.sections.length,
    },
    'Course metadata extracted'
  );

  // Step 5: Map sections → chapters
  const chapters = courseStructure.sections
    .sort((a, b) => a.order_index - b.order_index)
    .map(section => {
      // Generate chapter ID from section title
      const chapterId = generateId(section.title, `ch${section.order_index}`);

      // Map lessons → sections (within this chapter)
      const sections = section.lessons
        .sort((a, b) => a.order_index - b.order_index)
        .map(lesson => {
          // Generate section ID from lesson title
          const sectionId = generateId(
            lesson.title,
            `sec${section.order_index}_${lesson.order_index}`
          );

          // Map lesson content → unit
          // Each lesson becomes a single unit within a section
          const unit = {
            id: generateId(lesson.title, `unit${section.order_index}_${lesson.order_index}`),
            title: lesson.title,
            content: lesson.content || '<p>Content pending generation</p>',
            assets: extractAssetUrls(lesson.content),
          };

          return {
            id: sectionId,
            title: lesson.title,
            units: [unit],
          };
        });

      return {
        id: chapterId,
        title: section.title,
        sections,
      };
    });

  // Step 6: Build CourseInput
  const courseInput: CourseInput = {
    courseId: courseIdAscii,
    title: courseWithOrg.title,
    description: courseWithOrg.course_description || undefined,
    org: orgId,
    run: 'self_paced', // Default run identifier
    language: validateLanguage(courseWithOrg.language),
    chapters,
  };

  lmsLogger.info(
    {
      courseId,
      courseIdAscii,
      chapterCount: chapters.length,
      totalSections: chapters.reduce((sum, ch) => sum + ch.sections.length, 0),
      totalUnits: chapters.reduce(
        (sum, ch) => sum + ch.sections.reduce((s, sec) => s + sec.units.length, 0),
        0
      ),
      totalAssets: chapters.reduce(
        (sum, ch) =>
          sum +
          ch.sections.reduce(
            (s, sec) => s + sec.units.reduce((u, unit) => u + unit.assets.length, 0),
            0
          ),
        0
      ),
    },
    'Course mapped to CourseInput'
  );

  return courseInput;
}
