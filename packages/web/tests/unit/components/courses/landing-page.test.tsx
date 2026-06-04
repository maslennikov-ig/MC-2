import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CoursesLandingPage, { generateMetadata } from '@/app/[locale]/courses/page'
import ruCommon from '@/messages/ru/common.json'
import enCommon from '@/messages/en/common.json'

vi.mock('server-only', () => ({}))

const messages = {
  ru: ruCommon,
  en: enCommon,
} as const

function lookup(locale: keyof typeof messages, namespace: string, key: string): unknown {
  const normalizedNamespace = namespace.replace(/^common\./, '')
  const path = `${normalizedNamespace}.${key}`.split('.')
  let value: unknown = messages[locale]

  for (const part of path) {
    if (typeof value !== 'object' || value === null || !(part in value)) {
      return key
    }
    value = (value as Record<string, unknown>)[part]
  }

  return value
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(({ locale, namespace }: { locale: 'ru' | 'en'; namespace: string }) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) => {
        const value = lookup(locale, namespace, key)
        if (typeof value !== 'string') return key
        return value.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ''))
      },
      {
        raw: (key: string) => lookup(locale, namespace, key),
      }
    )
  ),
  setRequestLocale: vi.fn(),
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

vi.mock('@/components/layouts/header', () => ({
  default: () => <header data-testid="courses-landing-header" />,
}))

describe('CoursesLandingPage', () => {
  it('renders a full course landing instead of the catalog grid', async () => {
    render(await CoursesLandingPage({ params: Promise.resolve({ locale: 'ru' }) }))

    expect(
      screen.getByRole('heading', {
        name: 'Курс начинается с понятной роли',
      })
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: 'Начать с должностной инструкции' })[0]
    ).toHaveAttribute('href', '/career-playbook')
    expect(screen.getAllByRole('link', { name: 'Открыть каталог курсов' })[0]).toHaveAttribute(
      'href',
      '/courses/library'
    )
    expect(screen.getAllByText('Роль').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Черновик курса').length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Каталог курсов' })).not.toBeInTheDocument()
  })

  it('generates landing metadata for /courses', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })

    expect(metadata.title).toBe('AI course builder by MegaCampusAI')
    expect(metadata.description).toContain('role context')
    expect(metadata.alternates?.canonical).toBe('/en/courses')
    expect(metadata.openGraph?.url).toBe('/en/courses')
  })
})
