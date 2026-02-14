/**
 * Feature flags for Phase 4 course_nodes migration.
 *
 * COURSE_NODES_DUAL_WRITE_ENABLED: Write to both course_structure JSON and course_nodes table.
 * COURSE_NODES_READ_ENABLED: Read from course_nodes instead of course_structure JSON.
 *
 * Rollout order:
 * 1. Enable dual-write → verify parity
 * 2. Enable read → verify correctness
 * 3. (Future) Remove JSON writes
 */

export function isDualWriteEnabled(): boolean {
  return process.env.COURSE_NODES_DUAL_WRITE_ENABLED === 'true';
}

export function isReadFromNodesEnabled(): boolean {
  return process.env.COURSE_NODES_READ_ENABLED === 'true';
}

/**
 * When true, reject course_structure writes that lack stable IDs (plan:433).
 * Enable after backfill is complete and all structures have sec_/lsn_ IDs.
 */
export function isStableIdsRequired(): boolean {
  return process.env.COURSE_STABLE_IDS_REQUIRED === 'true';
}

/**
 * Throws if COURSE_STABLE_IDS_REQUIRED=true and structure lacks stable IDs.
 * Call this BEFORE writing course_structure to DB (not inside writeCourseNodes
 * which is caught as non-fatal).
 */
export function assertStableIds(structure: {
  sections?: Array<{ id?: string; lessons?: Array<{ id?: string }> }>;
}): void {
  if (!isStableIdsRequired()) return;

  const hasAllIds = structure.sections?.every(
    s => s.id?.startsWith('sec_') && s.lessons?.every(l => l.id?.startsWith('lsn_'))
  );
  if (!hasAllIds) {
    throw new Error(
      'course_structure write rejected: missing stable IDs (COURSE_STABLE_IDS_REQUIRED=true)'
    );
  }
}
