/**
 * Course Nodes Type Definitions
 *
 * Types for the flat course_nodes table used in Phase 4 migration
 * from nested JSONB course_structure to normalized rows.
 *
 * @module course-nodes/types
 */

import type { Database } from '@megacampus/shared-types';

// ---------------------------------------------------------------------------
// Database row types (derived from generated Supabase types)
// ---------------------------------------------------------------------------

export type CourseNodeRow = Database['public']['Tables']['course_nodes']['Row'];
export type CourseNodeInsert = Database['public']['Tables']['course_nodes']['Insert'];
export type CourseNodeUpdate = Database['public']['Tables']['course_nodes']['Update'];

// ---------------------------------------------------------------------------
// Node type discriminator
// ---------------------------------------------------------------------------

export type NodeType = 'section' | 'lesson';

// ---------------------------------------------------------------------------
// Data JSONB payloads (typed overlays for the generic Json column)
// ---------------------------------------------------------------------------

/** Data JSONB for section nodes */
export interface SectionNodeData {
  section_number?: number;
  section_description: string;
  learning_objectives: string[];
  estimated_duration_minutes: number;
}

/** Data JSONB for lesson nodes */
export interface LessonNodeData {
  lesson_number?: number;
  lesson_objectives: string[];
  key_topics: string[];
  estimated_duration_minutes: number;
  difficulty_level?: string;
}
