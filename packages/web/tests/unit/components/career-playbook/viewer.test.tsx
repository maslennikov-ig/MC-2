import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactElement } from 'react'
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
  visibility: 'private',
  ownerId: 'owner-user',
  viewerPermissions: {
    canEdit: true,
    canManageVisibility: true,
    canCreateCourse: true,
    canDelete: true,
  },
  blocks: {
    header: {
      content:
        '# Header\n\n**Должность:** Руководитель продаж\n\n**Отдел:** Продажи\n\n**Подчиняется:** Коммерческому директору',
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

const ruViewerCopy = {
  productLabel: 'Должностная инструкция',
  contents: 'Содержание',
  contentsAriaLabel: 'Содержание должностной инструкции',
  waitingBlock: 'Этот блок ожидает генерации.',
  statusLabel: () => 'Готово',
  blockStatusLabel: () => 'Готово',
  editBlock: (title: string) => `Редактировать ${title}`,
  regenerateBlock: (title: string) => `Сгенерировать заново ${title}`,
  collapseBlock: (title: string) => `Свернуть ${title}`,
  expandBlock: (title: string) => `Развернуть ${title}`,
  hideContents: 'Скрыть левую панель',
  showContents: 'Показать левую панель',
  hideInspector: 'Скрыть правый блок',
  showInspector: 'Показать правый блок',
  readingMode: 'Режим чтения',
  exitReadingMode: 'Выйти из режима чтения',
  inspectorLabel: 'Инспектор документа',
  inspectorTitle: 'Инспектор документа',
  visibilityLabel: 'Видимость',
  visibilityValueLabel: (visibility: string) =>
    visibility === 'organization'
      ? 'Для организации'
      : visibility === 'public'
        ? 'Публичный'
        : 'Приватный',
  actions: {
    actionsLabel: 'Действия с должностной инструкцией',
    pdf: 'PDF',
    share: 'Поделиться',
    createCourse: 'Создать курс из инструкции',
    delete: 'Удалить',
  },
}

const PlaybookViewerWithVisibility = PlaybookViewer as unknown as (
  props: ComponentProps<typeof PlaybookViewer> & {
    isUpdatingVisibility?: boolean
    onVisibilityChange?: (visibility: 'private' | 'organization' | 'public') => void
  }
) => ReactElement

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
  beforeEach(() => {
    window.history.replaceState(null, '', '/career-playbook/00000000-0000-4000-8000-000000002001')
  })

  it('renders a scan-friendly viewer with actions, table of contents, and markdown blocks', async () => {
    const user = userEvent.setup()
    const handleEdit = vi.fn()
    const handleRegenerate = vi.fn()

    render(
      <PlaybookViewer
        snapshot={snapshot}
        blocks={makeBlocks()}
        copy={ruViewerCopy}
        onEditBlock={handleEdit}
        onRegenerateBlock={handleRegenerate}
        onPdf={vi.fn()}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Head of Sales' })).toBeInTheDocument()
    expect(screen.getAllByText('Head of Sales')).toHaveLength(2)
    expect(screen.getByTestId('career-playbook-viewer-shell')).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Содержание должностной инструкции' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Поделиться' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать курс из инструкции' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Инспектор документа' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Шапка документа' })).toBeInTheDocument()
    expect(screen.queryByText(/^# Header/)).not.toBeInTheDocument()
    expect(screen.queryByText('Foundation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Anti-goals' })).not.toBeInTheDocument()

    const missionBlock = screen.getByRole('article', { name: 'Миссия и ключевые результаты' })
    expect(within(missionBlock).getByTestId('markdown-renderer')).toHaveTextContent(
      'Own enterprise revenue growth.'
    )

    await user.click(
      within(missionBlock).getByRole('button', {
        name: 'Редактировать Миссия и ключевые результаты',
      })
    )
    expect(handleEdit).toHaveBeenCalledWith('block_1')

    await user.click(
      within(missionBlock).getByRole('button', {
        name: 'Сгенерировать заново Миссия и ключевые результаты',
      })
    )
    expect(handleRegenerate).toHaveBeenCalledWith('block_1')

    const antiGoalsBlock = screen.getByRole('article', { name: 'Что не входит в роль' })
    expect(within(antiGoalsBlock).getByTestId('markdown-renderer')).toHaveTextContent('Anti-goals')
  })

  it('highlights and scrolls the active contents item as document blocks enter the viewport', async () => {
    const originalIntersectionObserver = globalThis.IntersectionObserver
    const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView'
    )
    const scrollIntoView = vi.fn()
    let observerCallback: IntersectionObserverCallback | null = null

    class TestIntersectionObserver implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = ''
      readonly thresholds: ReadonlyArray<number> = []

      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback
      }

      disconnect = vi.fn()
      observe = vi.fn()
      takeRecords = vi.fn(() => [])
      unobserve = vi.fn()
    }

    globalThis.IntersectionObserver =
      TestIntersectionObserver as unknown as typeof IntersectionObserver
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    try {
      render(
        <PlaybookViewer
          snapshot={snapshot}
          blocks={makeBlocks()}
          copy={ruViewerCopy}
          onEditBlock={vi.fn()}
          onRegenerateBlock={vi.fn()}
          onPdf={vi.fn()}
          onShare={vi.fn()}
          onCreateCourse={vi.fn()}
          onDelete={vi.fn()}
        />
      )

      const contents = screen.getByRole('navigation', {
        name: 'Содержание должностной инструкции',
      })
      const missionLink = within(contents).getByRole('link', {
        name: 'Миссия и ключевые результаты',
      })
      const missionBlock = screen.getByRole('article', {
        name: 'Миссия и ключевые результаты',
      })

      await waitFor(() => expect(observerCallback).not.toBeNull())

      act(() => {
        observerCallback?.(
          [
            {
              target: missionBlock,
              isIntersecting: true,
              intersectionRatio: 0.75,
            } as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver
        )
      })

      expect(missionLink).toHaveAttribute('aria-current', 'true')
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    } finally {
      globalThis.IntersectionObserver = originalIntersectionObserver
      if (originalScrollIntoViewDescriptor) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoViewDescriptor)
      } else {
        delete (Element.prototype as Partial<Element>).scrollIntoView
      }
    }
  })

  it('hides side panels independently and switches to reading mode', async () => {
    const user = userEvent.setup()
    window.history.replaceState(
      null,
      '',
      '/career-playbook/00000000-0000-4000-8000-000000002001#block_1'
    )

    render(
      <PlaybookViewer
        snapshot={snapshot}
        blocks={makeBlocks()}
        copy={ruViewerCopy}
        onEditBlock={vi.fn()}
        onRegenerateBlock={vi.fn()}
        onPdf={vi.fn()}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const leftPanelButton = screen.getByRole('button', { name: 'Скрыть левую панель' })
    expect(leftPanelButton).toHaveAttribute('aria-expanded', 'true')
    await user.click(leftPanelButton)
    expect(
      screen.queryByRole('navigation', { name: 'Содержание должностной инструкции' })
    ).not.toBeInTheDocument()
    expect(window.location.search).toContain('toc=closed')
    expect(window.location.hash).toBe('#block_1')

    const rightPanelButton = screen.getByRole('button', { name: 'Скрыть правый блок' })
    expect(rightPanelButton).toHaveAttribute('aria-expanded', 'true')
    await user.click(rightPanelButton)
    expect(
      screen.queryByRole('complementary', { name: 'Инспектор документа' })
    ).not.toBeInTheDocument()
    expect(window.location.search).toContain('panel=closed')

    await user.click(screen.getByRole('button', { name: 'Режим чтения' }))
    expect(screen.getByTestId('career-playbook-viewer-shell')).toHaveAttribute(
      'data-mode',
      'reading'
    )
    expect(screen.queryByRole('button', { name: 'Показать левую панель' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Показать правый блок' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти из режима чтения' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Head of Sales', level: 1 })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Редактировать Шапка документа' })
    ).not.toBeInTheDocument()
    expect(window.location.search).toContain('mode=reading')
    expect(window.location.hash).toBe('#block_1')
  })

  it('lets the owner update document visibility from the right inspector', async () => {
    const user = userEvent.setup()
    const handleVisibilityChange = vi.fn()

    render(
      <PlaybookViewerWithVisibility
        snapshot={snapshot}
        blocks={makeBlocks()}
        copy={ruViewerCopy}
        onVisibilityChange={handleVisibilityChange}
        onEditBlock={vi.fn()}
        onRegenerateBlock={vi.fn()}
        onPdf={vi.fn()}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
    expect(within(inspector).getByText('Видимость')).toBeInTheDocument()

    await user.click(within(inspector).getByRole('button', { name: /Видимость: Приватный/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Для организации' }))

    expect(handleVisibilityChange).toHaveBeenCalledWith('organization')
  })

  it('renders organization readers without the owner management layer', () => {
    render(
      <PlaybookViewer
        snapshot={{
          ...snapshot,
          visibility: 'organization',
          ownerId: 'other-user',
          viewerPermissions: {
            canEdit: false,
            canManageVisibility: false,
            canCreateCourse: false,
            canDelete: false,
          },
        }}
        blocks={makeBlocks()}
        copy={ruViewerCopy}
        onEditBlock={vi.fn()}
        onRegenerateBlock={vi.fn()}
        onPdf={vi.fn()}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Head of Sales' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Содержание должностной инструкции' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('complementary', { name: 'Инспектор документа' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Поделиться' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Создать курс из инструкции' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Редактировать Миссия и ключевые результаты' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Сгенерировать заново Миссия и ключевые результаты' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Показать правый блок' })).not.toBeInTheDocument()
    expect(screen.queryByText('Видимость')).not.toBeInTheDocument()
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
