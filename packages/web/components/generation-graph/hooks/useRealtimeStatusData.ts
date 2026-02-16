'use client'

import { useMemo } from 'react'
import type { AppNode } from '../types'
import type { Database } from '@megacampus/shared-types'
import { GRAPH_STAGE_CONFIG, ACTIVE_STATUSES } from '@/lib/generation-graph/constants'
import {
  mapStatusToNodeStatus,
  getStageFromStatus,
  isAwaitingApproval,
  calculateProgress,
} from '@/lib/generation-graph/utils'
import type { RealtimeStatusData, NodeStatusEntry } from '@megacampus/shared-types'

type GenerationStatus = Database['public']['Enums']['generation_status']

interface UseRealtimeStatusDataParams {
  pipelineStatus: GenerationStatus | null
  isConnected: boolean
  hasDocuments: boolean
  failedAtStage: number | null | undefined
  nodes: AppNode[]
  progressPercentage: number | undefined
  lessonsCompleted: number | undefined
  lessonsTotal: number | undefined
}

/**
 * Hook for building realtime status data structure consumed by RealtimeStatusContext.
 * Maps pipeline status to node statuses for all stages and calculates overall progress.
 *
 * @returns RealtimeStatusData object with node statuses and pipeline metadata
 */
export function useRealtimeStatusData({
  pipelineStatus,
  isConnected,
  hasDocuments,
  failedAtStage,
  nodes,
  progressPercentage,
  lessonsCompleted,
  lessonsTotal,
}: UseRealtimeStatusDataParams): RealtimeStatusData {
  return useMemo(() => {
    const nodeStatuses = new Map<string, NodeStatusEntry>()
    const currentStage = getStageFromStatus(pipelineStatus || '')
    const awaitingStage = isAwaitingApproval(pipelineStatus || '')
    const hasError = pipelineStatus === 'failed'

    Object.values(GRAPH_STAGE_CONFIG).forEach((stage) => {
      const status = mapStatusToNodeStatus(
        stage.number,
        currentStage,
        pipelineStatus || 'draft',
        hasError,
        awaitingStage,
        failedAtStage,
        hasDocuments
      )

      nodeStatuses.set(stage.id, {
        status,
        lastUpdated: new Date(),
      })
    })

    // Calculate Stage 6 progress from lesson completion
    const stage6Nodes = nodes.filter((n) => n.type === 'lesson' || n.type === 'module')
    const stage6Lessons = stage6Nodes.filter((n) => n.type === 'lesson')
    const stage6Completed = stage6Lessons.filter((l) => l.data.status === 'completed').length
    const stage6Progress =
      stage6Lessons.length > 0 ? Math.round((stage6Completed / stage6Lessons.length) * 100) : 0

    // Update Stage 6 status entry with progress
    const stage6Status = nodeStatuses.get('stage_6')
    if (stage6Status) {
      nodeStatuses.set('stage_6', {
        ...stage6Status,
        progress: stage6Progress,
      })
    }

    // Set End node status based on pipeline completion
    nodeStatuses.set('end', {
      status: pipelineStatus === 'completed' ? 'completed' : 'pending',
      lastUpdated: new Date(),
    })

    let mappedStatus: 'idle' | 'running' | 'completed' | 'failed' | 'paused' = 'idle'
    if (pipelineStatus && ACTIVE_STATUSES.includes(pipelineStatus)) {
      mappedStatus = 'running'
    } else if (pipelineStatus === 'completed') {
      mappedStatus = 'completed'
    } else if (pipelineStatus === 'failed') {
      mappedStatus = 'failed'
    }

    // Use progressPercentage from database when available (ensures consistency with CelestialHeader)
    // Fall back to calculated progress from status for backward compatibility
    const overallProgress =
      progressPercentage !== undefined
        ? progressPercentage
        : calculateProgress(pipelineStatus as string | null, hasDocuments, {
            lessonsCompleted,
            lessonsTotal,
          })

    return {
      nodeStatuses,
      activeNodeId: null,
      pipelineStatus: mappedStatus,
      overallProgress,
      elapsedTime: 0,
      totalCost: 0,
      isConnected,
      lastUpdated: new Date(),
    }
  }, [
    pipelineStatus,
    isConnected,
    hasDocuments,
    failedAtStage,
    nodes,
    progressPercentage,
    lessonsCompleted,
    lessonsTotal,
  ])
}
