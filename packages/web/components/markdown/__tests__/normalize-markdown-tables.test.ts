import { describe, it, expect } from 'vitest'
import { normalizeMalformedMarkdownTables } from '@/components/markdown/utils/normalize-markdown-tables'

describe('normalizeMalformedMarkdownTables', () => {
  it('should keep valid markdown tables unchanged', () => {
    const validTable = ['| Name | Role |', '| --- | --- |', '| Ada | Engineer |'].join('\n')

    expect(normalizeMalformedMarkdownTables(validTable)).toBe(validTable)
  })

  it('should normalize malformed table blocks deterministically', () => {
    const malformedTable = ['| Name | Role', '| --- |', '| Ada'].join('\n')

    const normalized = normalizeMalformedMarkdownTables(malformedTable)
    expect(normalized).toBe(['| Name | Role |', '| --- | --- |', '| Ada |  |'].join('\n'))

    // Deterministic and idempotent: running again should produce the same output.
    expect(normalizeMalformedMarkdownTables(normalized)).toBe(normalized)
  })

  it('should merge a broken row when a line has fewer cells than the header (Pattern A)', () => {
    const broken = [
      '| Критерий | Описание | Процент |',
      '| --- | --- | --- |',
      '| Цифровая зрелость | Активные в Teams | 40% |',
      '| "Страдающие',
      '" пользователи | Высокая потребность | 10% |',
    ].join('\n')

    const normalized = normalizeMalformedMarkdownTables(broken)
    expect(normalized).toContain('| "Страдающие" пользователи | Высокая потребность | 10% |')
    expect(normalized).not.toContain('| "Страдающие |')
  })

  it('should replace a broken row with unmatched quote and empty cells (Pattern B)', () => {
    const broken = [
      '| Критерий | Описание | Процент |',
      '| --- | --- | --- |',
      '| Цифровая зрелость | Активные в Teams | 40% |',
      '| "Страдающие |  |  |',
      '"Страдающие" пользователи | Высокая потребность | 10% |',
    ].join('\n')

    const normalized = normalizeMalformedMarkdownTables(broken)
    expect(normalized).toContain('| "Страдающие" пользователи | Высокая потребность | 10% |')
    // The broken fragment should be gone
    const rows = normalized.split('\n')
    const bodyRows = rows.slice(2)
    expect(bodyRows).toHaveLength(2)
  })

  it('should merge a broken row separated by an empty line from its continuation', () => {
    const broken = [
      '| Критерий | Описание | Процент |',
      '| --- | --- | --- |',
      '| Цифровая зрелость | Активные в Teams | 40% |',
      '| "Страдающие |  |  |',
      '',
      '"Страдающие" пользователи | Высокая потребность | 10% |',
    ].join('\n')

    const normalized = normalizeMalformedMarkdownTables(broken)
    expect(normalized).toContain('| "Страдающие" пользователи | Высокая потребность | 10% |')
  })

  it('should not break valid tables when repairing broken rows', () => {
    const valid = [
      '| Name | Role |',
      '| --- | --- |',
      '| "Alice" | Engineer |',
      '| "Bob" | Designer |',
    ].join('\n')

    expect(normalizeMalformedMarkdownTables(valid)).toBe(valid)
  })

  it('should split merged rows when row width is a multiple of header columns', () => {
    const mergedRow = [
      '| Trigger | Goal | Action | Owner |',
      '| :--- | :--- | :--- | :|',
      '| Promotion | Recognition | Public announcement | HRBP | Project end | Contribution | Retro + gift | PM |',
    ].join('\n')

    const normalized = normalizeMalformedMarkdownTables(mergedRow)
    expect(normalized).not.toContain('| :--- | :--- | :--- | :|')
    expect(normalized).toContain('| Promotion | Recognition | Public announcement | HRBP |')
    expect(normalized).toContain('| Project end | Contribution | Retro + gift | PM |')
  })
})
