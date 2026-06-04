import { fireEvent, render, screen } from '@testing-library/react'
import { BookOpen, CheckCircle } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CatalogFilters } from '@/components/catalog/catalog-filters'
import { CatalogGrid } from '@/components/catalog/catalog-grid'
import { CatalogStatistics } from '@/components/catalog/catalog-statistics'

const mockPush = vi.hoisted(() => vi.fn())
const mockSearchParams = vi.hoisted(() => new URLSearchParams())

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@/src/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('catalog primitives', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockSearchParams.forEach((_, key) => mockSearchParams.delete(key))
  })

  it('routes toggle filters through the provided catalog path', () => {
    render(
      <CatalogFilters
        basePath="/career-playbook/library"
        initialSearch=""
        searchPlaceholder="Search role guides"
        loadingLabel="Loading"
        resultsLabel="4 of 12"
        totalCount={12}
        toggles={[
          {
            key: 'public',
            label: 'Public',
            active: false,
            icon: CheckCircle,
          },
        ]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Public' }))

    expect(mockPush).toHaveBeenCalledWith('/career-playbook/library?public=true')
  })

  it('renders reusable statistics with caller-provided icons and labels', () => {
    render(
      <CatalogStatistics
        title="Library stats"
        items={[
          { id: 'total', label: 'Role guides', value: 7, icon: BookOpen, tone: 'purple' },
          { id: 'completed', label: 'Completed', value: 3, icon: CheckCircle, tone: 'green' },
        ]}
      />
    )

    expect(screen.getByText('Library stats')).toBeInTheDocument()
    expect(screen.getByText('Role guides')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('keeps statistic cards compact enough for four metrics on one desktop row', () => {
    render(
      <CatalogStatistics
        title="Library stats"
        items={[
          { id: 'total', label: 'Role guides', value: 7, icon: BookOpen, tone: 'purple' },
          { id: 'completed', label: 'Completed', value: 3, icon: CheckCircle, tone: 'green' },
          { id: 'drafts', label: 'Drafts', value: 2, icon: BookOpen, tone: 'amber' },
          { id: 'public', label: 'Public', value: 1, icon: CheckCircle, tone: 'blue' },
        ]}
      />
    )

    const grid = screen.getByText('Role guides').closest('.grid')

    expect(grid).toHaveClass('grid-cols-[repeat(auto-fit,minmax(12rem,16rem))]')
    expect(grid).not.toHaveClass('lg:grid-cols-3')
  })

  it('renders a shared grid, empty state, and load-more action', () => {
    const handleLoadMore = vi.fn()
    const { rerender } = render(
      <CatalogGrid
        items={[{ id: 'one', title: 'Head of Sales' }]}
        getKey={(item) => item.id}
        renderItem={(item) => <article>{item.title}</article>}
        loadMore={{
          hasMore: true,
          isLoading: false,
          label: 'Load more',
          loadingLabel: 'Loading...',
          onLoadMore: handleLoadMore,
        }}
        emptyState={{
          title: 'Nothing found',
          description: 'Change filters',
        }}
      />
    )

    expect(screen.getByText('Head of Sales')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(handleLoadMore).toHaveBeenCalledTimes(1)

    rerender(
      <CatalogGrid
        items={[]}
        getKey={(item: { id: string }) => item.id}
        renderItem={() => null}
        emptyState={{
          title: 'Nothing found',
          description: 'Change filters',
        }}
      />
    )

    expect(screen.getByText('Nothing found')).toBeInTheDocument()
    expect(screen.getByText('Change filters')).toBeInTheDocument()
  })
})
