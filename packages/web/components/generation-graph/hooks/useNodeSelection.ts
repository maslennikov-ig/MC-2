import { create } from 'zustand';

/**
 * State interface for node selection management.
 * Tracks currently selected node and whether refinement UI should be focused.
 */
interface NodeSelectionState {
  /** ID of currently selected node, or null if no selection */
  selectedNodeId: string | null;
  /** Whether to show refinement input focus for the selected node */
  focusRefinement: boolean;
  /** Whether the node was opened automatically (e.g., after stage completion) */
  autoOpened: boolean;
  /**
   * Selects a node by ID with optional refinement focus.
   * @param id - Node ID to select
   * @param options - Optional configuration
   * @param options.focusRefinement - Whether to focus refinement input (default false)
   * @param options.autoOpened - Whether this is an automatic selection (default false)
   */
  selectNode: (id: string, options?: { focusRefinement?: boolean; autoOpened?: boolean }) => void;
  /** Deselects current node and clears refinement focus */
  deselectNode: () => void;
  /** Clears refinement focus while keeping node selected */
  clearRefinementFocus: () => void;
}

/**
 * Zustand store hook for managing node selection state across the graph.
 *
 * Provides centralized selection management that can be accessed from any component.
 * Used to coordinate node selection, details drawer, and refinement UI.
 *
 * @returns Object containing:
 * - `selectedNodeId` - ID of currently selected node (null if none)
 * - `focusRefinement` - Boolean indicating refinement input should be focused
 * - `selectNode` - Function to select a node
 * - `deselectNode` - Function to clear selection
 * - `clearRefinementFocus` - Function to clear refinement focus only
 *
 * @example
 * ```tsx
 * function GraphNode({ id }) {
 *   const { selectedNodeId, selectNode } = useNodeSelection();
 *   const isSelected = selectedNodeId === id;
 *
 *   return (
 *     <div
 *       onClick={() => selectNode(id)}
 *       className={isSelected ? 'border-blue-500' : 'border-gray-300'}
 *     >
 *       Node {id}
 *     </div>
 *   );
 * }
 *
 * function RefineButton({ nodeId }) {
 *   const { selectNode } = useNodeSelection();
 *
 *   return (
 *     <button onClick={() => selectNode(nodeId, { focusRefinement: true })}>
 *       Refine
 *     </button>
 *   );
 * }
 * ```
 */
export const useNodeSelection = create<NodeSelectionState>((set) => ({
  selectedNodeId: null,
  focusRefinement: false,
  autoOpened: false,
  selectNode: (id, options) => set({
    selectedNodeId: id,
    focusRefinement: options?.focusRefinement ?? false,
    autoOpened: options?.autoOpened ?? false
  }),
  deselectNode: () => set({ selectedNodeId: null, focusRefinement: false, autoOpened: false }),
  clearRefinementFocus: () => set({ focusRefinement: false }),
}));
