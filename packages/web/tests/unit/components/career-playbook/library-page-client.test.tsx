import { NextIntlClientProvider } from 'next-intl'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookLibraryPageClient from '@/app/[locale]/career-playbook/library/page-client'

vi.mock('@/components/layouts/header', () => ({
  default: () => <header data-testid="shared-header" />,
}))

const deleteMany = vi.fn()
const fetchPage = vi.fn()
const createCourseFromPlaybook = vi.fn()
const toggleShare = vi.fn()

vi.mock('@/components/career-playbook/library/client-adapter', () => ({
  createCourseFromPlaybook: (...args: unknown[]) =>
    createCourseFromPlaybook(
      ...(args as [input: { playbookId: string; includeWebResearch: boolean }])
    ),
  deleteCareerPlaybookMany: (...args: unknown[]) =>
    deleteMany(...(args as [playbookIds: string[], locale: string])),
  fetchCareerPlaybookLibraryPage: (...args: unknown[]) =>
    fetchPage(
      ...(args as [
        input: {
          locale: string
          cursor?: string | null
          search?: string
          limit?: number
        },
      ])
    ),
  toggleCareerPlaybookShare: (...args: unknown[]) =>
    toggleShare(...(args as [playbookId: string, isPublic: boolean, locale: string])),
}))

const messages = {
  'career-playbook': {
    library: {
      productLabel: 'Role Guide',
      title: 'Role Guide library',
      subtitle: 'Your generated and shared role guides',
      searchPlaceholder: 'Search by role title',
      filters: {
        all: 'All statuses',
        completed: 'Completed',
        generating: 'Generating',
        failed: 'Failed',
        department: 'Department',
        departmentAll: 'All departments',
        level: 'Level',
        levelAll: 'All levels',
      },
      createNew: 'Create new',
      emptyTitle: 'No role guides yet',
      emptyDescription: 'Create your first Career Playbook to build your library.',
      errorTitle: 'Library temporarily unavailable',
      errorDescription: 'Retry in a minute or create a new guide.',
      selectedCount: '{count} selected',
      bulkDelete: 'Delete selected',
      deleting: 'Deleting...',
      loadMore: 'Load more',
      loadingMore: 'Loading...',
      card: {
        createCourse: 'Create course',
        publicBadge: 'Public',
        privateBadge: 'Private',
        makePublic: 'Make public',
        makePrivate: 'Make private',
        publicLink: 'Public link',
        open: 'Open',
      },
      statusLabels: {
        draft: 'Draft',
        answering_fixed: 'Answering fixed questions',
        awaiting_followups: 'Awaiting follow-ups',
        answering_followups: 'Answering follow-ups',
        ready_to_generate: 'Ready to generate',
        generating: 'Generating',
        completed: 'Completed',
        failed: 'Failed',
      },
      deleteDialog: {
        title: 'Delete selected guides?',
        description: 'This will delete {count} selected guides.',
        cancel: 'Cancel',
        confirm: 'Delete guides',
      },
      createCourseDialog: {
        title: 'Create course from Role Guide',
        description:
          'Start course generation from this completed Role Guide. You can add materials after the course is created.',
        startWithoutMaterials: 'Start without extra materials',
        addMaterialsLater: 'Materials can be added after course creation if needed.',
        secondaryDisabled: 'Add materials before creation',
        loading: 'Creating course...',
        errorTitle: 'Course creation failed',
        genericError: 'Could not create a course from this Role Guide.',
      },
    },
  },
}

function renderPage({
  initialData,
}: {
  initialData: Parameters<typeof CareerPlaybookLibraryPageClient>[0]['initialData']
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CareerPlaybookLibraryPageClient locale="en" initialData={initialData} />
    </NextIntlClientProvider>
  )
}

