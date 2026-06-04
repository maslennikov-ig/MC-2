import { NextIntlClientProvider } from 'next-intl'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookLibraryPageClient from '@/app/[locale]/career-playbook/library/page-client'
import type { CareerPlaybookLibraryFilters } from '@/components/career-playbook/library/types'

vi.mock('@/components/layouts/header', () => ({
  default: () => <header data-testid="shared-header" />,
}))

const deletePlaybook = vi.fn()
const fetchPage = vi.fn()
const createCourseFromPlaybook = vi.fn()
const toggleShare = vi.fn()
const mockPush = vi.hoisted(() => vi.fn())
const mockSearchParams = vi.hoisted(() => new URLSearchParams())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@/src/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/career-playbook/library/client-adapter', () => ({
  createCourseFromPlaybook: (...args: unknown[]) =>
    createCourseFromPlaybook(
      ...(args as [input: { playbookId: string; includeWebResearch: boolean }])
    ),
  deleteCareerPlaybook: (...args: unknown[]) =>
    deletePlaybook(...(args as [playbookId: string, locale: string])),
  fetchCareerPlaybookLibraryPage: (...args: unknown[]) =>
    fetchPage(
      ...(args as [
        input: {
          locale: string
          cursor?: string | null
          search?: string
          status?: string
          department?: string
          level?: string
          sort?: string
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
      loadMore: 'Load more',
      loadingMore: 'Loading...',
      resultsCount: '{count} of {total}',
      sort: 'Sort',
      sortOptions: {
        created_desc: 'Newest first',
        created_asc: 'Oldest first',
        title_asc: 'Title A-Z',
        title_desc: 'Title Z-A',
      },
      statistics: {
        title: 'Guide statistics',
        total: 'Total guides',
        completed: 'Completed guides',
        inProgress: 'In progress',
        public: 'Public guides',
      },
      card: {
        createCourse: 'Create course',
        publicBadge: 'Public',
        privateBadge: 'Private',
        share: 'Share',
        makePrivate: 'Make private',
        publicLink: 'Public link',
        open: 'Open',
        openBuilder: 'Open constructor',
        delete: 'Delete',
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
        title: 'Delete guide?',
        description: 'This will delete "{title}".',
        cancel: 'Cancel',
        confirm: 'Delete guide',
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
  filters = {
    search: undefined,
    status: undefined,
    department: undefined,
    level: undefined,
    sort: 'created_desc',
  },
  initialData,
}: {
  filters?: CareerPlaybookLibraryFilters
  initialData: Parameters<typeof CareerPlaybookLibraryPageClient>[0]['initialData']
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CareerPlaybookLibraryPageClient locale="en" initialData={initialData} filters={filters} />
    </NextIntlClientProvider>
  )
}

describe('CareerPlaybookLibraryPageClient', () => {
  beforeEach(() => {
    createCourseFromPlaybook.mockReset()
    deletePlaybook.mockReset()
    fetchPage.mockReset()
    mockPush.mockReset()
    toggleShare.mockReset()
    mockSearchParams.forEach((_, key) => mockSearchParams.delete(key))
  })

  it('renders cards, shared catalog filters, statistics, and create CTA', () => {
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
        totalCount: 2,
        statistics: {
          totalCount: 2,
          completedCount: 1,
          inProgressCount: 1,
          publicCount: 1,
        },
        facets: {
          statuses: ['completed', 'generating'],
          departments: ['engineering', 'sales'],
          levels: ['lead', 'senior'],
        },
      },
    })

    expect(screen.getByRole('heading', { name: 'Role Guide library' })).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-library-shell')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create new' })).toHaveAttribute(
      'href',
      '/en/career-playbook/new?fresh=1'
    )
    expect(screen.getByRole('link', { name: 'Open Head of Sales' })).toHaveAttribute(
      'href',
      '/en/career-playbook/pb-1'
    )
    expect(screen.getByText('Guide statistics')).toBeInTheDocument()
    expect(screen.getByText('Total guides')).toBeInTheDocument()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search by role title')).toBeInTheDocument()
    expect(screen.getByText('Head of Sales')).toBeInTheDocument()
    expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()
  })

  it('puts course-style item actions on each card and removes checkbox-only actions', () => {
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

    const card = screen.getByRole('article')

    expect(within(card).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete selected' })).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Open constructor' })).toHaveAttribute(
      'href',
      '/en/career-playbook/new?resume=pb-1'
    )
    expect(within(card).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
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

  it('deletes a guide directly from its card', async () => {
    const user = userEvent.setup()
    deletePlaybook.mockResolvedValue({ deletedId: 'pb-1' })

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
        nextCursor: null,
        error: null,
      },
    })

    await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Delete' }))

    expect(deletePlaybook).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('This will delete "Head of Sales".')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete guide' }))
    expect(deletePlaybook).toHaveBeenCalledWith('pb-1', 'en')
    expect(screen.queryByText('Head of Sales')).not.toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Share' }))

    expect(toggleShare).toHaveBeenCalledWith('pb-1', true, 'en')
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Public link' })).toHaveAttribute(
      'href',
      '/en/share/career-playbook/head-of-sales'
    )
  })

  it('uses server-provided department and level facets for catalog filters', () => {
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
        facets: {
          statuses: ['completed'],
          departments: ['engineering', 'sales'],
          levels: ['lead', 'senior'],
        },
      },
    })

    expect(screen.getByLabelText('Department')).toBeInTheDocument()
    expect(screen.getByLabelText('Level')).toBeInTheDocument()
    expect(screen.getByText('Head of Sales')).toBeInTheDocument()
    expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()
  })

  it('renders localized labels for every library status in loaded cards', () => {
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
      filters: {
        search: 'sales',
        status: 'completed',
        department: 'sales',
        level: 'lead',
        sort: 'title_asc',
      },
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
      search: 'sales',
      status: 'completed',
      department: 'sales',
      level: 'lead',
      sort: 'title_asc',
    })
    expect(await screen.findByText('DevOps Engineer')).toBeInTheDocument()
  })

  it('renders empty and error states', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CareerPlaybookLibraryPageClient
          locale="en"
          initialData={{ items: [], nextCursor: null, error: null }}
          filters={{
            search: undefined,
            status: undefined,
            department: undefined,
            level: undefined,
            sort: 'created_desc',
          }}
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
          filters={{
            search: undefined,
            status: undefined,
            department: undefined,
            level: undefined,
            sort: 'created_desc',
          }}
        />
      </NextIntlClientProvider>
    )

    expect(screen.getByText('Library temporarily unavailable')).toBeInTheDocument()
  })
})
