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
  default: ({ locale, initialData }: { locale: string; initialData: unknown }) => (
    <div data-testid="career-playbook-library-page-client">
      <span data-testid="career-playbook-library-locale">{locale}</span>
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

    render(await CareerPlaybookLibraryPage({ params: Promise.resolve({ locale: 'en' }) }))

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

    render(await CareerPlaybookLibraryPage({ params: Promise.resolve({ locale: 'en' }) }))

    expect(screen.getByTestId('career-playbook-library-page-client')).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-library-locale')).toHaveTextContent('en')
    expect(screen.getByTestId('career-playbook-library-initial-data')).toHaveTextContent(
      '"playbook-1"'
    )
    expect(mockedGetCareerPlaybookLibrary).toHaveBeenCalledWith({
      limit: 50,
      search: undefined,
      userId: 'user-1',
    })
  })
})