describe('CareerPlaybookLibraryPageClient', () => {
  beforeEach(() => {
    createCourseFromPlaybook.mockReset()
    deleteMany.mockReset()
    fetchPage.mockReset()
    toggleShare.mockReset()
  })

  it('renders cards, filters by search/status, and shows create CTA', async () => {
    const user = userEvent.setup()

    renderPage({
      initialData: {
        items: [
          {
            id: 'pb-1',
            title: 'Head of Sales',
            department: 'sales',
            level: 'lead',
            status: 'completed',
            createdAt: '2026-05-14T10:00:00.000Z',
            isPublic: true,
            shareSlug: 'head-of-sales',
          },
          {
            id: 'pb-2',
            title: 'DevOps Engineer',
            department: 'engineering',
            level: 'senior',
            status: 'generating',
            createdAt: '2026-05-12T10:00:00.000Z',
            isPublic: false,
            shareSlug: null,
          },
        ],
        nextCursor: null,
        error: null,
      },
    })

    expect(screen.getByRole('heading', { name: 'Role Guide library' })).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-library-shell')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create new' })).toHaveAttribute(
      'href',
      '/en/career-playbook/new'
    )
    expect(screen.getByRole('link', { name: 'Open Head of Sales' })).toHaveAttribute(
      'href',
      '/en/career-playbook/pb-1'
    )

    await user.type(screen.getByPlaceholderText('Search by role title'), 'sales')
    expect(screen.getByText('Head of Sales')).toBeInTheDocument()
    expect(screen.queryByText('DevOps Engineer')).not.toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText('Search by role title'))
    await user.selectOptions(screen.getByLabelText('All statuses'), 'generating')
    expect(screen.queryByText('Head of Sales')).not.toBeInTheDocument()
    expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()
  })

  it('shows course creation only for completed role guides', () => {
    renderPage({
      initialData: {
        items: [
          {
            id: 'pb-1',
            title: 'Head of Sales',
            department: 'sales',
            level: 'lead',
            status: 'completed',
            createdAt: '2026-05-14T10:00:00.000Z',
            isPublic: true,
            shareSlug: 'head-of-sales',
          },
          {
            id: 'pb-2',
            title: 'DevOps Engineer',
            department: 'engineering',
            level: 'senior',
            status: 'generating',
            createdAt: '2026-05-12T10:00:00.000Z',
            isPublic: false,
            shareSlug: null,
          },
        ],
        nextCursor: null,
        error: null,
      },
    })

    const cards = screen.getAllByRole('article')
    const completedCard = cards.find((card) => within(card).queryByText('Head of Sales'))
    const generatingCard = cards.find((card) => within(card).queryByText('DevOps Engineer'))

    expect(completedCard).toBeDefined()
    expect(generatingCard).toBeDefined()
    expect(
      within(completedCard as HTMLElement).getByRole('button', { name: 'Create course' })
    ).toBeInTheDocument()
    expect(
      within(generatingCard as HTMLElement).queryByRole('button', { name: 'Create course' })
    ).toBeNull()
  })

  it('supports multi-select and bulk delete', async () => {
    const user = userEvent.setup()
    deleteMany.mockResolvedValue({ deletedIds: ['pb-1', 'pb-2'] })

    renderPage({
      initialData: {
        items: [
          {
            id: 'pb-1',
            title: 'Head of Sales',
            department: 'sales',
            level: 'lead',
            status: 'completed',
            createdAt: '2026-05-14T10:00:00.000Z',
            isPublic: true,
            shareSlug: 'head-of-sales',
          },
          {
            id: 'pb-2',
            title: 'DevOps Engineer',
            department: 'engineering',
            level: 'senior',
            status: 'completed',
            createdAt: '2026-05-12T10:00:00.000Z',
            isPublic: false,
            shareSlug: null,
          },
        ],
        nextCursor: null,
        error: null,
      },
    })

    const cards = screen.getAllByRole('article')
    await user.click(within(cards[0]).getByRole('checkbox'))
    await user.click(within(cards[1]).getByRole('checkbox'))

    expect(screen.getByText('2 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    expect(deleteMany).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('This will delete 2 selected guides.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete guides' }))
    expect(deleteMany).toHaveBeenCalledWith(['pb-1', 'pb-2'], 'en')
    expect(screen.queryByText('Head of Sales')).not.toBeInTheDocument()
    expect(screen.queryByText('DevOps Engineer')).not.toBeInTheDocument()
    expect(screen.getByText('No role guides yet')).toBeInTheDocument()
  })

  it('toggles public sharing and exposes the public link from the card', async () => {
    const user = userEvent.setup()
    toggleShare.mockResolvedValue({
      playbookId: 'pb-1',
      isPublic: true,
      shareSlug: 'head-of-sales',
    })

    renderPage({
      initialData: {
        items: [
          {
            id: 'pb-1',
            title: 'Head of Sales',
            department: 'sales',
            level: 'lead',
            status: 'completed',
            createdAt: '2026-05-14T10:00:00.000Z',
            isPublic: false,
            shareSlug: null,
          },
        ],
        nextCursor: null,
        error: null,
      },
    })

    await user.click(screen.getByRole('button', { name: 'Make public' }))

    expect(toggleShare).toHaveBeenCalledWith('pb-1', true, 'en')
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Public link' })).toHaveAttribute(
      'href',
      '/en/share/career-playbook/head-of-sales'
    )
  })

  it('filters by department and level', async () => {
    const user = userEvent.setup()

    renderPage({
      initialData: {
        items: [
          {
            id: 'pb-1',
            title: 'Head of Sales',
            department: 'sales',
            level: 'lead',
            status: 'completed',
            createdAt: '2026-05-14T10:00:00.000Z',
            isPublic: true,
            shareSlug: 'head-of-sales',
          },
          {
            id: 'pb-2',
            title: 'DevOps Engineer',
            department: 'engineering',
            level: 'senior',
            status: 'completed',
            createdAt: '2026-05-12T10:00:00.000Z',
            isPublic: false,
            shareSlug: null,
          },
        ],
        nextCursor: null,
        error: null,
      },
    })

    await user.selectOptions(screen.getByLabelText('Department'), 'engineering')
    expect(screen.queryByText('Head of Sales')).not.toBeInTheDocument()
    expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Department'), 'all')
    await user.selectOptions(screen.getByLabelText('Level'), 'lead')
    expect(screen.getByText('Head of Sales')).toBeInTheDocument()
    expect(screen.queryByText('DevOps Engineer')).not.toBeInTheDocument()
  })

  it('renders localized labels and filters every library status', async () => {
    const user = userEvent.setup()

    renderPage({
      initialData: {
        items: [
          {
            id: 'pb-1',
            title: 'Draft Role',
            department: 'sales',
            level: 'lead',
            status: 'answering_followups',
            createdAt: '2026-05-14T10:00:00.000Z',
            isPublic: false,
            shareSlug: null,
          },
          {
            id: 'pb-2',
            title: 'Ready Role',
            department: 'engineering',
            level: 'senior',
            status: 'ready_to_generate',
            createdAt: '2026-05-12T10:00:00.000Z',
            isPublic: false,
            shareSlug: null,
          },
        ],
        nextCursor: null,
        error: null,
      },
    })

    expect(screen.getAllByText('Answering follow-ups').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ready to generate').length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('All statuses'), 'ready_to_generate')
    expect(screen.queryByText('Draft Role')).not.toBeInTheDocument()
    expect(screen.getByText('Ready Role')).toBeInTheDocument()
  })

  it('loads the next library page when nextCursor is present', async () => {
    const user = userEvent.setup()
    fetchPage.mockResolvedValue({
      items: [
        {
          id: 'pb-2',
          title: 'DevOps Engineer',
          department: 'engineering',
          level: 'senior',
          status: 'completed',
          createdAt: '2026-05-12T10:00:00.000Z',
          isPublic: false,
          shareSlug: null,
        },
      ],
      nextCursor: null,
      error: null,
    })

    renderPage({
      initialData: {
        items: [
          {
            id: 'pb-1',
            title: 'Head of Sales',
            department: 'sales',
            level: 'lead',
            status: 'completed',
            createdAt: '2026-05-14T10:00:00.000Z',
            isPublic: true,
            shareSlug: 'head-of-sales',
          },
        ],
        nextCursor: '2026-05-14T10:00:00.000Z',
        error: null,
      },
    })

    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(fetchPage).toHaveBeenCalledWith({
      locale: 'en',
      cursor: '2026-05-14T10:00:00.000Z',
      limit: 50,
      search: undefined,
    })
    expect(await screen.findByText('DevOps Engineer')).toBeInTheDocument()
  })

  it('renders empty and error states', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CareerPlaybookLibraryPageClient
          locale="en"
          initialData={{ items: [], nextCursor: null, error: null }}
        />
      </NextIntlClientProvider>
    )

    expect(screen.getByText('No role guides yet')).toBeInTheDocument()

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CareerPlaybookLibraryPageClient
          locale="en"
          initialData={{
            items: [],
            nextCursor: null,
            error: 'careerPlaybook.library.list unavailable',
          }}
        />
      </NextIntlClientProvider>
    )

    expect(screen.getByText('Library temporarily unavailable')).toBeInTheDocument()
  })
})
