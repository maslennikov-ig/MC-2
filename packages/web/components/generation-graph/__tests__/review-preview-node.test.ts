import { describe, expect, it } from 'vitest'

import { getAwaitingStagePreviewNodeId } from '../review-preview-node'

describe('getAwaitingStagePreviewNodeId', () => {
  it.each([
    [2, 'stage_2'],
    [3, 'stage_3'],
    [4, 'stage_4'],
    [5, 'stage_5'],
    [6, 'stage_6'],
  ])('maps awaiting stage %s to its stage node', (stage, expectedNodeId) => {
    expect(getAwaitingStagePreviewNodeId(stage)).toBe(expectedNodeId)
  })

  it.each([null, 0])('does not open a preview node for %s', (stage) => {
    expect(getAwaitingStagePreviewNodeId(stage)).toBeNull()
  })
})
