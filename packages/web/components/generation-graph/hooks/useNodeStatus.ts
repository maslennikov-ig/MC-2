import { useRealtimeStatus } from '../contexts/RealtimeStatusContext';
import { NodeStatusEntry } from '@megacampus/shared-types';

/**
 * Hook to retrieve realtime status information for a specific graph node.
 *
 * Provides access to the current status, last update time, and other metadata
 * for a node by its ID. Status data comes from the RealtimeStatusContext which
 * subscribes to live updates during course generation.
 *
 * @param nodeId - Unique identifier of the node (e.g., 'stage_1', 'doc_file_pdf', 'lesson_123')
 * @returns NodeStatusEntry if the node exists in status map, undefined otherwise
 *
 * @example
 * ```tsx
 * function StageNode({ id }) {
 *   const status = useNodeStatus(id);
 *
 *   if (!status) return null;
 *
 *   return (
 *     <div className={status.status === 'active' ? 'bg-blue-500' : 'bg-gray-300'}>
 *       Last updated: {status.lastUpdated.toLocaleTimeString()}
 *     </div>
 *   );
 * }
 * ```
 */
export function useNodeStatus(nodeId: string): NodeStatusEntry | undefined {
  const { nodeStatuses } = useRealtimeStatus();
  return nodeStatuses.get(nodeId);
}
