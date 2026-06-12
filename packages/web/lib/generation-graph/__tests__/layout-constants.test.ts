import { describe, expect, it } from 'vitest'
import { STAGE6_LAYOUT_CONFIG } from '../layout-constants'

describe('STAGE6_LAYOUT_CONFIG', () => {
  it('uses the compact collapsed module card height', () => {
    expect(STAGE6_LAYOUT_CONFIG.MODULE_COLLAPSED_HEIGHT).toBe(90)
  })

  it('keeps visible air between stacked module nodes', () => {
    expect(STAGE6_LAYOUT_CONFIG.MODULE_STACK_GAP).toBeGreaterThanOrEqual(40)
  })
})
