import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookNewPage from '@/app/[locale]/career-playbook/new/page'
import { getCurrentUser } from '@/lib/auth-helpers'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(() => (key: string) => key),
  setRequestLocale: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/app/[locale]/career-playbook/new/page-client', () => ({
  default: ({
    locale,
    resetOnMount,
    resumePlaybookId,
  }: {
    locale: string
    resetOnMount?: boolean
    resumePlaybookId?: string
  }) => (
    <div data-testid="career-playbook-wizard">
      <span data-testid="career-playbook-wizard-locale">{locale}</span>
      <span data-testid="career-playbook-wizard-fresh">{String(Boolean(resetOnMount))}</span>
      <span data-testid="career-playbook-wizard-resume">{resumePlaybookId ?? ''}</span>
    </div>
  ),
}))

vi.mock('@/app/[locale]/career-playbook/new/auth-required-client', () => ({
  default: ({ returnTo }: { returnTo?: string }) => (
    <div data-testid="career-playbook-auth-required">
      Authorization Required
      <span data-testid="career-playbook-auth-return-to">{returnTo ?? ''}</span>
    </div>
  ),
}))

const mockedGetCurrentUser = vi.mocked(getCurrentUser)

describe('CareerPlaybookNewPage', () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockReset()
  })

  it('renders the auth-required state when the user is unauthenticated', async () => {
    mockedGetCurrentUser.mockResolvedValue(null)

    render(await CareerPlaybookNewPage({ params: Promise.resolve({ locale: 'en' }) }))

    expect(screen.getByTestId('career-playbook-auth-required')).toBeInTheDocument()
    expect(screen.queryByTestId('career-playbook-wizard')).not.toBeInTheDocument()
  })

  it('preserves the fresh constructor intent through authentication', async () => {
    mockedGetCurrentUser.mockResolvedValue(null)

    render(
      await CareerPlaybookNewPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ fresh: '1' }),
      })
    )

    expect(screen.getByTestId('career-playbook-auth-return-to')).toHaveTextContent(
      '/en/career-playbook/new?fresh=1'
    )
  })

  it('renders the wizard only for authenticated users', async () => {
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'student',
      organizationId: null,
    })

    render(await CareerPlaybookNewPage({ params: Promise.resolve({ locale: 'en' }) }))

    expect(screen.getByTestId('career-playbook-wizard-locale')).toHaveTextContent('en')
  })

  it('passes a concrete playbook id to the constructor when resuming from the library', async () => {
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'student',
      organizationId: null,
    })

    render(
      await CareerPlaybookNewPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ resume: 'pb-1' }),
      })
    )

    expect(screen.getByTestId('career-playbook-wizard-resume')).toHaveTextContent('pb-1')
    expect(screen.getByTestId('career-playbook-wizard-fresh')).toHaveTextContent('false')
  })
})
