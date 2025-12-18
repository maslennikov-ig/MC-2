/**
 * OLX Structure Types
 * @module integrations/lms/openedx/olx/types
 *
 * Type definitions for in-memory OLX structure representation.
 * Represents the complete OLX package with all files ready for tar.gz packaging.
 */

import type { OlxCourseMeta } from '@megacampus/shared-types/lms';

/**
 * Course key type (course-v1:Org+Course+Run)
 *
 * Open edX uses this format as the unique identifier for course runs.
 * The prefix "course-v1:" indicates OLX version 1 format.
 *
 * @example
 * ```typescript
 * const key: CourseKey = 'course-v1:MegaCampus+AI101+self_paced';
 * ```
 */
export type CourseKey = `course-v1:${string}+${string}+${string}`;

/**
 * Build course key from metadata components
 *
 * Constructs the standard Open edX course key format.
 * All components must be ASCII alphanumeric.
 *
 * @param org - Organization identifier (ASCII)
 * @param course - Course identifier (ASCII)
 * @param run - Run identifier (ASCII)
 * @returns Formatted course key
 *
 * @example
 * ```typescript
 * const key = buildCourseKey('MegaCampus', 'AI101', 'self_paced');
 * // Returns: 'course-v1:MegaCampus+AI101+self_paced'
 * ```
 */
export function buildCourseKey(org: string, course: string, run: string): CourseKey {
  return `course-v1:${org}+${course}+${run}`;
}

/**
 * Complete OLX structure representation
 *
 * Represents all files that will be packaged into the OLX tar.gz archive.
 * This structure is in-memory only and contains both XML metadata files
 * and HTML content files.
 *
 * Directory structure in tar.gz:
 * ```
 * course/
 *   course.xml
 *   chapter/
 *     {url_name}.xml
 *   sequential/
 *     {url_name}.xml
 *   vertical/
 *     {url_name}.xml
 *   html/
 *     {url_name}.xml (reference files)
 *     {url_name}.html (content files)
 *   policies/
 *     {run}/
 *       policy.json
 *       grading_policy.json
 * ```
 */
export interface OLXStructure {
  /**
   * Root course.xml file content
   *
   * Contains course metadata and chapter references.
   * This is the entry point for Open edX import.
   */
  courseXml: string;

  /**
   * Course key (course-v1:Org+Course+Run)
   *
   * Unique identifier for this course run.
   * Used by Open edX platform for routing and identification.
   */
  courseKey: CourseKey;

  /**
   * Chapter XML files
   *
   * Map of url_name → XML content for each chapter.
   * Written to chapter/{url_name}.xml in the package.
   */
  chapters: Map<string, string>;

  /**
   * Sequential XML files
   *
   * Map of url_name → XML content for each sequential (subsection).
   * Written to sequential/{url_name}.xml in the package.
   */
  sequentials: Map<string, string>;

  /**
   * Vertical XML files
   *
   * Map of url_name → XML content for each vertical (unit).
   * Written to vertical/{url_name}.xml in the package.
   */
  verticals: Map<string, string>;

  /**
   * HTML component reference files
   *
   * Map of url_name → XML reference content for each HTML component.
   * Written to html/{url_name}.xml in the package.
   * These are metadata files that point to the actual HTML content.
   */
  htmlRefs: Map<string, string>;

  /**
   * HTML content files
   *
   * Map of url_name → HTML content for each component.
   * Written to html/{url_name}.html in the package.
   * These contain the actual lesson content.
   */
  htmlContent: Map<string, string>;

  /**
   * Policy files
   *
   * Course configuration and grading policy.
   * Written to policies/{run}/ directory in the package.
   */
  policies: {
    /** policy.json content (course settings, dates, language) */
    policyJson: string;
    /** grading_policy.json content (grading scheme, cutoffs) */
    gradingPolicyJson: string;
  };

  /**
   * Course metadata
   *
   * Used for generating course.xml and policy files.
   * Contains org, course, run, display_name, language, dates.
   */
  meta: OlxCourseMeta;
}
