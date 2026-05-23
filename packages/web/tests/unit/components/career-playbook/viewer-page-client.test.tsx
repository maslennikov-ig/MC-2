import { NextIntlClientProvider } from 'next-intl'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookViewerPageClient from '@/app/[locale]/career-playbook/[id]/page-client'
import {
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
  type CareerPlaybookClient,
} from '@/stores/use-career-playbook-store'

vi.mock('@/components/layouts/header', () => ({
  default: () => <header data-testid="shared-header" />,
}))

const messages = {
  'career-playbook': {
    viewer: {
      productLabel: 'Career Playbook',
      contents: 'Contents',
      pdf: 'PDF',
      share: 'Share',
      createCourse: 'Create course',
      delete: 'Delete',
      editBlock: 'Edit {title}',
      regenerateBlock: 'Regenerate {title}',
      collapseBlock: 'Collapse {title}',
      expandBlock: 'Expand {title}',
      waitingBlock: 'This block is waiting for generation.',
      editorTitle: 'Edit block',
      editorDescription:
        'Edit the markdown directly, or ask the backend regenerator for a focused rewrite.',
      blockMarkdown: 'Block markdown',
      saveChanges: 'Save changes',
      regenerationInstruction: 'Regeneration instruction',
      regenerationPlaceholder: 'Make this block more specific to enterprise sales.',
      regenerateBlockButton: 'Regenerate block',
      loading: 'Loading Career Playbook...',
      unavailableTitle: 'Career Playbook is unavailable',
      unavailableDescription: 'The viewer could not be loaded.',
      retry: 'Retry',
      viewerBackendPending:
        'Viewer backend is unavailable; showing a local preview until integration lands.',
      localPreviewTitle: 'Role Guide preview',
      localPreviewContent: '# Role Guide preview\n\nBackend viewer transport is not connected yet.',
      sharePending: 'Share links are unavailable until the backend action is connected',
      coursePending: 'Course creation is unavailable until the backend action is connected',
      deletePending: 'Delete is unavailable until the backend action is connected',
      pdfPending: 'PDF export is unavailable until the backend action is connected',
      editLocal: 'Block edit saved locally until the backend action is connected',
      regenerateLocal: 'Block regenerated locally until the backend action is connected',
      generatingTitle: 'Generating {title}',
      blocksReady: '{ready} of {total} blocks ready',
      thinkingStream: 'Show thinking stream',
      streamingBlockPending: 'This block is being generated.',
    },
  },
}

const ruMessages = {
  'career-playbook': {
    viewer: {
      ...messages['career-playbook'].viewer,
      contents: 'Содержание',
      share: 'Поделиться',
      createCourse: 'Создать курс из инструкции',
      delete: 'Удалить',
      localPreviewTitle: 'Превью должностной инструкции',
      localPreviewContent:
        '# Превью должностной инструкции\n\nСерверный просмотр ещё не подключён.',
      viewerBackendPending:
        'Серверный просмотр пока недоступен; показываем локальное превью до подключения интеграции.',
    },
  },
}

function renderPage({
  locale = 'en',
  playbookId = '00000000-0000-4000-8000-000000002001',
}: {
  locale?: 'en' | 'ru'
  playbookId?: string
} = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'ru' ? ruMessages : messages}>
      <CareerPlaybookViewerPageClient locale={locale} playbookId={playbookId} />
    </NextIntlClientProvider>
  )
}

describe('CareerPlaybookViewerPageClient', () => {
  beforeEach(() => {
    useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
    setCareerPlaybookClientForTests(null)
    localStorage.clear()
  })

  it('does not create a local preview for non-skeleton backend failures', async () => {
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockRejectedValue(new Error('FORBIDDEN'))
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Career Playbook is unavailable' })
    ).toBeInTheDocument()
    expect(screen.getByText('FORBIDDEN')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Role Guide preview' })).not.toBeInTheDocument()
  })

  it('creates a localized local preview only for backend-pending skeleton errors', async () => {
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockRejectedValue(new Error('METHOD_NOT_SUPPORTED'))
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    expect(
      await screen.findAllByRole('heading', { name: 'Превью должностной инструкции' })
    ).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Поделиться' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Playbook table of contents' })
    ).toHaveTextContent('Содержание')
  })

  it('clears a previous viewer when the URL points at another playbook', async () => {
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockRejectedValue(new Error('METHOD_NOT_SUPPORTED'))
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })
    useCareerPlaybookStore.getState().hydrateCareerPlaybookViewer({
      playbookId: '00000000-0000-4000-8000-000000002099',
      title: 'Old playbook',
      department: 'Sales',
      level: 'lead',
      contentLanguage: 'en',
      status: 'completed',
      blocks: {
        header: {
          content: '# Old playbook',
          status: 'generated',
          attempt: 0,
        },
      },
    })

    renderPage({ playbookId: '00000000-0000-4000-8000-000000002100' })

    expect(await screen.findAllByRole('heading', { name: 'Role Guide preview' })).not.toHaveLength(
      0
    )
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Old playbook' })).not.toBeInTheDocument()
    })
  })
})
