import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CareerPlaybookLandingPage, { generateMetadata } from '@/app/[locale]/career-playbook/page'
import CareerPlaybookLandingPageClient from '@/app/[locale]/career-playbook/page-client'
import enMessages from '@/messages/en/career-playbook.json'
import ruMessages from '@/messages/ru/career-playbook.json'

const localizedMessages = {
  en: enMessages,
  ru: ruMessages,
} as const

let activeLocale: keyof typeof localizedMessages = 'en'

function lookupMessage(locale: keyof typeof localizedMessages, namespace: string, key: string) {
  const normalizedNamespace = namespace.replace(/^career-playbook\./, '')
  const path = `${normalizedNamespace}.${key}`.split('.')
  let value: unknown = localizedMessages[locale]

  for (const part of path) {
    if (typeof value !== 'object' || value === null || !(part in value)) {
      return key
    }
    value = (value as Record<string, unknown>)[part]
  }

  return typeof value === 'string' ? value : key
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    ({ locale, namespace }: { locale: 'ru' | 'en'; namespace: string }) =>
      (key: string) =>
        lookupMessage(locale, namespace, key)
  ),
  setRequestLocale: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    return lookupMessage(activeLocale, 'landing', key).replace(
      '{count}',
      String(values?.count ?? '')
    )
  },
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

vi.mock('@/components/layouts/shader-background', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shader-background">{children}</div>
  ),
}))

vi.mock('@/components/layouts/header', () => ({
  default: () => <header data-testid="career-playbook-header" />,
}))

describe('CareerPlaybookLandingPage', () => {
  beforeEach(() => {
    activeLocale = 'en'
  })

  it('renders the localized landing client and JSON-LD script', async () => {
    activeLocale = 'en'

    render(await CareerPlaybookLandingPage({ params: Promise.resolve({ locale: 'en' }) }))

    expect(screen.getByTestId('shader-background')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: /turn a job description into a company operating manual/i,
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create your career playbook/i })).toHaveAttribute(
      'href',
      '/career-playbook/new'
    )
    expect(screen.getByText('Netflix Context over Control')).toBeInTheDocument()
    expect(screen.getByText('Annotated B2B sales Role Guide preview')).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-jsonld')).toHaveAttribute(
      'type',
      'application/ld+json'
    )
    expect(
      JSON.parse(screen.getByTestId('career-playbook-jsonld').textContent ?? '{}')
    ).toMatchObject({
      description:
        'Create a structured operating manual for any role, then reuse it as course-generation context in MC2.',
      url: 'http://localhost:3000/en/career-playbook',
    })
  })

  it('generates localized SEO metadata with social tags', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })

    expect(metadata.title).toBe('Career Playbook by MC2')
    expect(metadata.description).toBe(
      'Create a structured operating manual for any role, then reuse it as course-generation context in MC2.'
    )
    expect(metadata.openGraph?.title).toBe('Career Playbook by MC2')
    expect(metadata.openGraph?.url).toBe('/en/career-playbook')
    expect(metadata.twitter?.card).toBe('summary_large_image')
    expect(metadata.alternates?.canonical).toBe('/en/career-playbook')
  })
})

describe('CareerPlaybookLandingPageClient', () => {
  beforeEach(() => {
    activeLocale = 'en'
  })

  it('shows five methodology cards, a 26-block map, and an interactive demo preview', () => {
    activeLocale = 'en'

    render(<CareerPlaybookLandingPageClient locale="en" />)

    expect(screen.getAllByTestId('career-playbook-methodology-card')).toHaveLength(5)
    expect(screen.getAllByTestId('career-playbook-block-chip')).toHaveLength(26)
    expect(screen.getByRole('button', { name: /decision matrix/i })).toBeInTheDocument()
    expect(screen.getByText(/small discounts can move quickly/i)).toBeInTheDocument()
  })

  it('localizes the block map, selected-block label, and demo chrome for Russian', () => {
    activeLocale = 'ru'

    render(<CareerPlaybookLandingPageClient locale="ru" />)

    expect(screen.getByText('Основа')).toBeInTheDocument()
    expect(screen.getByText('Выбранные блоки')).toBeInTheDocument()
    expect(screen.getAllByText('1. Миссия/KR').length).toBeGreaterThan(0)
    expect(screen.getAllByText('22. README роли').length).toBeGreaterThan(0)
    expect(screen.getByText('Role Guide: B2B Sales')).toBeInTheDocument()
    expect(screen.queryByText('Foundation')).not.toBeInTheDocument()
    expect(screen.queryByText('Selected blocks')).not.toBeInTheDocument()
    expect(screen.queryByText('B2B Sales Role Guide')).not.toBeInTheDocument()
  })
})
