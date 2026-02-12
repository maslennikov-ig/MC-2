'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { useReactFlow } from '@xyflow/react'
import type { AppNode, AppEdge } from '../types'
import { useGraphLayout } from './useGraphLayout'
import { useViewportPreservation } from './useViewportPreservation'

interface UseGraphLayoutEffectParams {
  nodes: AppNode[]
  edges: AppEdge[]
  setNodes: (nodes: AppNode[]) => void
  nodePositionsRef: React.MutableRefObject<Map<string, { x: number; y: number }>>
}

/**
 * Hook for managing automatic graph layout when structure changes.
 *
 * Features:
 * - Debounced layout calculation (50ms)
 * - Race condition protection with generation counter
 * - Viewport preservation during layout
 * - Auto-fit on initial load
 * - Collapse state tracking for relayout trigger
 *
 * Triggers layout when:
 * - Node count changes
 * - Container nodes (module/stage2group) added/removed
 * - Collapse state changes
 * - Initial load
 */
export function useGraphLayoutEffect({
  nodes,
  edges,
  setNodes,
  nodePositionsRef,
}: UseGraphLayoutEffectParams) {
  const { fitView } = useReactFlow()
  const { layoutNodes } = useGraphLayout()
  const { restoreViewport } = useViewportPreservation()

  // Layout generation counter to prevent stale layout results
  const layoutGenerationRef = useRef(0)
  const initialFitDone = useRef(false)

  // Ref to access latest nodes without adding to effect dependencies
  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // Track module and stage2group collapse states for relayout trigger
  const collapseSignature = useMemo(
    () =>
      nodes
        .filter((n) => n.type === 'module' || n.type === 'stage2group')
        .map((n) => `${n.id}:${n.data?.isCollapsed}`)
        .join(','),
    [nodes]
  )

  // Create stable layout trigger based on structure, not content
  const layoutTrigger = useMemo(
    () => ({
      nodeCount: nodes.length,
      containerIds: nodes
        .filter((n) => n.type === 'module' || n.type === 'stage2group')
        .map((n) => n.id)
        .join(','),
      collapseSignature,
    }),
    [nodes, collapseSignature]
  )

  // Use ref to track previous trigger for comparison
  const prevLayoutTrigger = useRef(layoutTrigger)

  // Debounced layout function to prevent rapid layout calculations
  const debouncedLayout = useDebouncedCallback(
    async (
      nodesToLayout: AppNode[],
      edgesToLayout: AppEdge[],
      generation: number,
      wasCollapseChange: boolean
    ) => {
      if (layoutGenerationRef.current !== generation) {
        return // Stale request
      }

      try {
        const layoutedNodes = await layoutNodes(nodesToLayout, edgesToLayout)

        if (layoutGenerationRef.current !== generation) {
          return // Another layout started
        }

        // CRITICAL: Save positions BEFORE setNodes to prevent race condition
        // This ensures next graph rebuild has correct positions
        layoutedNodes.forEach((n) => {
          if (n.position) {
            nodePositionsRef.current.set(n.id, n.position)
          }
        })

        setNodes(layoutedNodes)

        // Fit view after layout
        if (!initialFitDone.current) {
          initialFitDone.current = true
          requestAnimationFrame(() => {
            void fitView({ padding: 0.15, minZoom: 0.6, maxZoom: 1.2, duration: 400 })
          })
        } else if (wasCollapseChange) {
          // Restore viewport after layout when collapse changed
          restoreViewport()
        }
      } catch (error) {
        console.error('[useGraphLayoutEffect] Layout calculation failed:', error)
        // Layout failed, but don't crash - nodes will stay at current positions
      }
    },
    50, // 50ms debounce
    { leading: true, trailing: true }
  )

  // Auto-layout when structure changes
  useEffect(() => {
    const structureChanged =
      layoutTrigger.nodeCount !== prevLayoutTrigger.current.nodeCount ||
      layoutTrigger.containerIds !== prevLayoutTrigger.current.containerIds
    const collapseChanged =
      layoutTrigger.collapseSignature !== prevLayoutTrigger.current.collapseSignature
    const isInitialLoad = !initialFitDone.current

    // Update ref for next comparison
    prevLayoutTrigger.current = layoutTrigger

    // Only layout if structure changes, collapse state changes, or initial load
    if (nodesRef.current.length > 0 && (structureChanged || isInitialLoad || collapseChanged)) {
      // Increment generation to track this layout request
      const currentGeneration = ++layoutGenerationRef.current

      // Use debounced layout to prevent rapid layout calculations
      void debouncedLayout(
        nodesRef.current,
        edges,
        currentGeneration,
        collapseChanged && !isInitialLoad
      )
    }

    // Cleanup: cancel pending debounced calls on unmount or re-run
    return () => {
      debouncedLayout.cancel()
    }
  }, [layoutTrigger, edges, debouncedLayout])

  return { initialFitDone }
}
