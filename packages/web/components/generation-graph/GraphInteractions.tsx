'use client'

import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useTouchGestures } from './hooks/useTouchGestures'
import type { GraphInteractionsProps } from './GraphView.types'

/**
 * Internal component that manages graph interactions (keyboard shortcuts, touch gestures).
 * Renders nothing but sets up interaction event handlers.
 *
 * @param props - Component props
 */
export function GraphInteractions({ setIsPanning }: GraphInteractionsProps) {
  useKeyboardShortcuts(setIsPanning)
  useTouchGestures()
  return null
}
