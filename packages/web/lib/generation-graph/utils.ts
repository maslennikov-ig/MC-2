import { NodeStatus } from '@megacampus/shared-types';

/**
 * Stage progress configuration
 * Defines the weight of each stage in the overall progress
 */
interface StageProgressConfig {
  stageNumber: number;
  /** Weight when stage is active (in progress) */
  activeWeight: number;
  /** Weight when stage is completed */
  completedWeight: number;
  /** Whether this stage requires documents */
  requiresDocuments: boolean;
}

/**
 * All stages with their progress weights
 * Weights are normalized based on active stages
 */
const STAGE_PROGRESS_CONFIG: StageProgressConfig[] = [
  { stageNumber: 1, activeWeight: 0, completedWeight: 5, requiresDocuments: false },
  { stageNumber: 2, activeWeight: 5, completedWeight: 15, requiresDocuments: true },
  { stageNumber: 3, activeWeight: 15, completedWeight: 25, requiresDocuments: true },
  { stageNumber: 4, activeWeight: 25, completedWeight: 40, requiresDocuments: false },
  { stageNumber: 5, activeWeight: 40, completedWeight: 60, requiresDocuments: false },
  { stageNumber: 6, activeWeight: 60, completedWeight: 100, requiresDocuments: false },
];

/**
 * Calculate overall progress percentage based on current status and configuration
 *
 * @param status - Current pipeline status
 * @param hasDocuments - Whether the course has documents (affects active stages)
 * @returns Progress percentage (0-100)
 */
export function calculateProgress(status: string | null, hasDocuments: boolean): number {
  if (!status) return 0;
  if (status === 'completed') return 100;
  if (status === 'failed' || status === 'cancelled') return 0;

  const currentStage = getStageFromStatus(status);
  if (currentStage === null) return 0;

  // Get active stages based on hasDocuments
  const activeStages = STAGE_PROGRESS_CONFIG.filter(
    stage => !stage.requiresDocuments || hasDocuments
  );

  // Calculate progress based on current stage
  const isAwaiting = status.includes('awaiting_approval');
  const isComplete = status.includes('_complete') && !isAwaiting;

  let rawProgress = 0;

  for (const stage of activeStages) {
    if (stage.stageNumber < currentStage) {
      // Completed stages
      rawProgress = stage.completedWeight;
    } else if (stage.stageNumber === currentStage) {
      if (isComplete || isAwaiting) {
        // Current stage is complete or awaiting
        rawProgress = stage.completedWeight;
      } else {
        // Current stage is in progress
        rawProgress = stage.activeWeight;
      }
      break;
    }
  }

  // Normalize progress if documents are skipped
  // When no documents, stages 2,3 are skipped, so we need to remap progress
  if (!hasDocuments) {
    // Remap progress: skip stages 2,3 weights
    // Stage 1: 0-5% → 0-8%
    // Stage 4: 25-40% → 8-40%
    // Stage 5: 40-60% → 40-65%
    // Stage 6: 60-100% → 65-100%
    const remappedProgress = remapProgressWithoutDocuments(rawProgress);
    return Math.round(remappedProgress);
  }

  return Math.round(rawProgress);
}

/**
 * Remap progress when documents are skipped (stages 2,3 not used)
 */
function remapProgressWithoutDocuments(rawProgress: number): number {
  // Original stages with docs: 1(5), 2(15), 3(25), 4(40), 5(60), 6(100)
  // Without docs: 1(5) → 4(40) → 5(60) → 6(100)
  // We want to spread the progress evenly across active stages

  if (rawProgress <= 5) {
    // Stage 1: 0-5% → 0-15% (stage 1 takes more relative weight)
    return (rawProgress / 5) * 15;
  } else if (rawProgress <= 40) {
    // Stage 4: 25-40% in original → 15-45% in remapped
    // But we're jumping from 5 to 25 in original, so handle 5-40 range
    return 15 + ((rawProgress - 5) / 35) * 30;
  } else if (rawProgress <= 60) {
    // Stage 5: 40-60% → 45-70%
    return 45 + ((rawProgress - 40) / 20) * 25;
  } else {
    // Stage 6: 60-100% → 70-100%
    return 70 + ((rawProgress - 60) / 40) * 30;
  }
}

/**
 * Extract stage number from status string
 */
