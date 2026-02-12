import { NodeTypes, EdgeTypes } from '@xyflow/react'
import StageNode from './nodes/StageNode'
import MergeNode from './nodes/MergeNode'
import EndNode from './nodes/EndNode'
import DocumentNode from './nodes/DocumentNode'
import LessonNode from './nodes/LessonNode'
import ModuleGroup from './nodes/ModuleGroup'
import Stage2Group from './nodes/Stage2Group'
import ClarifyingNode from './nodes/ClarifyingNode'
import AnimatedEdge from './edges/AnimatedEdge'
import DataFlowEdge from './edges/DataFlowEdge'

/**
 * Node type mappings for React Flow.
 * Defined at module level to prevent re-creation on each render.
 */
export const nodeTypes: NodeTypes = {
  stage: StageNode,
  merge: MergeNode,
  end: EndNode,
  document: DocumentNode,
  lesson: LessonNode,
  module: ModuleGroup,
  stage2group: Stage2Group,
  clarifying: ClarifyingNode,
}

/**
 * Edge type mappings for React Flow.
 * Defined at module level to prevent re-creation on each render.
 */
export const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
  dataflow: DataFlowEdge,
}
