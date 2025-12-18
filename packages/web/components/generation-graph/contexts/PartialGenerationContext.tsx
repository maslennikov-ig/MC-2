'use client';

import { createContext, useContext, ReactNode, useState } from 'react';
import { usePartialGeneration } from '../hooks/usePartialGeneration';
import { useSelectionStore } from '../stores/useSelectionStore';

/**
 * Context value type for partial generation and selection management
 */
interface PartialGenerationContextType {
  // Generation actions
  /**
   * Generate a single lesson
   * @param lessonId - Lesson ID in format "section.lesson"
   */
  generateLesson: (lessonId: string) => Promise<void>;

  /**
   * Generate all lessons in a section
   * @param sectionId - Section number
   */
  generateSection: (sectionId: number) => Promise<void>;

  /**
   * Generate all currently selected lessons
   * Clears selection and exits selection mode on success
   */
  generateSelected: () => Promise<void>;

  // Selection state (from Zustand)
  /** Set of selected lesson IDs */
  selectedLessons: Set<string>;
  /** Set of selected module numbers */
  selectedModules: Set<number>;
  /** Toggle individual lesson selection */
  toggleLesson: (lessonId: string) => void;
  /** Toggle module selection (selects/deselects all lessons in module) */
  toggleModule: (moduleNumber: number, lessonIds: string[]) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Check if any lessons are selected */
  hasSelection: boolean;
  /** Count of selected lessons */
  selectedCount: number;
  /** Get array of selected lesson IDs */
  getSelectedLessonIds: () => string[];

  // Loading state
  /** True if any generation is in progress */
  isGenerating: boolean;
  /** Check if specific lesson is generating */
  isLessonGenerating: (lessonId: string) => boolean;
  /** Check if specific section is generating */
  isSectionGenerating: (sectionId: number) => boolean;

  // Selection mode toggle
  /** True if in selection mode (UI shows checkboxes) */
  isSelectionMode: boolean;
  /** Set selection mode on/off */
  setSelectionMode: (mode: boolean) => void;
}

const PartialGenerationContext = createContext<PartialGenerationContextType | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Course UUID identifier */
  courseId: string;
}

/**
 * Provider component for partial generation context
 *
 * Combines usePartialGeneration hook with useSelectionStore for centralized
 * lesson generation and selection management. Provides a unified API for
 * components to trigger generation and manage selection state.
 *
 * @example
 * ```tsx
 * <PartialGenerationProvider courseId="course-uuid">
 *   <GenerationGraph />
 * </PartialGenerationProvider>
 * ```
 */
export function PartialGenerationProvider({ children, courseId }: ProviderProps) {
  const generation = usePartialGeneration(courseId);
  const selection = useSelectionStore();
  const [isSelectionMode, setSelectionMode] = useState(false);

  /**
   * Generate all currently selected lessons
   * Automatically clears selection and exits selection mode on success
   */
  const generateSelected = async () => {
    const lessonIds = selection.getSelectedLessonIds();
    if (lessonIds.length === 0) {
      return;
    }

    const result = await generation.generateLessons(lessonIds);
    if (result?.success) {
      selection.clearSelection();
      setSelectionMode(false);
    }
  };

  /**
   * Generate a single lesson
   * Wrapper around generation.generateLesson that returns Promise<void>
   */
  const generateLesson = async (lessonId: string) => {
    await generation.generateLesson(lessonId);
  };

  /**
   * Generate all lessons in a section
   * Wrapper around generation.generateSection that returns Promise<void>
   */
  const generateSection = async (sectionId: number) => {
    await generation.generateSection(sectionId);
  };

  const value: PartialGenerationContextType = {
    // Generation actions
    generateLesson,
    generateSection,
    generateSelected,

    // Selection state
    selectedLessons: selection.selectedLessons,
    selectedModules: selection.selectedModules,
    toggleLesson: selection.toggleLesson,
    toggleModule: selection.toggleModule,
    clearSelection: selection.clearSelection,
    hasSelection: selection.hasSelection(),
    selectedCount: selection.getSelectedCount(),
    getSelectedLessonIds: selection.getSelectedLessonIds,

    // Loading state
    isGenerating: generation.isGenerating,
    isLessonGenerating: generation.isLessonGenerating,
    isSectionGenerating: generation.isSectionGenerating,

    // Selection mode
    isSelectionMode,
    setSelectionMode,
  };

  return <PartialGenerationContext.Provider value={value}>{children}</PartialGenerationContext.Provider>;
}

/**
 * Hook to access partial generation context
 *
 * Must be used within a PartialGenerationProvider component.
 *
 * @throws Error if used outside PartialGenerationProvider
 * @returns PartialGenerationContextType with generation and selection APIs
 *
 * @example
 * ```tsx
 * function LessonNode({ lessonId }: { lessonId: string }) {
 *   const { generateLesson, toggleLesson, isLessonSelected } = usePartialGenerationContext();
 *
 *   return (
 *     <div>
 *       <button onClick={() => generateLesson(lessonId)}>Generate</button>
 *       <input
 *         type="checkbox"
 *         checked={isLessonSelected(lessonId)}
 *         onChange={() => toggleLesson(lessonId)}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function usePartialGenerationContext() {
  const context = useContext(PartialGenerationContext);
  if (!context) {
    throw new Error('usePartialGenerationContext must be used within PartialGenerationProvider');
  }
  return context;
}

/**
 * Optional hook to access partial generation context
 *
 * Safe to use in components that may or may not be inside PartialGenerationProvider.
 * Returns null if not within provider (does not throw).
 *
 * @returns PartialGenerationContextType or null if outside provider
 */
export function useOptionalPartialGenerationContext(): PartialGenerationContextType | null {
  return useContext(PartialGenerationContext);
}
