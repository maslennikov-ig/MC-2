import { describe, expect, it } from 'vitest'

import { getCareerPlaybookNumericFactDomId } from '@/lib/career-playbook/numeric-facts'

describe('Career Playbook numeric fact helpers', () => {
  it('builds the stable inline DOM id used by viewer navigation and markdown rendering', () => {
    expect(getCareerPlaybookNumericFactDomId('block_6:18 percent/0')).toBe(
      'career-playbook-numeric-fact-block_6-18-percent-0'
    )
  })
})
