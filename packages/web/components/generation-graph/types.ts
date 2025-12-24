import { Node, Edge } from '@xyflow/react';
import {
  StageNode,
  MergeNode,
  EndNode,
  DocumentNode,
  LessonNode,
  ModuleNode,
  Stage2GroupNode,
  GraphEdge
} from '@megacampus/shared-types';

/**
 * Type definitions for React Flow nodes and edges in the generation graph.
 *
 * These types bridge the shared-types definitions with React Flow's node/edge format.
 * Node data excludes React Flow system fields (id, position) which are added by React Flow.
 */

// Define Data types for React Flow nodes (excluding system fields like id, position)

/** Stage node data (main pipeline stages 1-6) */
export type StageNodeData = Omit<StageNode, 'id' | 'type'>;

/** Merge node data (convergence point after parallel processing) */
export type MergeNodeData = Omit<MergeNode, 'id' | 'type'>;

/** End node data (pipeline completion marker) */
export type EndNodeData = Omit<EndNode, 'id' | 'type'>;

/** Document node data (individual uploaded documents in stage 2) */
export type DocumentNodeData = Omit<DocumentNode, 'id' | 'type'>;

/** Lesson node data (lessons within modules in stage 6) */
export type LessonNodeData = Omit<LessonNode, 'id' | 'type'>;

/** Module node data (module containers in stage 6) */
export type ModuleNodeData = Omit<ModuleNode, 'id' | 'type'>;

/** Stage 2 group node data (document container for stage 2) */
export type Stage2GroupNodeData = Omit<Stage2GroupNode, 'id' | 'type'>;

// React Flow Node definitions

/** React Flow stage node type */
export type RFStageNode = Node<StageNodeData, 'stage'>;

/** React Flow merge node type */
export type RFMergeNode = Node<MergeNodeData, 'merge'>;

/** React Flow end node type */
export type RFEndNode = Node<EndNodeData, 'end'>;

/** React Flow document node type */
export type RFDocumentNode = Node<DocumentNodeData, 'document'>;

/** React Flow lesson node type */
export type RFLessonNode = Node<LessonNodeData, 'lesson'>;

/** React Flow module node type */
export type RFModuleNode = Node<ModuleNodeData, 'module'>;

/** React Flow stage 2 group node type */
export type RFStage2GroupNode = Node<Stage2GroupNodeData, 'stage2group'>;

/**
 * Union type of all possible graph nodes.
 * Used throughout the graph components for type-safe node handling.
 */
export type AppNode = RFStageNode | RFMergeNode | RFEndNode | RFDocumentNode | RFLessonNode | RFModuleNode | RFStage2GroupNode;

// Edge Data

/** Graph edge data (excludes React Flow system fields) */
export type GraphEdgeData = Omit<GraphEdge, 'id' | 'source' | 'target' | 'sourceHandle' | 'targetHandle'>;

/** React Flow graph edge type */
export type RFGraphEdge = Edge<GraphEdgeData>;

/**
 * Type for all graph edges.
 * Currently just GraphEdge, but defined as separate type for future extensibility.
 */
export type AppEdge = RFGraphEdge;

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Union type of all possible node data */
export type AppNodeData =
  | StageNodeData
  | MergeNodeData
  | EndNodeData
  | DocumentNodeData
  | LessonNodeData
  | ModuleNodeData
  | Stage2GroupNodeData;

/**
 * Type guard to check if node data is from a document node.
 * DocumentNodeData has `documentId` and `stageNumber: 2`.
 */
export function isDocumentNodeData(data: AppNodeData | undefined): data is DocumentNodeData {
  if (!data) return false;
  return (
    'documentId' in data &&
    typeof (data as DocumentNodeData).documentId === 'string' &&
    'stageNumber' in data &&
    (data as DocumentNodeData).stageNumber === 2
  );
}

/**
 * Type guard to check if node data is from a stage node with phases.
 * StageNodeData has optional `phases` array for stages 4 and 5.
 */
export function isStageNodeDataWithPhases(
  data: AppNodeData | undefined
): data is StageNodeData & { phases: NonNullable<StageNodeData['phases']> } {
  if (!data) return false;
  return (
    'stageNumber' in data &&
    'phases' in data &&
    Array.isArray((data as StageNodeData).phases) &&
    (data as StageNodeData).phases!.length > 0
  );
}

/**
 * Safely extract documentId from node data.
 * Returns undefined if data is not DocumentNodeData.
 */
export function getDocumentId(data: AppNodeData | undefined): string | undefined {
  if (isDocumentNodeData(data)) {
    return data.documentId;
  }
  return undefined;
}

/**
 * Safely extract phases from stage node data.
 * Returns empty array if data has no phases.
 */
export function getStagePhases(data: AppNodeData | undefined): StageNodeData['phases'] {
  if (data && 'phases' in data && Array.isArray((data as StageNodeData).phases)) {
    return (data as StageNodeData).phases;
  }
  return [];
}