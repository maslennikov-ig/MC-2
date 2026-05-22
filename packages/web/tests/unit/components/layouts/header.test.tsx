import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Header from '@/components/layouts/header'

const mockUseSupabase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/browser-client', () => ({
  useSupabase: mockUseSupabase,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        catalog: 'Каталог',
        catalogAria: 'Просмотреть доступные курсы',
        createCourse: 'Создать курс',
        createCourseAria: 'Создать новый курс',
        createRoleDescription: 'Создать описание роли',
        createRoleDescriptionAria: 'Создать описание роли',
        exampleCourses: 'Примеры курсов',
        examples: 'Примеры',
        examplesAria: 'Просмотреть примеры курсов',
        mainMenu: 'Главное меню',
      }) as Record<string, string>
    )[key] ?? key,
}))

vi.mock('@/src/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/common/logo', () => ({
  default: () => <div data-testid="logo" />,
}))

vi.mock('@/components/common/auth-button', () => ({
  default: () => <button type="button">Auth</button>,
}))

vi.mock('@/components/common/language-switcher', () => ({
  LanguageSwitcher: () => <button type="button">Language</button>,
}))

describe('Header', () => {
  beforeEach(() => {
    mockUseSupabase.mockReset()
  })

  it('links authenticated users directly to the role description creation flow', () => {
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: { user: { id: 'user-1' } },
    })

    render(<Header />)

    expect(screen.getByRole('link', { name: 'Создать описание роли' })).toHaveAttribute(
      'href',
      '/career-playbook/new'
    )
  })

  it('links signed-out users to the role description landing page', () => {
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: null,
    })

    render(<Header />)

    expect(screen.getByRole('link', { name: 'Создать описание роли' })).toHaveAttribute(
      'href',
      '/career-playbook'
    )
  })
})
