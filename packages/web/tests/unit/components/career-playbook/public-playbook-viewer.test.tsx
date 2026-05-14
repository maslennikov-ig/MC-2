import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PublicPlaybookViewer } from '@/components/career-playbook/viewer/public-playbook-viewer'

const markdownRenderer = vi.fn(({ content }: { content: string }) => (
  <div data-testid="markdown-renderer">{content}</div>
))

vi.mock('@/components/markdown', () => ({
  MarkdownRenderer: (props: unknown) => markdownRenderer(props as { content: string }),
}))

describe('PublicPlaybookViewer', () => {
  it('renders public markdown as untrusted content', () => {
    render(
      <PublicPlaybookViewer
        title="Head of Sales"
        playbook={{
          id: 'pb-1',
          slug: 'head-of-sales',
          title: 'Head of Sales',
          summary: 'Summary',
          markdown: '# Head of Sales',
          department: 'sales',
          level: 'lead',
          language: 'en',
          createdAt: '2026-05-14T10:00:00.000Z',
        }}
      />
    )

    expect(screen.getByRole('heading', { name: 'Head of Sales' })).toBeInTheDocument()
    expect(markdownRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '# Head of Sales',
        preset: 'preview',
        trusted: false,
      })
    )
  })
})
