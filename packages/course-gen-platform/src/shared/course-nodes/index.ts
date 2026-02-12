/**
 * Course Nodes module — Phase 4 flat relational migration.
 *
 * Provides utilities for converting between nested CourseStructure JSON
 * and flat course_nodes table rows, with feature flags for gradual rollout.
 */

export { isDualWriteEnabled, isReadFromNodesEnabled } from './feature-flags.js';
export { generateInitialOrderKeys, generateOrderKeyBetween } from './order-keys.js';
export { nestedJsonToCourseNodes, courseNodesToNestedJson } from './converters.js';
export { checkStructureParity } from './parity-checker.js';
export { writeCourseNodes } from './writer.js';
export { resolveStructure, hasResolvedStructure } from './structure-resolver.js';
export type { CourseMetaFields } from './converters.js';
export type { ParityDifference, ParityResult } from './parity-checker.js';
export type {
  CourseNodeRow,
  CourseNodeInsert,
  CourseNodeUpdate,
  NodeType,
  SectionNodeData,
  LessonNodeData,
} from './types.js';
