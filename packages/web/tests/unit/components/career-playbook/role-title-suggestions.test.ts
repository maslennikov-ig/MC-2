import { describe, expect, it } from 'vitest'

import {
  inferRoleDepartmentFromTitle,
  getPopularRoleTitleSuggestions,
  getRoleTitleSuggestionGroups,
  roleTitleSuggestions,
  searchRoleTitleSuggestions,
} from '@/components/career-playbook/wizard/role-title-suggestions'

describe('role title suggestions', () => {
  it('returns a broad source-aware local index with stable ids', () => {
    const uniqueIds = new Set(roleTitleSuggestions.map((suggestion) => suggestion.id))

    expect(roleTitleSuggestions.length).toBeGreaterThanOrEqual(60)
    expect(uniqueIds.size).toBe(roleTitleSuggestions.length)
    expect(
      roleTitleSuggestions.every((suggestion) => (suggestion.source as string) !== 'curated')
    ).toBe(true)
    expect(roleTitleSuggestions.some((suggestion) => suggestion.source === 'mc2_overlay')).toBe(
      true
    )
  })

  it('orders popular roles by locale-aware priority and popularity rank', () => {
    const popularRu = getPopularRoleTitleSuggestions('ru', 5)
    const popularEn = getPopularRoleTitleSuggestions('en', 5)

    expect(popularRu.map((suggestion) => suggestion.id)).toContain('product-manager')
    expect(popularEn[0]?.label).toBe('Product Manager')
    expect(popularRu[0]?.departmentLabel).toBe('Продукт')
    expect(popularEn[0]?.departmentLabel).toBe('Product')
  })

  it('ranks acronyms, aliases, and localized labels before loose keyword matches', () => {
    const pmResults = searchRoleTitleSuggestions('pm', 'en', 6)
    const developerResults = searchRoleTitleSuggestions('разраб', 'ru', 6)

    expect(pmResults[0]?.id).toBe('product-manager')
    expect(pmResults.some((suggestion) => suggestion.id === 'project-manager')).toBe(true)
    expect(developerResults[0]?.department).toBe('engineering')
    expect(developerResults[0]?.matchKind).toMatch(/alias|keyword|label/)
  })

  it('supports alternate-language lookup while keeping current-locale labels', () => {
    const results = searchRoleTitleSuggestions('product owner', 'ru', 4)

    expect(results[0]?.id).toBe('product-owner')
    expect(results[0]?.label).toBe('Product Owner')
    expect(results[0]?.departmentLabel).toBe('Продукт')
    expect(results[0]?.alternateLabel).toBe('Product Owner')
  })

  it('groups search results by department in first-seen order', () => {
    const results = searchRoleTitleSuggestions('manager', 'en', 12)
    const groups = getRoleTitleSuggestionGroups(results)

    expect(groups.length).toBeGreaterThan(1)
    expect(groups[0]?.departmentLabel).toBe(results[0]?.departmentLabel)
    groups.forEach((group) => {
      expect(group.suggestions).toEqual(
        results.filter((suggestion) => suggestion.department === group.department)
      )
    })
  })

  it('does not over-normalize generic Russian sales manager queries to only B2B', () => {
    const results = searchRoleTitleSuggestions('менеджер по продажам', 'ru', 10)
    const ids = results.map((suggestion) => suggestion.id)

    expect(ids[0]).toBe('sales-manager')
    expect(ids).toContain('b2c-sales-manager')
    expect(ids).toContain('retail-sales-manager')
    expect(ids).toContain('channel-sales-manager')
    expect(ids).toContain('b2b-sales-manager')
    expect(
      results.filter((suggestion) => suggestion.department === 'sales').length
    ).toBeGreaterThan(4)
  })

  it('infers a likely department from selected or typed role titles', () => {
    expect(inferRoleDepartmentFromTitle('Менеджер по продажам', 'ru')).toBe('sales')
    expect(inferRoleDepartmentFromTitle('B2C Sales Manager', 'en')).toBe('sales')
    expect(inferRoleDepartmentFromTitle('DevOps Engineer', 'en')).toBe('engineering')
    expect(inferRoleDepartmentFromTitle('Completely unknown title', 'en')).toBeNull()
  })
})
