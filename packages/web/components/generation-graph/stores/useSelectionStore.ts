'use client';

import { create } from 'zustand';

/**
 * State for lesson and module selection in the generation graph
 *
 * Manages which lessons and modules are selected for partial generation.
 * Supports both individual lesson selection and bulk module selection.
 */
interface SelectionState {
  /**
   * Selected lesson IDs in format "section.lesson" (e.g., "1.1", "2.3")
   */
  selectedLessons: Set<string>;

  /**
   * Selected module (section) numbers (e.g., 1, 2, 3)
   */
  selectedModules: Set<number>;

  /**
   * Toggle individual lesson selection
   * @param lessonId - Lesson ID in format "section.lesson"
   */
  toggleLesson: (lessonId: string) => void;

  /**
   * Toggle module selection (selects/deselects all lessons in the module)
   * @param moduleNumber - Section number (1-based)
   * @param lessonIds - Array of lesson IDs in this module
   */
  toggleModule: (moduleNumber: number, lessonIds: string[]) => void;

  /**
   * Select all lessons
   * @param lessonIds - Array of all lesson IDs in the course
   */
  selectAll: (lessonIds: string[]) => void;

  /**
   * Clear all selections
   */
  clearSelection: () => void;

  /**
   * Check if any lessons are selected
   * @returns True if at least one lesson is selected
   */
  hasSelection: () => boolean;

  /**
   * Get count of selected lessons
   * @returns Number of selected lessons
   */
  getSelectedCount: () => number;

  /**
   * Get array of selected lesson IDs
   * @returns Array of lesson IDs
   */
  getSelectedLessonIds: () => string[];

  /**
   * Get array of selected module numbers
   * @returns Array of section numbers
   */
  getSelectedModuleNumbers: () => number[];

  /**
   * Check if a lesson is selected
   * @param lessonId - Lesson ID to check
   * @returns True if lesson is selected
   */
  isLessonSelected: (lessonId: string) => boolean;

  /**
   * Check if a module is selected (all its lessons are selected)
   * @param moduleNumber - Section number to check
   * @returns True if module is fully selected
   */
  isModuleSelected: (moduleNumber: number) => boolean;
}

/**
 * Zustand store for lesson and module selection state
 *
 * Used in the generation graph to track which lessons/modules
 * the user has selected for partial generation.
 *
 * @example
 * ```tsx
 * const { selectedLessons, toggleLesson, clearSelection } = useSelectionStore();
 *
 * <button onClick={() => toggleLesson('1.1')}>
 *   {selectedLessons.has('1.1') ? 'Deselect' : 'Select'}
 * </button>
 * ```
 */
export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedLessons: new Set(),
  selectedModules: new Set(),

  toggleLesson: (lessonId) =>
    set((state) => {
      const newSet = new Set(state.selectedLessons);
      if (newSet.has(lessonId)) {
        newSet.delete(lessonId);
      } else {
        newSet.add(lessonId);
      }
      return { selectedLessons: newSet };
    }),

  toggleModule: (moduleNumber, lessonIds) =>
    set((state) => {
      const newModules = new Set(state.selectedModules);
      const newLessons = new Set(state.selectedLessons);

      if (newModules.has(moduleNumber)) {
        // Deselect module and all its lessons
        newModules.delete(moduleNumber);
        lessonIds.forEach((id) => newLessons.delete(id));
      } else {
        // Select module and all its lessons
        newModules.add(moduleNumber);
        lessonIds.forEach((id) => newLessons.add(id));
      }

      return { selectedModules: newModules, selectedLessons: newLessons };
    }),

  selectAll: (lessonIds) =>
    set(() => ({
      selectedLessons: new Set(lessonIds),
      selectedModules: new Set(), // Clear module selections when selecting all
    })),

  clearSelection: () =>
    set(() => ({
      selectedLessons: new Set(),
      selectedModules: new Set(),
    })),

  hasSelection: () => get().selectedLessons.size > 0,

  getSelectedCount: () => get().selectedLessons.size,

  getSelectedLessonIds: () => Array.from(get().selectedLessons),

  getSelectedModuleNumbers: () => Array.from(get().selectedModules),

  isLessonSelected: (lessonId) => get().selectedLessons.has(lessonId),

  isModuleSelected: (moduleNumber) => get().selectedModules.has(moduleNumber),
}));
