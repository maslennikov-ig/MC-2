import { render, screen, within } from '@testing-library/react'
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
  MarkdownRendererFull: ({
    content,
    numericFacts,
    onNumericFactClick,
  }: {
    content: string
    numericFacts?: Array<{ id: string; raw_text: string }>
    onNumericFactClick?: (fact: { id: string; raw_text: string }) => void
  }) => (
    <div data-testid="markdown-renderer">
      {content}
      {numericFacts?.map((fact) => (
        <button
          key={fact.id}
          type="button"
          data-testid={`numeric-fact-${fact.id}`}
          onClick={() => onNumericFactClick?.(fact)}
        >
          {fact.raw_text}
        </button>
      ))}
    </div>
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

  it('shows pastel numeric provenance summary and lets owners correct a numeric fact', async () => {
    const user = userEvent.setup()
    const handleUpdateNumericFact = vi.fn().mockResolvedValue(undefined)
    const blocks = makeBlocks()
    const blockSix = blocks.find((block) => block.blockId === 'block_6')
    if (blockSix) {
      blockSix.state = {
        content: '## 6. KPI\n\nWin rate: 18%. Pipeline coverage: 3x.',
        status: 'generated',
        attempt: 1,
        numeric_facts: [
          {
            id: 'block_6-18-percent-0',
            block_id: 'block_6',
            raw_text: '18%',
            normalized_value: '18%',
            status: 'needs_review',
            source: 'model_suggestion',
            confidence: 0.45,
            occurrence_index: 0,
            explanation: 'Точное значение не найдено в источниках.',
          },
          {
            id: 'block_6-3x-0',
            block_id: 'block_6',
            raw_text: '3x',
            normalized_value: '3x',
            status: 'benchmark',
            source: 'web_benchmark',
            confidence: 0.7,
            occurrence_index: 1,
            explanation: 'Benchmark из внешнего исследования.',
          },
        ],
      }
    }

    render(
      <PlaybookViewer
        snapshot={snapshot}
        blocks={blocks}
        copy={ruViewerCopy}
        onEditBlock={vi.fn()}
        onRegenerateBlock={vi.fn()}
        onUpdateNumericFact={handleUpdateNumericFact}
        onPdf={vi.fn()}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
    expect(within(inspector).getByText('Цифры')).toBeInTheDocument()
    expect(within(inspector).getByText('Требует проверки: 1')).toBeInTheDocument()
    expect(within(inspector).getByText('Benchmark: 1')).toBeInTheDocument()
    expect(within(inspector).getByText('2 числовых значения')).toBeInTheDocument()

    await user.click(screen.getByTestId('numeric-fact-block_6-18-percent-0'))
    expect(screen.getByRole('dialog', { name: 'Проверить цифру' })).toBeInTheDocument()
    expect(screen.getByText('Точное значение не найдено в источниках.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Новое значение'))
    await user.type(screen.getByLabelText('Новое значение'), '21%')
    await user.click(screen.getByRole('button', { name: 'Сохранить цифру' }))

    expect(handleUpdateNumericFact).toHaveBeenCalledWith({
      blockId: 'block_6',
      factId: 'block_6-18-percent-0',
      replacementText: '21%',
      scope: 'occurrence',
    })
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
