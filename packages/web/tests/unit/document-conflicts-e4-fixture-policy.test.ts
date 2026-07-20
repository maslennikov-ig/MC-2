import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('E4 browser fixture policy', () => {
  it('redirects in production and declares synthetic-only content', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(mocks)/mocks/document-conflicts-e4/page.tsx'),
      'utf8'
    )

    expect(source).toContain("process.env.NODE_ENV === 'production'")
    expect(source).toContain("redirect('/')")
    expect(source).toContain('Synthetic content only')
    expect(source).toContain('<ClarifyingPanel')
    expect(source).toContain('<TRPCProvider>')
    expect(source).not.toContain('<QuestionCard')
    expect(source).not.toContain('setAnswer')
    expect(source).not.toContain('dangerouslySetInnerHTML')
  })
})
