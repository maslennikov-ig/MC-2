import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import AuthButton from '@/components/common/auth-button'
import enCommon from '@/messages/en/common.json'
import ruCommon from '@/messages/ru/common.json'

const mockUseSupabase = vi.hoisted(() => vi.fn())
const mockOpen = vi.hoisted(() => vi.fn())
const mockRefresh = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/browser-client', () => ({
  useSupabase: mockUseSupabase,
}))

vi.mock('@/lib/hooks/use-auth-modal', () => ({
  useAuthModal: () => ({ open: mockOpen }),
}))

vi.mock('@/src/i18n/navigation', () => ({
  usePathname: () => '/career-playbook',
  useRouter: () => ({ refresh: mockRefresh }),
}))

describe('AuthButton', () => {
  it('keeps the decorative login blob hidden on small screens and reveals it only on hover-capable layouts', async () => {
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: null,
      supabase: {
        auth: {
          signOut: vi.fn(),
        },
      },
    })

    render(
      <NextIntlClientProvider locale="ru" messages={{ common: ruCommon }}>
        <AuthButton darkMode />
      </NextIntlClientProvider>
    )

    const loginButton = await screen.findByRole('button', { name: 'Войти' })
    const gooeyContainer = loginButton.closest('#gooey-btn')
    const decorativeButton = gooeyContainer?.querySelector('button[aria-hidden="true"]')

    expect(decorativeButton).toHaveClass('hidden')
    expect(decorativeButton).toHaveClass('sm:flex')
    expect(decorativeButton).toHaveClass('opacity-0')
    expect(decorativeButton).toHaveClass('sm:group-hover:opacity-100')
  })

  it('renders the signed-out action in the active locale', async () => {
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: null,
      supabase: {
        auth: {
          signOut: vi.fn(),
        },
      },
    })

    render(
      <NextIntlClientProvider locale="en" messages={{ common: enCommon }}>
        <AuthButton />
      </NextIntlClientProvider>
    )

    expect(await screen.findByRole('button', { name: 'Sign In' })).toHaveTextContent('Sign In')
  })
})
