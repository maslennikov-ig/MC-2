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
