'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { SaveStatus } from './useAutoSave'

interface UseFieldStatusTrackingResult {
  /**
   * Perform save with per-field status tracking.
   * Sets the field status to 'saving' and tracks which field was last saved.
   */
  performSave: (fieldPath: string, value: unknown) => void
  /**
   * Get the current save status for a specific field.
   * Returns 'idle' if no status is tracked for this field.
   */
  getFieldStatus: (fieldPath: string) => SaveStatus
}

/**
 * Hook for tracking per-field save status to prevent race conditions with rapid edits.
 *
 * When editing multiple fields quickly, the global save status from useAutoSave
 * might show "saved" for a previous field while another field is still saving.
 * This hook tracks individual field statuses to provide accurate feedback.
 *
 * @param save - The save function from useAutoSave
 * @param globalStatus - The global status from useAutoSave (to sync field statuses)
 * @returns Object with performSave and getFieldStatus functions
 *
 * @example
 * ```tsx
 * const { status, save } = useAutoSave(...)
 * const { performSave, getFieldStatus } = useFieldStatusTracking(save, status)
 *
 * <EditableField
 *   onChange={(v) => performSave('topic_analysis.determined_topic', v)}
 *   status={getFieldStatus('topic_analysis.determined_topic')}
 * />
 * ```
 */
export function useFieldStatusTracking(
  save: (fieldPath: string, value: unknown) => void,
  globalStatus: SaveStatus
): UseFieldStatusTrackingResult {
  // Per-field save status tracking (fixes race condition with rapid edits)
  const [fieldStatuses, setFieldStatuses] = useState<Map<string, SaveStatus>>(new Map())
  const lastSavedFieldRef = useRef<string | null>(null)

  // Helper to actually perform the save
  const performSave = useCallback(
    (fieldPath: string, value: unknown) => {
      // Set this field to 'saving' immediately
      setFieldStatuses((prev) => {
        const next = new Map(prev)
        next.set(fieldPath, 'saving')
        return next
      })
      lastSavedFieldRef.current = fieldPath
      save(fieldPath, value)
    },
    [save]
  )

  // Get status for a specific field from the Map
  const getFieldStatus = useCallback(
    (fieldPath: string): SaveStatus => {
      return fieldStatuses.get(fieldPath) ?? 'idle'
    },
    [fieldStatuses]
  )

  // Update per-field status when save completes or errors
  useEffect(() => {
    if ((globalStatus === 'saved' || globalStatus === 'error') && lastSavedFieldRef.current) {
      const fieldPath = lastSavedFieldRef.current

      // Update this field's status
      setFieldStatuses((prev) => {
        const next = new Map(prev)
        next.set(fieldPath, globalStatus)
        return next
      })

      // Clear after 2 seconds with isMounted guard
      let isMounted = true
      const timer = setTimeout(() => {
        if (isMounted) {
          setFieldStatuses((prev) => {
            const next = new Map(prev)
            next.delete(fieldPath)
            return next
          })
        }
      }, 2000)

      return () => {
        isMounted = false
        clearTimeout(timer)
      }
    }
    return undefined
  }, [globalStatus])

  return {
    performSave,
    getFieldStatus,
  }
}
