import { describe, expect, it } from 'vitest'
import {
  getNodeStatusStyles,
  getStatusBorderClass,
  getStatusColor,
  getProgressBarColor,
} from '../useNodeStatusStyles'

describe('useNodeStatusStyles review-aware styling', () => {
  it('styles awaiting nodes as amber review state without active pulse animation', () => {
    expect(getNodeStatusStyles('awaiting', 'lesson')).toContain('border-amber-500')
    expect(getNodeStatusStyles('awaiting', 'lesson')).not.toContain('animate-pulse')
  })

  it('uses amber accents consistently for awaiting minimal nodes and borders', () => {
    expect(getStatusColor('awaiting')).toContain('bg-amber-500')
    expect(getStatusBorderClass('awaiting')).toContain('border-l-amber-500')
    expect(getProgressBarColor('awaiting')).toBe('bg-amber-500')
  })
})
