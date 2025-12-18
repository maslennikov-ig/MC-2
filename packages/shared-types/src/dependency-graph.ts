import { z } from 'zod';

// ============================================================================
// Dependency Graph Types
// ============================================================================

export const dependencyNodeTypeSchema = z.enum(['course', 'section', 'lesson', 'objective']);
export type DependencyNodeType = z.infer<typeof dependencyNodeTypeSchema>;

export interface DependencyNode {
  id: string;          // e.g., "section.0.lesson.2"
  type: DependencyNodeType;
  label: string;       // Human-readable label
  parentId: string | null;
  learningObjectiveIds?: string[];
  lastModified?: string; // ISO timestamp
}

export const dependencyEdgeTypeSchema = z.enum(['PARENT_OF', 'ALIGNS_TO', 'ASSESSES', 'PREREQUISITE_FOR']);
export type DependencyEdgeType = z.infer<typeof dependencyEdgeTypeSchema>;

export interface DependencyEdge {
  from: string;
  to: string;
  type: DependencyEdgeType;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

// ============================================================================
// Stale Status Types
// ============================================================================

export const staleStatusSchema = z.enum(['fresh', 'potentially_stale', 'definitely_stale']);
export type StaleStatus = z.infer<typeof staleStatusSchema>;

export interface StaleIndicator {
  nodeId: string;
  status: StaleStatus;
  reason: string;
  changedParentId: string;
  changedParentLabel: string;
  changedAt: string; // ISO timestamp
  isLearningObjectiveChange: boolean; // Red if true, yellow if false
}

// ============================================================================
// Impact Analysis Types
// ============================================================================

export interface ImpactAnalysis {
  targetNodeId: string;
  targetNodeLabel: string;
  affectedNodes: {
    nodeId: string;
    label: string;
    type: DependencyNodeType;
    relationship: DependencyEdgeType;
  }[];
  totalAffected: number;
  warningLevel: 'low' | 'medium' | 'high';
}

export const cascadeUpdateModeSchema = z.enum(['mark_stale', 'auto_regenerate', 'review_each']);
export type CascadeUpdateMode = z.infer<typeof cascadeUpdateModeSchema>;
