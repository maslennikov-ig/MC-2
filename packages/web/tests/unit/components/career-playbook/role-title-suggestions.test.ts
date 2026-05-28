import { describe, expect, it } from 'vitest'

import {
  inferRoleDepartmentFromTitle,
  getPopularRoleTitleSuggestions,
  getRoleTitleSuggestionGroups,
  roleTitleSuggestionSourceMetadata,
  roleTitleSuggestions,
  searchRoleTitleSuggestions,
} from '@/components/career-playbook/wizard/role-title-suggestions'

describe('role title suggestions', () => {
  it('returns a broad source-aware ESCO-backed local index with stable ids', () => {
    const uniqueIds = new Set(roleTitleSuggestions.map((suggestion) => suggestion.id))

    expect(roleTitleSuggestions.length).toBeGreaterThanOrEqual(60)
    expect(uniqueIds.size).toBe(roleTitleSuggestions.length)
    expect(
      roleTitleSuggestions.every((suggestion) => (suggestion.source as string) !== 'curated')
    ).toBe(true)
    expect(roleTitleSuggestions.some((suggestion) => suggestion.source === 'esco')).toBe(true)
    expect(roleTitleSuggestions.some((suggestion) => suggestion.source === 'wikidata')).toBe(true)
    expect(roleTitleSuggestions.some((suggestion) => suggestion.source === 'mc2_overlay')).toBe(
      true
    )
    expect(
      roleTitleSuggestions
        .filter((suggestion) => suggestion.source === 'esco')
        .every((suggestion) => Boolean(suggestion.sourceReferences?.escoUri))
    ).toBe(true)
    expect(
      roleTitleSuggestions
        .filter((suggestion) => suggestion.source === 'wikidata')
        .every((suggestion) => Boolean(suggestion.sourceReferences?.wikidataQid))
    ).toBe(true)
  })

  it('documents ESCO version, attribution, and Russian fallback policy', () => {
    expect(roleTitleSuggestionSourceMetadata.esco.version).toBe('v1.2.1')
    expect(roleTitleSuggestionSourceMetadata.esco.lastUpdate).toBe('2025-12-10')
    expect(roleTitleSuggestionSourceMetadata.esco.attribution).toContain('European Commission')
    expect(roleTitleSuggestionSourceMetadata.esco.languages).toContain('en')
    expect(roleTitleSuggestionSourceMetadata.esco.languages).not.toContain('ru')
    expect(roleTitleSuggestionSourceMetadata.esco.ruFallback).toContain('MC2')
  })

  it('documents Wikidata source license and allowlisted import policy', () => {
    expect(roleTitleSuggestionSourceMetadata.wikidata.license).toBe('CC0 1.0')
    expect(roleTitleSuggestionSourceMetadata.wikidata.apiUrl).toContain('wbgetentities')
    expect(roleTitleSuggestionSourceMetadata.wikidata.importPolicy).toContain('allowlist')
  })

  it('uses ESCO-backed records with Russian MC2 fallback labels', () => {
    const salesManager = roleTitleSuggestions.find(
      (suggestion) => suggestion.id === 'sales-manager'
    )

    expect(salesManager?.source).toBe('esco')
    expect(salesManager?.sourceReferences?.escoUri).toBe(
      'http://data.europa.eu/esco/occupation/a7594892-ff23-4e2a-aedf-2f967ebca15c'
    )
    expect(salesManager?.labels.ru).toBe('Менеджер по продажам')
    expect(salesManager?.labels.en).toBe('Sales Manager')
  })

  it('orders popular roles by locale-aware priority and popularity rank', () => {
    const popularRu = getPopularRoleTitleSuggestions('ru', 5)
    const popularEn = getPopularRoleTitleSuggestions('en', 5)

    expect(popularRu.map((suggestion) => suggestion.id)).toContain('product-manager')
    expect(popularRu[0]?.label).toBe('Менеджер продукта')
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
    expect(results[0]?.label).toBe('Владелец продукта')
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

  it('returns allowlisted Wikidata-backed Russian operational roles', () => {
    expect(searchRoleTitleSuggestions('сисадмин', 'ru', 3)[0]?.id).toBe('system-administrator')
    expect(searchRoleTitleSuggestions('администратор базы данных', 'ru', 3)[0]?.id).toBe(
      'database-administrator'
    )
    expect(searchRoleTitleSuggestions('офис менеджер', 'ru', 3)[0]?.id).toBe('office-manager')
    expect(searchRoleTitleSuggestions('секретарь', 'ru', 3)[0]?.id).toBe('secretary')
    expect(searchRoleTitleSuggestions('техподдержка', 'ru', 3)[0]?.id).toBe(
      'technical-support-specialist'
    )
  })

  it('infers a likely department from selected or typed role titles', () => {
    expect(inferRoleDepartmentFromTitle('Менеджер по продажам', 'ru')).toBe('sales')
    expect(inferRoleDepartmentFromTitle('B2C Sales Manager', 'en')).toBe('sales')
    expect(inferRoleDepartmentFromTitle('DevOps Engineer', 'en')).toBe('engineering')
    expect(inferRoleDepartmentFromTitle('Completely unknown title', 'en')).toBeNull()
  })
})
