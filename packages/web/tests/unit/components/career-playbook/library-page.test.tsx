import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookLibraryPage from '@/app/[locale]/career-playbook/library/page'
import { getCurrentUser } from '@/lib/auth-helpers'
import { getCareerPlaybookLibrary } from '@/app/[locale]/career-playbook/library/data'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(() => (key: string) => key),
  setRequestLocale: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/app/[locale]/career-playbook/library/data', () => ({
  getCareerPlaybookLibrary: vi.fn(),
}))

vi.mock('@/app/[locale]/career-playbook/library/auth-required-client', () => ({
  default: () => (
    <div data-testid="career-playbook-library-auth-required">Authorization Required</div>
  ),
}))

vi.mock('@/app/[locale]/career-playbook/library/page-client', () => ({
  default: ({
    filters,
    initialData,
    locale,
  }: {
    filters: unknown
    initialData: unknown
    locale: string
  }) => (
    <div data-testid="career-playbook-library-page-client">
      <span data-testid="career-playbook-library-locale">{locale}</span>
      <span data-testid="career-playbook-library-filters">{JSON.stringify(filters)}</span>
      <span data-testid="career-playbook-library-initial-data">{JSON.stringify(initialData)}</span>
    </div>
  ),
}))

const mockedGetCurrentUser = vi.mocked(getCurrentUser)
const mockedGetCareerPlaybookLibrary = vi.mocked(getCareerPlaybookLibrary)

describe('CareerPlaybookLibraryPage', () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockReset()
    mockedGetCareerPlaybookLibrary.mockReset()
  })

  it('renders auth-required state for unauthenticated visitors', async () => {
    mockedGetCurrentUser.mockResolvedValue(null)

    render(
      await CareerPlaybookLibraryPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    )

    expect(screen.getByTestId('career-playbook-library-auth-required')).toBeInTheDocument()
    expect(screen.queryByTestId('career-playbook-library-page-client')).not.toBeInTheDocument()
  })

  it('loads authenticated library data and renders page client', async () => {
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'student',
      organizationId: null,
    })

    mockedGetCareerPlaybookLibrary.mockResolvedValue({
      items: [
        {
          id: 'playbook-1',
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
    })

    render(
      await CareerPlaybookLibraryPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    )

    expect(screen.getByTestId('career-playbook-library-page-client')).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-library-locale')).toHaveTextContent('en')
    expect(screen.getByTestId('career-playbook-library-initial-data')).toHaveTextContent(
      '"playbook-1"'
    )
    expect(mockedGetCareerPlaybookLibrary).toHaveBeenCalledWith({
      department: undefined,
      limit: 50,
      level: undefined,
      search: undefined,
      sort: 'created_desc',
      status: undefined,
      userId: 'user-1',
    })
  })

  it('passes catalog filters from search params into the authenticated library query', async () => {
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'student',
      organizationId: null,
    })
    mockedGetCareerPlaybookLibrary.mockResolvedValue({
      items: [],
      nextCursor: null,
      error: null,
    })

    render(
      await CareerPlaybookLibraryPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({
          search: 'sales',
          status: 'completed',
          department: 'sales',
          level: 'lead',
          sort: 'title_asc',
        }),
      })
    )

    expect(mockedGetCareerPlaybookLibrary).toHaveBeenCalledWith({
      department: 'sales',
      limit: 50,
      level: 'lead',
      search: 'sales',
      sort: 'title_asc',
      status: 'completed',
      userId: 'user-1',
    })
    expect(screen.getByTestId('career-playbook-library-filters')).toHaveTextContent('title_asc')
  })
})
