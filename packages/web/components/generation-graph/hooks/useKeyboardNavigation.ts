import { useCallback, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useNodeSelection } from './useNodeSelection';

export function useKeyboardNavigation() {
  const { getNodes, getEdges } = useReactFlow();
  const { selectNode, selectedNodeId } = useNodeSelection();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Only handle if not typing in an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (!selectedNodeId) return;

    const nodes = getNodes();
    const edges = getEdges();
    const currentNode = nodes.find(n => n.id === selectedNodeId);

    if (!currentNode) return;

    let nextNodeId: string | undefined;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        // Find target nodes connected from current node
        const outgoingEdges = edges.filter(e => e.source === currentNode.id);
        if (outgoingEdges.length > 0) {
          // Prefer active/pending/completed nodes, or just the first one
          // If multiple, maybe sort by Y position for ArrowDown vs ArrowRight?
          // For simple linear/branching, just taking the first or "main" next is often enough.
          // Let's try to find the "closest" visual node or just the logical next.
          nextNodeId = outgoingEdges[0].target;
        }
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        // Find source nodes connected to current node
        const incomingEdges = edges.filter(e => e.target === currentNode.id);
        if (incomingEdges.length > 0) {
          nextNodeId = incomingEdges[0].source;
        }
        break;
      
      case 'Enter':
        // Open details (handled by click, but ensure it works)
        // Logic for opening drawer is in `useNodeSelection` which calls `selectNode`.
        // If already selected, maybe nothing or focus inside?
        break;
    }

    if (nextNodeId) {
      event.preventDefault();
      selectNode(nextNodeId);
      
      // Optionally fit view to new node? Or rely on auto-pan?
      // React Flow usually handles focus, but we are managing selection state manually.
    }
  }, [getNodes, getEdges, selectedNodeId, selectNode]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
