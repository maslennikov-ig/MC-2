import { VisualStyle } from '@megacampus/shared-types'

/**
 * Type guard for validating VisualStyle data from database JSON.
 * Ensures all 4 required string fields are present before use.
 */
export function isVisualStyle(data: unknown): data is VisualStyle {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.colorScheme === 'string' &&
    typeof d.aesthetic === 'string' &&
    typeof d.visualElements === 'string' &&
    typeof d.mood === 'string'
  )
}
