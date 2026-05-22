import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookNewPage from '@/app/[locale]/career-playbook/new/page'
import { getCurrentUser } from '@/lib/auth-helpers'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/app/[locale]/career-playbook/new/page-client', () => ({
  default: ({ locale }: { locale: string }) => <div data-testid="career-playbook-wizard">{locale}</div>,
}))

vi.mock('@/app/[locale]/career-playbook/new/auth-required-client', () => ({
  default: () => <div data-testid="career-playbook-auth-required">Authorization Required</div>,
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

  it('renders the wizard only for authenticated users', async () => {
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'student',
      organizationId: null,
    })

    render(await CareerPlaybookNewPage({ params: Promise.resolve({ locale: 'en' }) }))

    expect(screen.getByTestId('career-playbook-wizard')).toHaveTextContent('en')
  })
})
