import { describe, expect, it } from 'vitest'

import { deriveStage5StructuralQualityState } from '@megacampus/shared-types'

function metadata(structure: Record<string, unknown>) {
  return { quality_scores: { structure } }
}

describe('Stage 5 structural quality UI state', () => {
  it.each([
    {
      label: 'critical',
      structure: {
        passed: true,
        hasCriticalIssues: false,
        criticalIssues: [{ code: 'hard_max_lessons_exceeded', message: 'Too many lessons' }],
        warnings: [],
      },
      expected: 'critical',
    },
    {
      label: 'warning',
      structure: {
        passed: true,
        hasCriticalIssues: false,
        criticalIssues: [],
        warnings: [{ code: 'duration_mismatch', message: 'Duration differs' }],
      },
      expected: 'warning',
    },
    {
      label: 'pass',
      structure: {
        passed: true,
        hasCriticalIssues: false,
        criticalIssues: [],
        warnings: [],
      },
      expected: 'pass',
    },
  ])('derives the $label state from backend generation metadata', ({ structure, expected }) => {
    expect(deriveStage5StructuralQualityState(metadata(structure))?.status).toBe(expected)
  })
})
