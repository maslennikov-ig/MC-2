import { Node, Edge } from '@xyflow/react'
import {
  StageNode,
  MergeNode,
  EndNode,
  DocumentNode,
  LessonNode,
  ModuleNode,
  Stage2GroupNode,
  GraphEdge,
} from '@megacampus/shared-types'
import type { ClarifyingNodeData } from './nodes/ClarifyingNode'

/**
 * Type definitions for React Flow nodes and edges in the generation graph.
 *
 * These types bridge the shared-types definitions with React Flow's node/edge format.
 * Node data excludes React Flow system fields (id, position) which are added by React Flow.
 */

// Define Data types for React Flow nodes (excluding system fields like id, position)

/** Stage node data (main pipeline stages 1-6) */
export type StageNodeData = Omit<StageNode, 'id' | 'type'>

/** Merge node data (convergence point after parallel processing) */
export type MergeNodeData = Omit<MergeNode, 'id' | 'type'>

/** End node data (pipeline completion marker) */
export type EndNodeData = Omit<EndNode, 'id' | 'type'>

/** Document node data (individual uploaded documents in stage 2) */
export type DocumentNodeData = Omit<DocumentNode, 'id' | 'type'>

/** Lesson node data (lessons within modules in stage 6) */
export type LessonNodeData = Omit<LessonNode, 'id' | 'type'>

/** Module node data (module containers in stage 6) */
export type ModuleNodeData = Omit<ModuleNode, 'id' | 'type'>

/** Stage 2 group node data (document container for stage 2) */
export type Stage2GroupNodeData = Omit<Stage2GroupNode, 'id' | 'type'>

// React Flow Node definitions

/** React Flow stage node type */
export type RFStageNode = Node<StageNodeData, 'stage'>

/** React Flow merge node type */
export type RFMergeNode = Node<MergeNodeData, 'merge'>

/** React Flow end node type */
export type RFEndNode = Node<EndNodeData, 'end'>

/** React Flow document node type */
export type RFDocumentNode = Node<DocumentNodeData, 'document'>

/** React Flow lesson node type */
export type RFLessonNode = Node<LessonNodeData, 'lesson'>

/** React Flow module node type */
export type RFModuleNode = Node<ModuleNodeData, 'module'>

/** React Flow stage 2 group node type */
export type RFStage2GroupNode = Node<Stage2GroupNodeData, 'stage2group'>

/** React Flow clarifying node type (Phase 0.5 questions) - exported separately for component use */
export type RFClarifyingNode = Node<ClarifyingNodeData, 'clarifying'>

/**
 * Union type of all possible graph nodes.
 * Used throughout the graph components for type-safe node handling.
 *
 * Note: ClarifyingNode is handled separately in some contexts due to its
 * different data structure. Use AppNodeWithClarifying when clarifying support is needed.
 */
export type AppNode =
  | RFStageNode
  | RFMergeNode
  | RFEndNode
  | RFDocumentNode
  | RFLessonNode
  | RFModuleNode
  | RFStage2GroupNode

/** Extended AppNode type that includes ClarifyingNode */
export type AppNodeWithClarifying = AppNode | RFClarifyingNode

// Edge Data

/** Graph edge data (excludes React Flow system fields) */
export type GraphEdgeData = Omit<
  GraphEdge,
  'id' | 'source' | 'target' | 'sourceHandle' | 'targetHandle'
>

/** React Flow graph edge type */
export type RFGraphEdge = Edge<GraphEdgeData>

/**
 * Type for all graph edges.
 * Currently just GraphEdge, but defined as separate type for future extensibility.
 */
export type AppEdge = RFGraphEdge

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Union type of all possible node data (excluding clarifying which is self-contained) */
export type AppNodeData =
  | StageNodeData
  | MergeNodeData
  | EndNodeData
  | DocumentNodeData
  | LessonNodeData
  | ModuleNodeData
  | Stage2GroupNodeData

/**
 * Type guard to check if node data is from a document node.
 * DocumentNodeData has `documentId` and `stageNumber: 2`.
 */
export function isDocumentNodeData(data: AppNodeData | undefined): data is DocumentNodeData {
  if (!data) return false
  return (
    'documentId' in data &&
    typeof data.documentId === 'string' &&
    'stageNumber' in data &&
    data.stageNumber === 2
  )
}

/**
 * Type guard to check if node data is from a stage node with phases.
 * StageNodeData has optional `phases` array for stages 4 and 5.
 */
export function isStageNodeDataWithPhases(
  data: AppNodeData | undefined
): data is StageNodeData & { phases: NonNullable<StageNodeData['phases']> } {
  if (!data) return false
  return (
    'stageNumber' in data &&
    'phases' in data &&
    Array.isArray(data.phases) &&
    data.phases.length > 0
  )
}

/**
 * Safely extract documentId from node data.
 * Returns undefined if data is not DocumentNodeData.
 */
export function getDocumentId(data: AppNodeData | undefined): string | undefined {
  if (isDocumentNodeData(data)) {
    return data.documentId
  }
  return undefined
}

/**
 * Safely extract phases from stage node data.
 * Returns empty array if data has no phases.
 */
export function getStagePhases(data: AppNodeData | undefined): StageNodeData['phases'] {
  if (data && 'phases' in data && Array.isArray(data.phases)) {
    return data.phases
  }
  return []
}

// =============================================================================
// STAGE 1 DATA VALIDATION
// =============================================================================

/**
 * Stage 1 Input Data required fields.
 * These fields must be present for proper workflow UI display.
 */
export interface Stage1InputDataRequired {
  /** Course topic/title */
  topic: string
  /** Course description with requirements */
  course_description: string
  /** Language code (e.g., 'ru', 'en') */
  language: string
  /** Content style (e.g., 'professional', 'conversational') */
  style: string
}

/**
 * Stage 1 Output Data required fields.
 * The 'status' field is critical - without it, UI shows "initializationError".
 */
export interface Stage1OutputDataRequired {
  /** Course UUID */
  courseId: string
  /** Initialization status - MUST be 'ready' for successful initialization */
  status: 'ready' | 'error'
}

/**
 * Runtime validation for Stage 1 output data.
 * Checks that all required fields are present and have correct types.
 *
 * @param data - Unknown data to validate
 * @returns true if data has all required Stage 1 output fields
 *
 * @example
 * ```typescript
 * const outputData = { courseId: '123', status: 'ready' }
 * if (validateStage1OutputData(outputData)) {
 *   // TypeScript now knows outputData has courseId and status fields
 *   console.log(outputData.status) // ✅ Type-safe
 * }
 * ```
 */
export function validateStage1OutputData(data: unknown): data is Stage1OutputDataRequired {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.courseId === 'string' &&
    obj.courseId.length > 0 &&
    (obj.status === 'ready' || obj.status === 'error')
  )
}

/**
 * Runtime validation for Stage 1 input data.
 * Checks that all required fields are present and have correct types.
 *
 * @param data - Unknown data to validate
 * @returns true if data has all required Stage 1 input fields
 */
export function validateStage1InputData(data: unknown): data is Stage1InputDataRequired {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.topic === 'string' &&
    obj.topic.length > 0 &&
    typeof obj.course_description === 'string' &&
    typeof obj.language === 'string' &&
    obj.language.length > 0 &&
    typeof obj.style === 'string' &&
    obj.style.length > 0
  )
}
