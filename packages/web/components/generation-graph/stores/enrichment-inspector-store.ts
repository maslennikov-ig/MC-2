'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

/**
 * Inspector view types for stack navigation
 */
export type InspectorView = 'root' | 'create' | 'detail';

/**
 * Enrichment types that can be created
 */
export type CreateEnrichmentType =
  | 'video'
  | 'podcast'
  | 'mindmap'
  | 'case_study'
  | 'quiz'
  | 'flashcards'
  | 'project'
  | 'discussion'
  | 'reading'
  | 'exercise';

/**
 * Navigation history entry for stack navigation
 */
interface NavigationEntry {
  view: InspectorView;
  enrichmentId?: string;
  createType?: CreateEnrichmentType;
}

/**
 * State for enrichment inspector stack navigation
 *
 * Manages view routing and navigation history for the enrichment inspector panel.
 * Supports root view (enrichment list), create view (new enrichment form),
 * and detail view (enrichment details).
 */
interface EnrichmentInspectorState {
  /**
   * Current lesson ID being inspected
   */
  lessonId: string | null;

  /**
   * Navigation history stack for back button support
   */
  history: NavigationEntry[];

  /**
   * Current navigation entry (top of stack)
   */
  current: NavigationEntry | null;

  /**
   * Whether the current form has unsaved changes
   */
  dirty: boolean;

  /**
   * Open root view for a lesson (clear history)
   * @param lessonId - Lesson ID to inspect
   */
  openRoot: (lessonId: string) => void;

  /**
   * Navigate to create enrichment view
   * @param type - Type of enrichment to create
   */
  openCreate: (type: CreateEnrichmentType) => void;

  /**
   * Navigate to enrichment detail view
   * @param enrichmentId - ID of enrichment to view
   */
  openDetail: (enrichmentId: string) => void;

  /**
   * Go back in navigation history
   */
  goBack: () => void;

  /**
   * Reset inspector state
   */
  reset: () => void;

  /**
   * Set dirty state for form tracking
   * @param dirty - Whether form has unsaved changes
   */
  setDirty: (dirty: boolean) => void;
}

/**
 * Zustand store for enrichment inspector navigation
 *
 * Used in the EnrichmentInspectorPanel to manage stack-based navigation
 * between different inspector views.
 *
 * @example
 * ```tsx
 * const { openRoot, openCreate, goBack } = useEnrichmentInspectorStore();
 *
 * // Open inspector for lesson
 * openRoot('lesson-123');
 *
 * // Navigate to create view
 * openCreate('video');
 *
 * // Go back to previous view
 * goBack();
 * ```
 */
export const useEnrichmentInspectorStore = create<EnrichmentInspectorState>()(
  immer((set) => ({
    lessonId: null,
    history: [],
    current: null,
    dirty: false,

    openRoot: (lessonId) =>
      set((state) => {
        state.lessonId = lessonId;
        state.history = [];
        state.current = { view: 'root' };
        state.dirty = false;
      }),

    openCreate: (type) =>
      set((state) => {
        if (state.current) {
          state.history.push(state.current);
        }
        state.current = { view: 'create', createType: type };
        state.dirty = false;
      }),

    openDetail: (enrichmentId) =>
      set((state) => {
        if (state.current) {
          state.history.push(state.current);
        }
        state.current = { view: 'detail', enrichmentId };
      }),

    goBack: () =>
      set((state) => {
        if (state.history.length === 0) return;

        const previous = state.history.pop()!;
        state.current = previous;
      }),

    reset: () =>
      set((state) => {
        state.lessonId = null;
        state.history = [];
        state.current = null;
        state.dirty = false;
      }),

    setDirty: (dirty) => set((state) => { state.dirty = dirty; }),
  }))
);

/**
 * Selector hooks for convenient access to specific state
 *
 * Note: These hooks return primitive values (strings, booleans, null),
 * which Zustand handles efficiently by default using referential equality.
 * For selectors that return objects/arrays, use:
 * `import { useShallow } from 'zustand/react/shallow'`
 */

/**
 * Get current inspector view
 */
export const useInspectorView = (): InspectorView => {
  return useEnrichmentInspectorStore((state) => state.current?.view ?? 'root');
};

/**
 * Get selected enrichment ID (for detail view)
 */
export const useSelectedEnrichmentId = (): string | null => {
  return useEnrichmentInspectorStore((state) => state.current?.enrichmentId ?? null);
};

/**
 * Get create enrichment type (for create view)
 */
export const useCreateEnrichmentType = (): CreateEnrichmentType | null => {
  return useEnrichmentInspectorStore((state) => state.current?.createType ?? null);
};

/**
 * Get current lesson ID
 */
export const useInspectorLessonId = (): string | null => {
  return useEnrichmentInspectorStore((state) => state.lessonId);
};

/**
 * Check if back navigation is available
 */
export const useCanGoBack = (): boolean => {
  return useEnrichmentInspectorStore((state) => state.history.length > 0);
};
