import { describe, expect, it } from 'vitest'
import { WORKFLOW_INITIAL_FIT_OPTIONS, shouldPreserveWorkflowViewport } from '../viewport-guards'

describe('workflow viewport guards', () => {
  it('does not preserve a stale default viewport before the initial layout fit completes', () => {
    expect(
      shouldPreserveWorkflowViewport({
        traceCount: 4,
        isInteracting: false,
        isInitialFitReady: false,
      })
    ).toBe(false)
  })

  it('preserves viewport for trace updates after the workflow is initially fitted', () => {
    expect(
      shouldPreserveWorkflowViewport({
        traceCount: 4,
        isInteracting: false,
        isInitialFitReady: true,
      })
    ).toBe(true)
  })

  it('uses a zoom range that can fit the whole workflow instead of forcing a close crop', () => {
    expect(WORKFLOW_INITIAL_FIT_OPTIONS.minZoom).toBeLessThanOrEqual(0.25)
    expect(WORKFLOW_INITIAL_FIT_OPTIONS.maxZoom).toBeLessThanOrEqual(1)
    expect(WORKFLOW_INITIAL_FIT_OPTIONS.padding).toBeGreaterThanOrEqual(0.18)
  })
})
