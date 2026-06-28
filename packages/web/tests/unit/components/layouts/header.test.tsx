import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
        courses: 'Курсы',
        coursesAria: 'Открыть лендинг курсов',
        courseLibrary: 'Каталог курсов',
        courseLibraryAria: 'Открыть каталог курсов',
        courseLanding: 'О курсах',
        createCourse: 'Создать курс',
        createCourseAria: 'Создать новый курс',
        roleDescriptions: 'Должностные инструкции',
        roleDescriptionsAria: 'Открыть лендинг должностных инструкций',
        roleDescriptionsMenuAria: 'Открыть действия для должностных инструкций',
        roleDescriptionLibrary: 'Каталог инструкций',
        roleDescriptionLibraryAria: 'Открыть каталог должностных инструкций',
        roleDescriptionLanding: 'О должностных инструкциях',
        coursesMenuAria: 'Открыть действия для курсов',
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

  it('shows two product landing entries for authenticated users', () => {
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: { user: { id: 'user-1' } },
    })

    render(<Header />)

    expect(screen.getByRole('link', { name: 'Должностные инструкции' })).toHaveAttribute(
      'href',
      '/career-playbook'
    )
    expect(screen.getByRole('link', { name: 'Курсы' })).toHaveAttribute('href', '/courses')
  })

  it('keeps product landing entries available for signed-out users', () => {
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: null,
    })

    render(<Header />)

    expect(screen.getByRole('link', { name: 'Должностные инструкции' })).toHaveAttribute(
      'href',
      '/career-playbook'
    )
    expect(screen.getByRole('link', { name: 'Курсы' })).toHaveAttribute('href', '/courses')
  })

  it('supports the shared fixed glass app header surface', () => {
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: { user: { id: 'user-1' } },
    })

    render(<Header sticky surface="glass" />)

    const header = screen.getByRole('banner')
    expect(header.className).toContain('fixed')
    expect(header.className).toContain('top-0')
    expect(header.className).toContain('backdrop-blur-sm')
  })

  it('uses compact rounded product controls instead of pill buttons', () => {
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: { user: { id: 'user-1' } },
    })

    render(<Header />)

    const productLinks = [
      screen.getByRole('link', { name: 'Должностные инструкции' }),
      screen.getByRole('link', { name: 'Курсы' }),
    ]

    productLinks.forEach((link) => {
      const productControl = link.closest('div')

      expect(productControl?.className).toContain('rounded-lg')
      expect(productControl?.className).not.toContain('rounded-full')
    })
    expect(
      screen.getByRole('button', { name: 'Открыть действия для должностных инструкций' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Открыть действия для курсов' })).toBeInTheDocument()
  })

  it('exposes create and library actions inside the role descriptions menu', async () => {
    const user = userEvent.setup()
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: { user: { id: 'user-1' } },
    })

    render(<Header />)

    await user.click(
      screen.getByRole('button', { name: 'Открыть действия для должностных инструкций' })
    )
    expect(screen.getByRole('menuitem', { name: 'Создать описание роли' })).toHaveAttribute(
      'href',
      '/career-playbook/new?fresh=1'
    )
    expect(
      screen.getByRole('menuitem', { name: 'Открыть каталог должностных инструкций' })
    ).toHaveAttribute('href', '/career-playbook/library')
  })

  it('exposes create and library actions inside the courses menu', async () => {
    const user = userEvent.setup()
    mockUseSupabase.mockReturnValue({
      isLoading: false,
      session: { user: { id: 'user-1' } },
    })

    render(<Header />)

    await user.click(screen.getByRole('button', { name: 'Открыть действия для курсов' }))
    expect(screen.getByRole('menuitem', { name: 'Создать новый курс' })).toHaveAttribute(
      'href',
      '/create'
    )
    expect(screen.getByRole('menuitem', { name: 'Открыть каталог курсов' })).toHaveAttribute(
      'href',
      '/courses/library'
    )
  })
})
