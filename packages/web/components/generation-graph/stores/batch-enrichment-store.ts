'use client'

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { CreateableEnrichmentType } from '../panels/stage7/forms/enrichment-form-config'

/**
 * Batch enrichment workflow status
 */
export type BatchStatus =
  | 'idle'
  | 'configuring'
  | 'selecting'
  | 'confirming'
  | 'submitting'
  | 'tracking'
  | 'completed'
  | 'error'

/**
 * State for batch enrichment creation workflow
 *
 * Manages a multi-step wizard for creating enrichments across
 * multiple lessons simultaneously. Steps:
 * 1. Type & Settings selection
 * 2. Lesson selection
 * 3. Confirmation
 * 4. Progress tracking
 */
interface BatchEnrichmentState {
  /** Selected lesson IDs (plain array for Immer compatibility) */
  selectedLessonIds: string[]

  /** Selected enrichment type */
  enrichmentType: CreateableEnrichmentType | null

  /** Type-specific settings */
  settings: Record<string, unknown>

  /** Current workflow status */
  status: BatchStatus

  /** Current wizard step (1-4) */
  step: number

  /** Total enrichments being created */
  totalCount: number

  /** Successfully completed count */
  completedCount: number

  /** Failed count */
  failedCount: number

  /** Created enrichment IDs (from createBatch response) */
  enrichmentIds: string[]

  /** Error message if status is 'error' */
  error: string | null

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /** Set the enrichment type and initialize default settings */
  setEnrichmentType: (type: CreateableEnrichmentType) => void

  /** Update settings object */
  setSettings: (settings: Record<string, unknown>) => void

  /** Toggle a lesson ID in/out of selection */
  toggleLesson: (lessonId: string) => void

  /** Select all provided lesson IDs */
  selectAll: (lessonIds: string[]) => void

  /** Clear lesson selection */
  clearSelection: () => void

  /** Advance to next wizard step */
  nextStep: () => void

  /** Go back to previous wizard step */
  prevStep: () => void

  /** Transition to submitting state */
  startBatch: () => void

  /** Store the result from createBatch mutation */
  setBatchResult: (enrichmentIds: string[], totalCount: number) => void

  /** Update progress counters during tracking */
  updateProgress: (completed: number, failed: number) => void

  /** Mark the batch as completed */
  setCompleted: () => void

  /** Set error state */
  setError: (error: string) => void

  /** Retry from confirmation step after error */
  retryFromConfirm: () => void

  /** Reset all state back to initial */
  reset: () => void
}

/**
 * Zustand store for batch enrichment creation workflow
 */
export const useBatchEnrichmentStore = create<BatchEnrichmentState>()(
  immer((set) => ({
    selectedLessonIds: [],
    enrichmentType: null,
    settings: {},
    status: 'idle',
    step: 1,
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    enrichmentIds: [],
    error: null,

    setEnrichmentType: (type) =>
      set((state) => {
        state.enrichmentType = type
        state.status = 'configuring'
      }),

    setSettings: (settings) =>
      set((state) => {
        state.settings = settings
      }),

    toggleLesson: (lessonId) =>
      set((state) => {
        const idx = state.selectedLessonIds.indexOf(lessonId)
        if (idx >= 0) {
          state.selectedLessonIds.splice(idx, 1)
        } else {
          state.selectedLessonIds.push(lessonId)
        }
      }),

    selectAll: (lessonIds) =>
      set((state) => {
        state.selectedLessonIds = [...lessonIds]
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedLessonIds = []
      }),

    nextStep: () =>
      set((state) => {
        if (state.step < 4) {
          state.step += 1

          if (state.step === 2) state.status = 'selecting'
          if (state.step === 3) state.status = 'confirming'
          if (state.step === 4) state.status = 'tracking'
        }
      }),

    prevStep: () =>
      set((state) => {
        if (state.step > 1) {
          state.step -= 1

          if (state.step === 1) state.status = 'configuring'
          if (state.step === 2) state.status = 'selecting'
          if (state.step === 3) state.status = 'confirming'
        }
      }),

    startBatch: () =>
      set((state) => {
        state.status = 'submitting'
      }),

    setBatchResult: (enrichmentIds, totalCount) =>
      set((state) => {
        state.enrichmentIds = enrichmentIds
        state.totalCount = totalCount
        state.status = 'tracking'
        state.step = 4
      }),

    updateProgress: (completed, failed) =>
      set((state) => {
        state.completedCount = completed
        state.failedCount = failed
      }),

    setCompleted: () =>
      set((state) => {
        state.status = 'completed'
      }),

    setError: (error) =>
      set((state) => {
        state.status = 'error'
        state.error = error
      }),

    retryFromConfirm: () =>
      set((state) => {
        state.status = 'confirming'
        state.step = 3
        state.error = null
      }),

    reset: () =>
      set((state) => {
        state.selectedLessonIds = []
        state.enrichmentType = null
        state.settings = {}
        state.status = 'idle'
        state.step = 1
        state.totalCount = 0
        state.completedCount = 0
        state.failedCount = 0
        state.enrichmentIds = []
        state.error = null
      }),
  }))
)

/**
 * Selector: get count of selected lessons
 */
export const useBatchSelectedCount = (): number => {
  return useBatchEnrichmentStore((state) => state.selectedLessonIds.length)
}

/**
 * Selector: check if a specific lesson is selected
 */
export const useBatchIsLessonSelected = (lessonId: string): boolean => {
  return useBatchEnrichmentStore((state) => state.selectedLessonIds.includes(lessonId))
}

/**
 * Selector: overall progress percentage
 */
export const useBatchOverallProgress = (): number => {
  return useBatchEnrichmentStore((state) => {
    if (state.totalCount === 0) return 0
    return Math.round(((state.completedCount + state.failedCount) / state.totalCount) * 100)
  })
}
