import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

// Fallback for crypto.randomUUID (not available in non-secure HTTP contexts)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // Falls through to fallback
    }
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
  )
}

// ============================================================================
// TYPES
// ============================================================================

export interface EditHistoryEntry {
  /** Unique edit ID */
  id: string
  /** Timestamp when edit was created */
  timestamp: number
  /** Stage ID (stage_4 = Analysis Result, stage_5 = Course Structure, stage_6 = Lesson Content) */
  stageId: 'stage_4' | 'stage_5' | 'stage_6'
  /** Course ID */
  courseId: string
  /** Field path (e.g., "sections[0].lessons[1].lesson_title") */
  fieldPath: string
  /** Previous value before the change */
  previousValue: unknown
  /** New value after the change */
  newValue: unknown
}

// ============================================================================
// STORE STATE & ACTIONS
// ============================================================================

interface EditHistoryState {
  /** Stack of past edits (for undo) */
  past: EditHistoryEntry[]
  /** Stack of future edits (for redo) */
  future: EditHistoryEntry[]

  // ========== ACTIONS ==========

  /** Add new edit to history */
  pushEdit: (entry: Omit<EditHistoryEntry, 'id' | 'timestamp'>) => void

  /** Revert last edit, returns the reverted entry for UI update */
  undo: () => EditHistoryEntry | null

  /** Re-apply last undone edit, returns the re-applied entry */
  redo: () => EditHistoryEntry | null

  /** Check if undo is available */
  canUndo: () => boolean

  /** Check if redo is available */
  canRedo: () => boolean

  /** Clear history (optionally filtered by courseId) */
  clearHistory: (courseId?: string) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of history entries per course to prevent memory issues */
const MAX_HISTORY_ENTRIES = 50

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useEditHistoryStore = create<EditHistoryState>()(
  immer((set, get) => ({
    past: [],
    future: [],

    // ========== ACTIONS ==========

    pushEdit: (entry) => {
      set((state) => {
        const fullEntry: EditHistoryEntry = {
          ...entry,
          id: generateUUID(),
          timestamp: Date.now(),
        }

        // Add to past stack
        state.past.push(fullEntry)

        // Clear redo stack on new edit (standard undo/redo behavior)
        state.future = []

        // Limit history size per course
        const courseEntries = state.past.filter((e) => e.courseId === entry.courseId)
        if (courseEntries.length > MAX_HISTORY_ENTRIES) {
          // Remove oldest entry for this course
          const oldestIndex = state.past.findIndex((e) => e.courseId === entry.courseId)
          if (oldestIndex >= 0) {
            state.past.splice(oldestIndex, 1)
          }
        }
      })
    },

    undo: () => {
      let undoneEntry: EditHistoryEntry | null = null

      set((state) => {
        if (state.past.length === 0) return

        // Pop from past and push to future
        undoneEntry = state.past.pop()!
        state.future.push(undoneEntry)
      })

      return undoneEntry
    },

    redo: () => {
      let redoneEntry: EditHistoryEntry | null = null

      set((state) => {
        if (state.future.length === 0) return

        // Pop from future and push to past
        redoneEntry = state.future.pop()!
        state.past.push(redoneEntry)
      })

      return redoneEntry
    },

    canUndo: () => get().past.length > 0,

    canRedo: () => get().future.length > 0,

    clearHistory: (courseId) => {
      set((state) => {
        if (courseId) {
          // Clear only entries for specific course
          state.past = state.past.filter((e) => e.courseId !== courseId)
          state.future = state.future.filter((e) => e.courseId !== courseId)
        } else {
          // Clear all history
          state.past = []
          state.future = []
        }
      })
    },
  }))
)
