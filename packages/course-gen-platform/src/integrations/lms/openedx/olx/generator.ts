/**
 * OLX Generator
 * @module integrations/lms/openedx/olx/generator
 *
 * Converts LMS-agnostic CourseInput to Open edX OLX structure.
 * Generates all XML files, HTML content, and policy files needed for OLX package.
 */

import type {
  CourseInput,
  OlxCourse,
  OlxChapter,
  OlxSequential,
  OlxVertical,
  OlxComponent,
  OlxCourseMeta,
} from '@megacampus/shared-types/lms';
import { UrlNameRegistry } from './url-name-registry';
import type { OLXStructure } from './types';
import { buildCourseKey } from './types';
import { validateCourseInput, validateOLXStructure } from './validators';
import { OLXValidationError } from '@megacampus/shared-types/lms';
import {
  generateCourseXml,
  generateChapterXml,
  generateSequentialXml,
  generateVerticalXml,
  generateHtmlXml,
  generateHtmlContent,
  generatePolicyJson,
  generateGradingPolicyJson,
} from './templates';
import { lmsLogger } from '../../logger';

/**
 * OLX Generator Class
 *
 * Converts CourseInput (LMS-agnostic format) to OLXStructure (Open edX specific).
 * Uses UrlNameRegistry to generate unique ASCII identifiers from display names.
 *
 * @example
 * ```typescript
 * const generator = new OLXGenerator();
 *
 * const courseInput: CourseInput = {
 *   courseId: 'AI101',
 *   title: 'Основы ИИ',
 *   org: 'MegaCampus',
 *   run: 'self_paced',
 *   language: 'ru',
 *   chapters: [...]
 * };
 *
 * const olxStructure = generator.generate(courseInput);
 * // Returns complete OLX structure ready for packaging
 * ```
 */
export class OLXGenerator {
  private registry: UrlNameRegistry;

  /**
   * Create new OLX generator instance
   *
   * Initializes URL name registry for unique identifier tracking.
   */
  constructor() {
    this.registry = new UrlNameRegistry();
  }

  /**
   * Generate complete OLX structure from CourseInput
   *
   * Process:
   * 1. Validate input structure
   * 2. Build course metadata
   * 3. Convert chapters → sequentials → verticals → components
   * 4. Generate all XML files using templates
   * 5. Generate policy files
   * 6. Validate generated structure
   * 7. Return complete OLXStructure
   *
   * @param input - LMS-agnostic course input structure
   * @returns Complete OLX structure ready for packaging
   * @throws {OLXValidationError} If input validation fails
   * @throws {OLXValidationError} If generated structure validation fails
   *
   * @example
   * ```typescript
   * const generator = new OLXGenerator();
   * try {
   *   const olx = generator.generate(courseInput);
   *   console.log(`Generated OLX for course: ${olx.courseKey}`);
   * } catch (error) {
   *   if (error instanceof OLXValidationError) {
   *     console.error('Validation failed:', error.errors);
   *   }
   * }
   * ```
   */
  generate(input: CourseInput): OLXStructure {
    const startTime = Date.now();
    lmsLogger.info({ courseId: input.courseId }, 'Starting OLX generation');

    // Step 1: Validate input
    const validationResult = validateCourseInput(input);
    if (!validationResult.valid) {
      throw new OLXValidationError(
        'Course input validation failed',
        validationResult.errors.map((msg) => ({
          path: 'courseInput',
          message: msg,
          severity: 'error',
        }))
      );
    }

    // Step 2: Build course metadata
    const meta: OlxCourseMeta = {
      org: input.org,
      course: input.courseId,
      run: input.run,
      display_name: input.title,
      language: input.language,
      start: input.startDate,
      end: undefined, // Not provided in CourseInput
    };

    const courseKey = buildCourseKey(meta.org, meta.course, meta.run);

    // Step 3: Convert course structure to OLX
    const olxCourse = this.convertToOlxCourse(input, meta);

    // Step 4: Generate all files
    const structure = this.buildOLXStructure(olxCourse, meta, courseKey);

    // Step 5: Validate generated structure
    const structureValidation = validateOLXStructure(structure);
    if (!structureValidation.valid) {
      throw new OLXValidationError(
        'Generated OLX structure validation failed',
        structureValidation.errors.map((msg) => ({
          path: 'olxStructure',
          message: msg,
          severity: 'error',
        }))
      );
    }

    const duration = Date.now() - startTime;
    lmsLogger.info(
      {
        courseId: input.courseId,
        courseKey,
        duration,
        chapters: structure.chapters.size,
        sequentials: structure.sequentials.size,
        verticals: structure.verticals.size,
        htmlComponents: structure.htmlContent.size,
      },
      'OLX generation completed'
    );

    return structure;
  }

