import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CareerPlaybookViewerSnapshot } from '@megacampus/shared-types'

import { ActionsBar } from '@/components/career-playbook/viewer/ActionsBar'
import { BlockEditor } from '@/components/career-playbook/viewer/BlockEditor'
import { PlaybookViewer } from '@/components/career-playbook/viewer/PlaybookViewer'
import { StreamingView } from '@/components/career-playbook/viewer/StreamingView'
import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  type CareerPlaybookViewerBlock,
} from '@/stores/use-career-playbook-store'

vi.mock('@/components/markdown/MarkdownRendererFull', () => ({
  MarkdownRendererFull: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}))

vi.mock('@/components/markdown/MarkdownRendererClient', () => ({
  MarkdownRendererClient: ({ content }: { content: string }) => (
    <div data-testid="streaming-markdown-renderer">{content}</div>
  ),
}))

const snapshot: CareerPlaybookViewerSnapshot = {
  playbookId: '00000000-0000-4000-8000-000000002001',
  title: 'Head of Sales',
  department: 'Sales',
  level: 'lead',
  contentLanguage: 'en',
  status: 'completed',
  blocks: {
    header: {
      content: '# Head of Sales\n\nRole guide for a revenue leadership role.',
      status: 'generated',
      attempt: 0,
    },
    block_1: {
      content: '## Mission and key results\n\nOwn enterprise revenue growth.',
      status: 'generated',
      attempt: 1,
    },
    block_2: {
      content: '## Anti-goals\n\nDo not optimize vanity pipeline.',
      status: 'generated',
      attempt: 0,
    },
  },
}

function makeBlocks(): CareerPlaybookViewerBlock[] {
  return CAREER_PLAYBOOK_BLOCK_CATALOG.map((block) => ({
    ...block,
    state: snapshot.blocks[block.blockId] ?? {
      content: '',
      status: 'pending',
      attempt: 0,
    },
  }))
}

describe('Career Playbook viewer components', () => {
  it('renders a scan-friendly viewer with actions, table of contents, and markdown blocks', async () => {
    const user = userEvent.setup()
    const handleEdit = vi.fn()
    const handleRegenerate = vi.fn()

    render(
      <PlaybookViewer
        snapshot={snapshot}
        blocks={makeBlocks()}
        onEditBlock={handleEdit}
        onRegenerateBlock={handleRegenerate}
        onPdf={vi.fn()}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Head of Sales' })).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-viewer-shell')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Role guide contents' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create course' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    const missionBlock = screen.getByRole('article', { name: 'Mission and key results' })
    expect(within(missionBlock).getByTestId('markdown-renderer')).toHaveTextContent(
      'Own enterprise revenue growth.'
    )

    await user.click(
      within(missionBlock).getByRole('button', { name: 'Edit Mission and key results' })
    )
    expect(handleEdit).toHaveBeenCalledWith('block_1')

    await user.click(
      within(missionBlock).getByRole('button', { name: 'Regenerate Mission and key results' })
    )
    expect(handleRegenerate).toHaveBeenCalledWith('block_1')
  })

  it('edits markdown and submits regeneration instructions from the block editor sheet', async () => {
    const user = userEvent.setup()
    const handleSave = vi.fn().mockResolvedValue(undefined)
    const handleRegenerate = vi.fn().mockResolvedValue(undefined)

    render(
      <BlockEditor
        open
        block={makeBlocks()[1]}
        isUpdating={false}
        onOpenChange={vi.fn()}
        onSave={handleSave}
        onRegenerate={handleRegenerate}
      />
    )

    await user.clear(screen.getByLabelText('Block markdown'))
    await user.type(screen.getByLabelText('Block markdown'), 'Edited mission text')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(handleSave).toHaveBeenCalledWith('block_1', 'Edited mission text')

    await user.type(screen.getByLabelText('Regeneration instruction'), 'Make it more concrete')
    await user.click(screen.getByRole('button', { name: 'Regenerate block' }))
    expect(handleRegenerate).toHaveBeenCalledWith('block_1', 'Make it more concrete')
  })

  it('keeps unavailable actions visible with a backend-pending status message', async () => {
    const user = userEvent.setup()
    const handlePdf = vi.fn()

    render(
      <ActionsBar
        actionMessage="PDF export is unavailable until the backend action is connected"
        onPdf={handlePdf}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'PDF' }))
    expect(handlePdf).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent(
      'PDF export is unavailable until the backend action is connected'
    )
  })

  it('renders generation progress and toggles the thinking stream', async () => {
    const user = userEvent.setup()
    const handleToggle = vi.fn()

    render(
      <StreamingView
        snapshot={{
          ...snapshot,
          status: 'generating',
          currentGenerationGroup: 'group_2_operations',
          thinkingStream: 'Planner is checking cross-block consistency.',
        }}
        blocks={makeBlocks()}
        showThinkingStream={false}
        onToggleThinkingStream={handleToggle}
      />
    )

    expect(screen.getByRole('heading', { name: 'Generating Head of Sales' })).toBeInTheDocument()
    expect(screen.getByText('3 of 27 blocks ready')).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Show thinking stream' }))
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })
})
