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
})
