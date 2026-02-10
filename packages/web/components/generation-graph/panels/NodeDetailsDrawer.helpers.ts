import { TraceAttempt } from '@megacampus/shared-types'

/**
 * Display data interface for node details
 */
export interface DisplayData {
  label?: string
  inputData?: unknown
  outputData?: unknown
  duration?: number
  tokens?: number
  model?: string
  qualityScore?: number
  status?: string
  attempts?: TraceAttempt[]
  attemptNumber?: number
  retryCount?: number
  /** Trace ID for lazy loading full data */
  traceId?: string
}

/**
 * Extract module number from moduleId string (e.g., "module_1" -> 1)
 * @param moduleId - Module ID in format "module_N"
 * @returns Module number or undefined if invalid format
 */
export function extractModuleNumber(moduleId: string): number | undefined {
  const match = moduleId.match(/^module_(\d+)$/)
  return match ? parseInt(match[1], 10) : undefined
}

/**
 * Helper to safely extract qualityScore from lesson content metadata.
 * The metadata is typed as Record<string, unknown> but may contain quality_score field.
 */
export function getQualityScoreFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): number | undefined {
  if (!metadata) return undefined
  // Check for quality_score (snake_case from DB schema)
  if (typeof metadata.quality_score === 'number') return metadata.quality_score
  // Check for qualityScore (camelCase for backward compatibility)
  if (typeof metadata.qualityScore === 'number') return metadata.qualityScore
  return undefined
}