export function getStageFromStatus(status: string): number | null {
  if (!status) return null;
  if (status.includes('stage_1') || status === 'initializing' || status === 'pending' || status === 'queued') return 1;
  if (status.includes('stage_2') || status === 'processing_documents') return 2;
  if (status.includes('stage_3') || status === 'classifying') return 3;
  if (status.includes('stage_4') || status === 'analyzing_task') return 4;
  if (status.includes('stage_5') || status === 'generating_structure') return 5;
  if (status.includes('stage_6') || status === 'generating_content') return 6;
  if (status === 'completed') return 6; // All done, all stages complete
  return null;
}

/**
 * Check if status indicates awaiting approval
 * Returns stage number (0 for pending/initial start, 3/4/5 for approval stages)
 */
export function isAwaitingApproval(status: string): number | null {
  if (!status) return null;
  // Stage 0: Course created but generation not yet started
  if (status === 'pending') return 0;
  const match = status.match(/stage_(\d+)_awaiting_approval/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Map pipeline status to node status
 *
 * @param stageNumber - Stage number being mapped
 * @param currentStage - Current active stage
 * @param overallStatus - Pipeline status (e.g., 'failed', 'stage_4_analyzing')
 * @param hasError - Whether pipeline has failed
 * @param awaitingStage - Stage awaiting approval (if any)
 * @param failedAtStage - Stage where failure occurred (from courses.failed_at_stage)
 */
export function mapStatusToNodeStatus(
  stageNumber: number,
  currentStage: number | null,
  overallStatus: string,
  hasError: boolean,
  awaitingStage: number | null,
  failedAtStage?: number | null
): NodeStatus {
  // Show error ONLY on the specific stage that failed
  if (hasError && failedAtStage !== undefined && failedAtStage !== null) {
    if (failedAtStage === stageNumber) {
      return 'error';
    }
    // For stages before the failed one - show completed
    if (stageNumber < failedAtStage) {
      return 'completed';
    }
    // For stages after the failed one - show pending
    return 'pending';
  }

  // Legacy fallback: if no failedAtStage, show error on currentStage only
  if (hasError && currentStage !== null) {
    if (currentStage === stageNumber) return 'error';
    if (stageNumber < currentStage) return 'completed';
    return 'pending';
  }

  // If failed but we don't know where OR no currentStage, show last known stage as error
  // This is a safety fallback - in practice failedAtStage should always be set
  if (hasError) {
    // Without any stage info, default to pending (better than all red)
    return 'pending';
  }

  if (awaitingStage === stageNumber) return 'awaiting';

  if (overallStatus === 'completed') return 'completed';

  if (!currentStage) return 'pending';

  // Check if this specific stage is marked as complete in the status
  // e.g., "stage_5_complete" means stage 5 is completed, not active
  if (overallStatus.includes(`stage_${stageNumber}_complete`)) return 'completed';

  if (currentStage > stageNumber) return 'completed';
  if (currentStage === stageNumber) return 'active';

  return 'pending';
}

/**
 * Node ID patterns for graph elements
 */
export const NODE_ID_PATTERNS = {
  /** Matches document node IDs like "doc_abc-123" or "doc-abc-123" */
  DOCUMENT: /^doc[-_]([a-f0-9-]{36})$/i,
  /** Matches stage node IDs like "stage_3" */
  STAGE: /^stage_(\d+)$/,
} as const;

/**
 * Extract document UUID from a node ID
 *
 * @param nodeId - Node ID in format "doc_<uuid>" or "doc-<uuid>"
 * @returns The UUID part, or null if not a valid document node ID
 *
 * @example
 * extractDocumentUUID('doc_550e8400-e29b-41d4-a716-446655440000') // returns '550e8400-e29b-41d4-a716-446655440000'
 * extractDocumentUUID('stage_3') // returns null
 */
export function extractDocumentUUID(nodeId: string): string | null {
  const match = nodeId.match(NODE_ID_PATTERNS.DOCUMENT);
  return match?.[1] || null;
}

/**
 * Extract stage number from a node ID
 *
 * @param nodeId - Node ID in format "stage_<number>"
 * @returns The stage number, or null if not a valid stage node ID
 */
export function extractStageNumber(nodeId: string): number | null {
  const match = nodeId.match(NODE_ID_PATTERNS.STAGE);
  return match ? parseInt(match[1], 10) : null;
}
