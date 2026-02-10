'use client'

import { useCallback, useEffect } from 'react'
import type { Database } from '@megacampus/shared-types'

type GenerationStatus = Database['public']['Enums']['generation_status']

interface UseAutoNodeSelectionParams {
  courseId: string
  pipelineStatus: GenerationStatus | null
  awaitingStage: number | null
  selectNode: (nodeId: string, options?: { autoOpened?: boolean }) => void
  deselectNode: () => void
}

/**
 * Hook for auto-selecting Stage 3, 4, or 5 node when awaiting approval or on completion.
 *
 * Auto-selection behavior:
 * - Awaiting approval: ALWAYS open (user needs to take action)
 * - Completion: Only open ONCE per session (not on reload)
 * - Clarifying phase: Open clarifying node instead of stage_4
 *
 * Uses sessionStorage to track which stages have been auto-opened.
 */
export function useAutoNodeSelection({
  courseId,
  pipelineStatus,
  awaitingStage,
  selectNode,
  deselectNode,
}: UseAutoNodeSelectionParams) {
  const getAutoOpenedKey = useCallback(
    (stage: string) => `graphview_auto_opened_${courseId}_${stage}`,
    [courseId]
  )

  const hasBeenAutoOpened = useCallback(
    (stage: string) => {
      if (typeof window === 'undefined') return false
      return sessionStorage.getItem(getAutoOpenedKey(stage)) === 'true'
    },
    [getAutoOpenedKey]
  )

  const markAsAutoOpened = useCallback(
    (stage: string) => {
      if (typeof window === 'undefined') return
      sessionStorage.setItem(getAutoOpenedKey(stage), 'true')
    },
    [getAutoOpenedKey]
  )

  // Auto-select Stage 3, 4, or 5 node when awaiting approval (always) or completed (only once per session)
  useEffect(() => {
    let selectedStage: string | null = null
    let isAwaitingState = false

    // Check clarifying state FIRST - specific handling for clarifying node
    if (pipelineStatus === 'stage_4_clarifying') {
      selectedStage = 'stage_4_clarifying'
      isAwaitingState = true
    }
    // Check awaiting approval states - ALWAYS open for awaiting (user needs to take action)
    else if (awaitingStage === 3) {
      selectedStage = 'stage_3'
      isAwaitingState = true
    } else if (awaitingStage === 4) {
      selectedStage = 'stage_4'
      isAwaitingState = true
    } else if (awaitingStage === 5) {
      selectedStage = 'stage_5'
      isAwaitingState = true
    }
    // Check completion states - only open ONCE per session (not on reload)
    else if (pipelineStatus === 'stage_4_complete' && !hasBeenAutoOpened('stage_4_complete')) {
      selectedStage = 'stage_4'
    } else if (pipelineStatus === 'stage_5_complete' && !hasBeenAutoOpened('stage_5_complete')) {
      selectedStage = 'stage_5'
    }

    // Select the node if a stage is determined (mark as auto-opened)
    if (selectedStage) {
      selectNode(selectedStage, { autoOpened: true })
      // Mark completion states as opened (awaiting states always reopen)
      if (!isAwaitingState && pipelineStatus) {
        markAsAutoOpened(pipelineStatus)
      }
    }

    // Cleanup: deselect when stage changes
    return () => {
      if (selectedStage) {
        deselectNode()
      }
    }
  }, [awaitingStage, pipelineStatus, selectNode, deselectNode, hasBeenAutoOpened, markAsAutoOpened])
}
