import { describe, expect, it } from 'vitest'
import { STAGE6_LAYOUT_CONFIG } from '../layout-constants'

describe('STAGE6_LAYOUT_CONFIG', () => {
  it('reserves enough height for the full collapsed module card', () => {
    expect(STAGE6_LAYOUT_CONFIG.MODULE_COLLAPSED_HEIGHT).toBeGreaterThanOrEqual(180)
  })

  it('keeps visible air between stacked module nodes', () => {
    expect(STAGE6_LAYOUT_CONFIG.MODULE_STACK_GAP).toBeGreaterThanOrEqual(40)
  })
})
