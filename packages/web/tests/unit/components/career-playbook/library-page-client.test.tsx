import { NextIntlClientProvider } from 'next-intl'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookLibraryPageClient from '@/app/[locale]/career-playbook/library/page-client'

const deleteMany = vi.fn()
const fetchPage = vi.fn()

vi.mock('@/components/career-playbook/library/client-adapter', () => ({
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
}))

const messages = {
  'career-playbook': {
    library: {
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
        publicBadge: 'Public',
        privateBadge: 'Private',
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
    deleteMany.mockReset()
    fetchPage.mockReset()
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
    expect(screen.getByRole('link', { name: 'Create new' })).toHaveAttribute(
      'href',
      '/en/career-playbook/new'
    )

    await user.type(screen.getByPlaceholderText('Search by role title'), 'sales')
    expect(screen.getByText('Head of Sales')).toBeInTheDocument()
    expect(screen.queryByText('DevOps Engineer')).not.toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText('Search by role title'))
    await user.selectOptions(screen.getByLabelText('All statuses'), 'generating')
    expect(screen.queryByText('Head of Sales')).not.toBeInTheDocument()
    expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()
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

    expect(deleteMany).toHaveBeenCalledWith(['pb-1', 'pb-2'], 'en')
    expect(screen.queryByText('Head of Sales')).not.toBeInTheDocument()
    expect(screen.queryByText('DevOps Engineer')).not.toBeInTheDocument()
    expect(screen.getByText('No role guides yet')).toBeInTheDocument()
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