  /**
   * Convert CourseInput to OlxCourse structure
   *
   * Transforms the LMS-agnostic input format to Open edX OLX format.
   * Generates url_names for all elements using the registry.
   *
   * @param input - Course input structure
   * @param meta - Course metadata
   * @returns OLX course structure
   */
  private convertToOlxCourse(input: CourseInput, meta: OlxCourseMeta): OlxCourse {
    const olxChapters: OlxChapter[] = [];

    // Convert each chapter
    for (const chapterInput of input.chapters) {
      const chapterUrlName = this.registry.generate('chapter', chapterInput.title);

      const olxSequentials: OlxSequential[] = [];

      // Convert each section (sequential)
      for (const sectionInput of chapterInput.sections) {
        const sequentialUrlName = this.registry.generate('sequential', sectionInput.title);

        const olxVerticals: OlxVertical[] = [];

        // Convert each unit (vertical)
        for (const unitInput of sectionInput.units) {
          const verticalUrlName = this.registry.generate('vertical', unitInput.title);

          // Create HTML component for unit content
          const htmlUrlName = this.registry.generate('html', unitInput.title);

          const olxComponent: OlxComponent = {
            type: 'html',
            url_name: htmlUrlName,
            display_name: unitInput.title,
            content: unitInput.content,
          };

          const olxVertical: OlxVertical = {
            url_name: verticalUrlName,
            display_name: unitInput.title,
            components: [olxComponent],
          };

          olxVerticals.push(olxVertical);
        }

        const olxSequential: OlxSequential = {
          url_name: sequentialUrlName,
          display_name: sectionInput.title,
          verticals: olxVerticals,
        };

        olxSequentials.push(olxSequential);
      }

      const olxChapter: OlxChapter = {
        url_name: chapterUrlName,
        display_name: chapterInput.title,
        sequentials: olxSequentials,
      };

      olxChapters.push(olxChapter);
    }

    return {
      meta,
      chapters: olxChapters,
    };
  }

  /**
   * Build complete OLX structure with all files
   *
   * Generates all XML and HTML files from OlxCourse structure.
   * Uses template generators for consistent formatting.
   *
   * @param olxCourse - OLX course structure
   * @param meta - Course metadata
   * @param courseKey - Course key (course-v1:Org+Course+Run)
   * @returns Complete OLX structure with all files
   */
  private buildOLXStructure(
    olxCourse: OlxCourse,
    meta: OlxCourseMeta,
    courseKey: string
  ): OLXStructure {
    // Initialize maps for file storage
    const chapters = new Map<string, string>();
    const sequentials = new Map<string, string>();
    const verticals = new Map<string, string>();
    const htmlRefs = new Map<string, string>();
    const htmlContent = new Map<string, string>();

    // Generate chapter references for course.xml
    const chapterRefs = olxCourse.chapters.map((chapter) => ({
      url_name: chapter.url_name,
    }));

    // Generate course.xml
    const courseXml = generateCourseXml(meta, chapterRefs);

    // Generate chapter files
    for (const chapter of olxCourse.chapters) {
      chapters.set(chapter.url_name, generateChapterXml(chapter));

      // Generate sequential files
      for (const sequential of chapter.sequentials) {
        sequentials.set(sequential.url_name, generateSequentialXml(sequential));

        // Generate vertical files
        for (const vertical of sequential.verticals) {
          verticals.set(vertical.url_name, generateVerticalXml(vertical));

          // Generate HTML component files
          for (const component of vertical.components) {
            if (component.type === 'html') {
              htmlRefs.set(
                component.url_name,
                generateHtmlXml(component.url_name, component.display_name)
              );
              htmlContent.set(component.url_name, generateHtmlContent(component.content));
            }
          }
        }
      }
    }

    // Generate policy files
    const policyJson = generatePolicyJson(meta);
    const gradingPolicyJson = generateGradingPolicyJson();

    return {
      courseXml,
      courseKey: courseKey as `course-v1:${string}+${string}+${string}`,
      chapters,
      sequentials,
      verticals,
      htmlRefs,
      htmlContent,
      policies: {
        policyJson,
        gradingPolicyJson,
      },
      meta,
    };
  }

  /**
   * Reset registry for new generation
   *
   * Clears all registered url_names to prepare for generating a new course.
   * Call this between course generations to ensure fresh identifiers.
   *
   * @example
   * ```typescript
   * const generator = new OLXGenerator();
   * generator.generate(course1);
   * generator.reset();
   * generator.generate(course2); // Fresh url_names
   * ```
   */
  reset(): void {
    this.registry.clear();
    lmsLogger.debug('OLX generator registry reset');
  }
}
