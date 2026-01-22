'use client'

import React, { useEffect } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ParameterStageNode } from './nodes/ParameterStageNode'
import { useParameterFlow } from './hooks/useParameterFlow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity } from 'lucide-react'

const nodeTypes = {
  parameterStage: ParameterStageNode,
}

// Stage definitions with parameter mappings
const STAGE_CONFIGS = [
  { id: 'stage_1', label: 'Ingestion', stageNumber: 1 },
  { id: 'stage_2', label: 'Processing', stageNumber: 2 },
  { id: 'stage_3', label: 'Classification', stageNumber: 3 },
  { id: 'stage_4', label: 'Analysis', stageNumber: 4 },
  { id: 'stage_5', label: 'Generation', stageNumber: 5 },
  { id: 'stage_6', label: 'Content', stageNumber: 6 },
]

interface ParameterFlowDashboardProps {
  courseId: string
  className?: string
}

export function ParameterFlowDashboard({ courseId, className }: ParameterFlowDashboardProps) {
  const { stageStates, parameterTransfers, isLoading } = useParameterFlow(courseId)

  // Create nodes from stage configs
  const initialNodes: Node[] = STAGE_CONFIGS.map((stage, index) => ({
    id: stage.id,
    type: 'parameterStage',
    position: { x: index * 200, y: 100 },
    data: {
      label: stage.label,
      stageNumber: stage.stageNumber,
      parameters: stageStates[stage.id]?.parameters || [],
      status: stageStates[stage.id]?.status || 'pending',
    },
  }))

  // Create edges between stages
  const initialEdges: Edge[] = STAGE_CONFIGS.slice(0, -1).map((stage, index) => {
    const nextStage = STAGE_CONFIGS[index + 1]
    const transfer = parameterTransfers[`${stage.id}_to_${nextStage.id}`]

    return {
      id: `${stage.id}-${nextStage.id}`,
      source: stage.id,
      target: nextStage.id,
      animated: transfer?.isActive || false,
      style: {
        stroke:
          transfer?.status === 'completed'
            ? '#22c55e'
            : transfer?.status === 'active'
              ? '#3b82f6'
              : transfer?.status === 'failed'
                ? '#ef4444'
                : '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: transfer?.status === 'completed' ? '#22c55e' : '#94a3b8',
      },
      label: transfer?.paramCount ? `${transfer.paramCount} params` : undefined,
      labelStyle: { fontSize: 10, fill: '#64748b' },
    }
  })

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes when stage states change
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const stageState = stageStates[node.id]
        if (stageState) {
          return {
            ...node,
            data: {
              ...node.data,
              parameters: stageState.parameters,
              status: stageState.status,
            },
          }
        }
        return node
      })
    )
  }, [stageStates, setNodes])

  // Update edges when transfers change
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const transferKey = `${edge.source}_to_${edge.target}`
        const transfer = parameterTransfers[transferKey]
        if (transfer) {
          return {
            ...edge,
            animated: transfer.isActive,
            style: {
              ...edge.style,
              stroke:
                transfer.status === 'completed'
                  ? '#22c55e'
                  : transfer.status === 'active'
                    ? '#3b82f6'
                    : '#94a3b8',
            },
          }
        }
        return edge
      })
    )
  }, [parameterTransfers, setEdges])

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Parameter Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Parameter Flow
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background gap={16} size={1} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  )
}
