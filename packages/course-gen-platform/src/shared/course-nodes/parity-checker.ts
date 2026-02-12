/**
 * Parity Checker for Phase 4 course_nodes migration.
 *
 * Compares an original CourseStructure JSON with one reconstructed from
 * course_nodes rows (via courseNodesToNestedJson). Used to verify that
 * dual-write produces structurally equivalent data.
 *
 * Only checks key structural fields that matter for correctness —
 * computed/transient fields (section_number, lesson_number,
 * estimated_duration_hours) are intentionally skipped because the
 * reconstructor recalculates them deterministically.
 */

import type { CourseStructure } from '@megacampus/shared-types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParityDifference {
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface ParityResult {
  isEqual: boolean;
  differences: ParityDifference[];
  sectionCount: { original: number; reconstructed: number };
  lessonCount: { original: number; reconstructed: number };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compare original CourseStructure with one reconstructed from course_nodes.
 * Checks structural equality on key fields, ignoring computed/transient fields.
 */
export function checkStructureParity(
  original: CourseStructure,
  reconstructed: CourseStructure
): ParityResult {
  const differences: ParityDifference[] = [];

  const origSections = original.sections ?? [];
  const reconSections = reconstructed.sections ?? [];

  // Compare section count
  if (origSections.length !== reconSections.length) {
    differences.push({
      path: 'sections.length',
      expected: origSections.length,
      actual: reconSections.length,
    });
  }

  // Compare sections pairwise (up to the shorter array)
  const minSections = Math.min(origSections.length, reconSections.length);
  for (let si = 0; si < minSections; si++) {
    const origSec = origSections[si];
    const reconSec = reconSections[si];
    const prefix = `sections[${si}]`;

    compareField(differences, `${prefix}.id`, origSec.id, reconSec.id);
    compareField(
      differences,
      `${prefix}.section_title`,
      origSec.section_title,
      reconSec.section_title
    );
    compareField(
      differences,
      `${prefix}.section_description`,
      origSec.section_description,
      reconSec.section_description
    );
    compareArrayField(
      differences,
      `${prefix}.learning_objectives`,
      origSec.learning_objectives,
      reconSec.learning_objectives
    );

    // Compare lessons within each section
    const origLessons = origSec.lessons ?? [];
    const reconLessons = reconSec.lessons ?? [];

    if (origLessons.length !== reconLessons.length) {
      differences.push({
        path: `${prefix}.lessons.length`,
        expected: origLessons.length,
        actual: reconLessons.length,
      });
    }

    const minLessons = Math.min(origLessons.length, reconLessons.length);
    for (let li = 0; li < minLessons; li++) {
      const origLsn = origLessons[li];
      const reconLsn = reconLessons[li];
      const lPrefix = `${prefix}.lessons[${li}]`;

      compareField(differences, `${lPrefix}.id`, origLsn.id, reconLsn.id);
      compareField(
        differences,
        `${lPrefix}.lesson_title`,
        origLsn.lesson_title,
        reconLsn.lesson_title
      );
      compareField(
        differences,
        `${lPrefix}.estimated_duration_minutes`,
        origLsn.estimated_duration_minutes,
        reconLsn.estimated_duration_minutes
      );
      compareArrayField(
        differences,
        `${lPrefix}.lesson_objectives`,
        origLsn.lesson_objectives,
        reconLsn.lesson_objectives
      );
      compareArrayField(
        differences,
        `${lPrefix}.key_topics`,
        origLsn.key_topics,
        reconLsn.key_topics
      );
    }
  }

  // Aggregate lesson counts for summary
  const totalOrigLessons = origSections.reduce((sum, s) => sum + (s.lessons?.length ?? 0), 0);
  const totalReconLessons = reconSections.reduce((sum, s) => sum + (s.lessons?.length ?? 0), 0);

  return {
    isEqual: differences.length === 0,
    differences,
    sectionCount: { original: origSections.length, reconstructed: reconSections.length },
    lessonCount: { original: totalOrigLessons, reconstructed: totalReconLessons },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function compareField(
  diffs: ParityDifference[],
  path: string,
  expected: unknown,
  actual: unknown
): void {
  if (expected !== actual) {
    diffs.push({ path, expected, actual });
  }
}

function compareArrayField(
  diffs: ParityDifference[],
  path: string,
  expected: unknown[] | undefined,
  actual: unknown[] | undefined
): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    diffs.push({ path, expected, actual });
  }
}
