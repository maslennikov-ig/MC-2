import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookViewerPage from '@/app/[locale]/career-playbook/[id]/page'
import { getCurrentUser } from '@/lib/auth-helpers'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
  setRequestLocale: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/app/[locale]/career-playbook/[id]/page-client', () => ({
  default: ({ locale, playbookId }: { locale: string; playbookId: string }) => (
    <div data-testid="career-playbook-viewer">
      {locale}:{playbookId}
    </div>
  ),
}))

vi.mock('@/app/[locale]/career-playbook/new/auth-required-client', () => ({
  default: () => <div data-testid="career-playbook-auth-required">Authorization Required</div>,
}))

const mockedGetCurrentUser = vi.mocked(getCurrentUser)

describe('CareerPlaybookViewerPage', () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockReset()
  })

  it('renders the auth-required state when the user is unauthenticated', async () => {
    mockedGetCurrentUser.mockResolvedValue(null)

    render(
      await CareerPlaybookViewerPage({
        params: Promise.resolve({
          locale: 'en',
          id: '00000000-0000-4000-8000-000000002001',
        }),
      })
    )

    expect(screen.getByTestId('career-playbook-auth-required')).toBeInTheDocument()
    expect(screen.queryByTestId('career-playbook-viewer')).not.toBeInTheDocument()
  })

  it('awaits Next 15 dynamic params and renders the viewer for authenticated users', async () => {
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'student',
      organizationId: null,
    })

    render(
      await CareerPlaybookViewerPage({
        params: Promise.resolve({
          locale: 'en',
          id: '00000000-0000-4000-8000-000000002001',
        }),
      })
    )

    expect(screen.getByTestId('career-playbook-viewer')).toHaveTextContent(
      'en:00000000-0000-4000-8000-000000002001'
    )
  })
})
