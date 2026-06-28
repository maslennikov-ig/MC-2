import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactElement } from 'react'
import type {
  CareerPlaybookNumericFact,
  CareerPlaybookViewerSnapshot,
} from '@megacampus/shared-types'

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
    numericFacts?: Array<{ id: string; raw_text: string; status?: string }>
    onNumericFactClick?: (fact: { id: string; raw_text: string; status?: string }) => void
  }) => (
    <div data-testid="markdown-renderer">
      {content}
      {numericFacts?.map((fact) => (
        <button
          key={fact.id}
          type="button"
          id={`career-playbook-numeric-fact-${fact.id}`}
          data-numeric-fact-status={fact.status}
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
  inspectorWarningsTitle: 'Предупреждения качества',
  inspectorWarningsDescription: 'Проверьте проблемные разделы перед публикацией.',
  qualityIssueOpenBlock: 'Открыть блок',
  qualityIssueEditBlock: 'Редактировать',
  qualityIssueRegenerateBlock: 'Перегенерировать',
  qualityIssueSuggestionLabel: 'Что исправить',
  qualityIssueLegacyTitle: 'Системное предупреждение',
  numericFactStatusBenchmark: 'Бенчмарк',
  numericFactStatusNeedsReview: 'Проверить',
  numericFactStatusSuggested: 'Рекомендация',
  numericFactStatusConflict: 'Конфликт',
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

function makeNumericFact(
  id: string,
  overrides: Partial<CareerPlaybookNumericFact> = {}
): CareerPlaybookNumericFact {
  return {
    id,
    block_id: 'block_6',
    raw_text: '18%',
    normalized_value: '18%',
    status: 'needs_review',
    source: 'model_suggestion',
    confidence: 0.45,
    occurrence_index: 0,
    explanation: 'Точное значение не найдено в источниках.',
    ...overrides,
  }
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

  it('renders the generated hero image and exposes owner image regeneration', async () => {
    const user = userEvent.setup()
    const handleRegenerateImage = vi.fn()

    render(
      <PlaybookViewer
        snapshot={{
          ...snapshot,
          imageUrl: 'https://cdn.example.test/career-playbooks/pb-1/card.webp',
          imageAltText: 'Role Guide image: Head of Sales',
          imageStatus: 'completed',
          imageErrorMessage: null,
        }}
        blocks={makeBlocks()}
        copy={ruViewerCopy}
        onEditBlock={vi.fn()}
        onRegenerateBlock={vi.fn()}
        onPdf={vi.fn()}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
        onRegenerateImage={handleRegenerateImage}
      />
    )

    expect(screen.getByAltText('Role Guide image: Head of Sales')).toHaveAttribute(
      'src',
      expect.stringContaining('career-playbooks')
    )

    await user.click(screen.getByRole('button', { name: 'Перегенерировать' }))
    expect(handleRegenerateImage).toHaveBeenCalledTimes(1)
  })

  it('places image status before inspector actions and keeps the right rail scrollable', () => {
    const blocks = makeBlocks()
    const blockSix = blocks.find((block) => block.blockId === 'block_6')
    if (blockSix) {
      blockSix.state = {
        content: '## 6. KPI\n\nWin rate: 18%.',
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
        ],
      }
    }

    render(
      <PlaybookViewer
        snapshot={{
          ...snapshot,
          imageUrl: 'https://cdn.example.test/career-playbooks/pb-1/card.webp',
          imageAltText: 'Role Guide image: Head of Sales',
          imageStatus: 'completed',
        }}
        blocks={blocks}
        copy={ruViewerCopy}
        onEditBlock={vi.fn()}
        onRegenerateBlock={vi.fn()}
        onPdf={vi.fn()}
        onShare={vi.fn()}
        onCreateCourse={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
    const title = within(inspector).getByText('Инспектор документа')
    const imageHeading = within(inspector).getByRole('heading', { name: 'Изображение' })
    const pdfAction = within(inspector).getByRole('button', { name: 'PDF' })
    const numericHeading = within(inspector).getByRole('heading', { name: 'Проверка чисел' })

    expect(inspector).toHaveClass('xl:max-h-[calc(100vh-6rem)]')
    expect(inspector).toHaveClass('xl:overflow-y-auto')
    expect(title.compareDocumentPosition(imageHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(imageHeading.compareDocumentPosition(pdfAction)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(imageHeading.compareDocumentPosition(numericHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
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

  it('does not let the visibility dropdown close focus jump the sticky rails to the top', async () => {
    const user = userEvent.setup()
    const handleVisibilityChange = vi.fn()
    const originalScrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY')
    const originalFocusDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')
    let scrollY = 820

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    })
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      configurable: true,
      value: vi.fn(function focus(this: HTMLElement, options?: FocusOptions) {
        const isVisibilityTrigger = this.getAttribute('aria-label')?.startsWith('Видимость:')
        if (isVisibilityTrigger && !options?.preventScroll) scrollY = 0
      }),
    })

    try {
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

      await user.click(within(inspector).getByRole('button', { name: /Видимость: Приватный/ }))
      scrollY = 820
      await user.click(await screen.findByRole('menuitem', { name: 'Публичный' }))

      expect(handleVisibilityChange).toHaveBeenCalledWith('public')
      expect(window.scrollY).toBe(820)
    } finally {
      if (originalFocusDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'focus', originalFocusDescriptor)
      }
      if (originalScrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', originalScrollYDescriptor)
      }
    }
  })

  it('groups structured quality issues by block and exposes block actions', async () => {
    const user = userEvent.setup()
    const handleEdit = vi.fn()
    const handleRegenerate = vi.fn()

    render(
      <PlaybookViewer
        snapshot={{
          ...snapshot,
          qualityIssues: [
            {
              id: 'judge:block_2:anti-goals',
              source: 'cross_block_judge',
              severity: 'critical',
              blockId: 'block_2',
              title: 'Недостаточно анти-целей',
              message: 'В разделе перечислено только 2 анти-цели.',
              suggestion: 'Добавьте минимум 4 конкретные анти-цели с владельцами.',
              action: 'regenerate',
            },
          ],
        }}
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

    const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
    expect(within(inspector).getByText('Предупреждения качества')).toBeInTheDocument()
    await user.click(within(inspector).getByRole('button', { name: 'Открыть предупреждения' }))

    const detailsDialog = await screen.findByRole('dialog', { name: 'Предупреждения качества' })
    expect(within(detailsDialog).getByText('Что не входит в роль')).toBeInTheDocument()
    expect(within(detailsDialog).getByText('Недостаточно анти-целей')).toBeInTheDocument()
    expect(
      within(detailsDialog).getByText('В разделе перечислено только 2 анти-цели.')
    ).toBeInTheDocument()
    expect(
      within(detailsDialog).getByText('Добавьте минимум 4 конкретные анти-цели с владельцами.')
    ).toBeInTheDocument()

    await user.click(within(detailsDialog).getByRole('button', { name: 'Редактировать' }))
    expect(handleEdit).toHaveBeenCalledWith('block_2')

    await user.click(within(inspector).getByRole('button', { name: 'Открыть предупреждения' }))
    const reopenedDetailsDialog = await screen.findByRole('dialog', {
      name: 'Предупреждения качества',
    })
    await user.click(
      within(reopenedDetailsDialog).getByRole('button', { name: 'Перегенерировать' })
    )
    expect(handleRegenerate).toHaveBeenCalledWith('block_2')
  })

  it('deduplicates structured quality issues and hides internal retry warnings', async () => {
    const user = userEvent.setup()

    render(
      <PlaybookViewer
        snapshot={{
          ...snapshot,
          qualityWarnings: [
            'crossBlockJudge advanced after max regeneration attempts (7/2) for block_4, block_6; unresolved issues remain in judge verdict.',
            'crossBlockJudge degraded to deterministic checks after LLM structured verdict failed: malformed JSON',
          ],
          qualityIssues: [
            {
              id: 'cross_block_judge:block_1:0',
              source: 'cross_block_judge',
              severity: 'critical',
              blockId: 'block_4',
              title: 'Проблема качества блока',
              message: 'Block 4 was restored as fallback content.',
              suggestion: 'Regenerate block 4 with concrete duties.',
              action: 'regenerate',
            },
            {
              id: 'cross_block_judge:block_2:0',
              source: 'cross_block_judge',
              severity: 'critical',
              blockId: 'block_4',
              title: 'Проблема качества блока',
              message: 'Block 4 was restored as fallback content.',
              suggestion: 'Regenerate block 4 with concrete duties.',
              action: 'regenerate',
            },
          ],
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

    const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
    expect(within(inspector).getByText('Критично: 1')).toBeInTheDocument()
    expect(within(inspector).getByText('Предупреждение: 1')).toBeInTheDocument()
    await user.click(within(inspector).getByRole('button', { name: 'Открыть предупреждения' }))

    const detailsDialog = await screen.findByRole('dialog', { name: 'Предупреждения качества' })
    expect(
      within(detailsDialog).getAllByText('Block 4 was restored as fallback content.')
    ).toHaveLength(1)
    expect(
      within(detailsDialog).queryByText(/advanced after max regeneration attempts/)
    ).not.toBeInTheDocument()
    expect(within(detailsDialog).getByText(/degraded to deterministic checks/)).toBeInTheDocument()
  })

  it('still renders legacy generation quality warning strings in the inspector rail', async () => {
    const user = userEvent.setup()

    render(
      <PlaybookViewer
        snapshot={{
          ...snapshot,
          qualityWarnings: [
            'crossBlockJudge degraded to deterministic checks after LLM structured verdict failed',
          ],
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

    const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
    await user.click(within(inspector).getByRole('button', { name: 'Открыть предупреждения' }))

    const detailsDialog = await screen.findByRole('dialog', { name: 'Предупреждения качества' })
    expect(within(detailsDialog).getAllByText('Системное предупреждение').length).toBeGreaterThan(0)
    expect(
      within(detailsDialog).getByText(/crossBlockJudge degraded to deterministic checks/)
    ).toBeInTheDocument()
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
    expect(within(inspector).getByText('Проверка чисел')).toBeInTheDocument()
    expect(
      within(inspector).getByText(
        'Проверьте точные значения перед публикацией: KPI, сроки, бюджеты и проценты.'
      )
    ).toBeInTheDocument()
    expect(within(inspector).getByText('Требует проверки: 1')).toBeInTheDocument()
    expect(within(inspector).getByText('Benchmark: 1')).toBeInTheDocument()
    expect(within(inspector).getByText('2 числовых значения')).toBeInTheDocument()

    await user.click(screen.getByTestId('numeric-fact-block_6-18-percent-0'))
    const editorDialog = screen.getByRole('dialog', { name: 'Проверить цифру' })
    expect(editorDialog).toBeInTheDocument()
    expect(
      within(editorDialog).getByText('Точное значение не найдено в источниках.')
    ).toBeInTheDocument()

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

  it('shows an actionable numeric review list and scrolls to a selected number without opening the editor', async () => {
    const user = userEvent.setup()
    const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView'
    )
    const originalFocusDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')
    const scrollIntoView = vi.fn()
    const focus = vi.fn()
    const blocks = makeBlocks()
    const blockSix = blocks.find((block) => block.blockId === 'block_6')
    if (blockSix) {
      blockSix.state = {
        content: '## 6. KPI\n\nWin rate: 18%. Table row 1 is not a fact.',
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
            id: 'block_6-row-1-0',
            block_id: 'block_6',
            raw_text: '1',
            normalized_value: '1',
            unit: 'count',
            status: 'verified',
            source: 'source_document',
            confidence: 0.9,
            occurrence_index: 0,
            explanation: 'Legacy noisy verified digit.',
          },
        ],
      }
    }

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      configurable: true,
      value: focus,
    })

    try {
      render(
        <PlaybookViewer
          snapshot={snapshot}
          blocks={blocks}
          copy={ruViewerCopy}
          onEditBlock={vi.fn()}
          onRegenerateBlock={vi.fn()}
          onUpdateNumericFact={vi.fn()}
          onPdf={vi.fn()}
          onShare={vi.fn()}
          onCreateCourse={vi.fn()}
          onDelete={vi.fn()}
        />
      )

      const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
      expect(within(inspector).getByText('Проверка чисел')).toBeInTheDocument()
      expect(
        within(inspector).getByText(
          'Проверьте точные значения перед публикацией: KPI, сроки, бюджеты и проценты.'
        )
      ).toBeInTheDocument()
      expect(within(inspector).getByRole('button', { name: /18%/ })).toBeInTheDocument()
      expect(within(inspector).getByText('Проверить')).toBeInTheDocument()
      expect(within(inspector).queryByText('Требует проверки')).not.toBeInTheDocument()
      expect(within(inspector).queryByText('Legacy noisy verified digit.')).not.toBeInTheDocument()
      expect(screen.queryByTestId('numeric-fact-block_6-row-1-0')).not.toBeInTheDocument()

      await user.click(within(inspector).getByRole('button', { name: /18%/ }))

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
      expect(focus).toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: 'Проверить цифру' })).not.toBeInTheDocument()
      expect(window.location.hash).toBe('#block_6')
    } finally {
      if (originalScrollIntoViewDescriptor) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoViewDescriptor)
      } else {
        delete (Element.prototype as Partial<Element>).scrollIntoView
      }
      if (originalFocusDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'focus', originalFocusDescriptor)
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).focus
      }
    }
  })

  it('keeps a long numeric review list bounded while preserving click navigation', async () => {
    const user = userEvent.setup()
    const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView'
    )
    const originalFocusDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')
    const scrollIntoView = vi.fn()
    const focus = vi.fn()
    const blocks = makeBlocks()
    const blockSix = blocks.find((block) => block.blockId === 'block_6')
    const numericFacts = Array.from({ length: 12 }, (_, index) =>
      makeNumericFact(`block_6-metric-${index}-0`, {
        raw_text: `${index + 10}%`,
        normalized_value: `${index + 10}%`,
        occurrence_index: index,
        explanation: `Проверьте метрику ${index + 10}%.`,
      })
    )

    if (blockSix) {
      blockSix.state = {
        content: '## 6. KPI\n\n' + numericFacts.map((fact) => fact.raw_text).join(' '),
        status: 'generated',
        attempt: 1,
        numeric_facts: numericFacts,
      }
    }

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      configurable: true,
      value: focus,
    })

    try {
      render(
        <PlaybookViewer
          snapshot={snapshot}
          blocks={blocks}
          copy={ruViewerCopy}
          onEditBlock={vi.fn()}
          onRegenerateBlock={vi.fn()}
          onUpdateNumericFact={vi.fn()}
          onPdf={vi.fn()}
          onShare={vi.fn()}
          onCreateCourse={vi.fn()}
          onDelete={vi.fn()}
        />
      )

      const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
      const reviewList = within(inspector).getByTestId('career-playbook-numeric-review-list')
      expect(reviewList).toHaveClass('max-h-80')
      expect(reviewList).toHaveClass('overflow-y-auto')
      expect(within(reviewList).getAllByRole('button')).toHaveLength(12)

      await user.click(within(reviewList).getByRole('button', { name: /21%/ }))

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
      expect(focus).toHaveBeenCalled()
      expect(window.location.hash).toBe('#block_6')
    } finally {
      if (originalScrollIntoViewDescriptor) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoViewDescriptor)
      } else {
        delete (Element.prototype as Partial<Element>).scrollIntoView
      }
      if (originalFocusDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'focus', originalFocusDescriptor)
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).focus
      }
    }
  })

  it('expands a collapsed block before scrolling to a numeric review item', async () => {
    const user = userEvent.setup()
    const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView'
    )
    const originalFocusDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')
    const scrollIntoView = vi.fn()
    const focus = vi.fn()
    const blocks = makeBlocks()
    const blockSix = blocks.find((block) => block.blockId === 'block_6')
    if (blockSix) {
      blockSix.state = {
        content: '## 6. KPI\n\nWin rate: 18%.',
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
        ],
      }
    }

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      configurable: true,
      value: focus,
    })

    try {
      render(
        <PlaybookViewer
          snapshot={snapshot}
          blocks={blocks}
          copy={ruViewerCopy}
          onEditBlock={vi.fn()}
          onRegenerateBlock={vi.fn()}
          onUpdateNumericFact={vi.fn()}
          onPdf={vi.fn()}
          onShare={vi.fn()}
          onCreateCourse={vi.fn()}
          onDelete={vi.fn()}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Свернуть Показатели эффективности' }))
      expect(screen.queryByTestId('numeric-fact-block_6-18-percent-0')).not.toBeInTheDocument()

      const inspector = screen.getByRole('complementary', { name: 'Инспектор документа' })
      await user.click(within(inspector).getByRole('button', { name: /18%/ }))

      await waitFor(() => {
        expect(screen.getByTestId('numeric-fact-block_6-18-percent-0')).toBeInTheDocument()
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
        expect(focus).toHaveBeenCalled()
      })
    } finally {
      if (originalScrollIntoViewDescriptor) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoViewDescriptor)
      } else {
        delete (Element.prototype as Partial<Element>).scrollIntoView
      }
      if (originalFocusDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'focus', originalFocusDescriptor)
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).focus
      }
    }
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
