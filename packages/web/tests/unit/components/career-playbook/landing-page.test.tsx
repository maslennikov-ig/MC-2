import { fireEvent, render, screen } from '@testing-library/react'
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
        name: /a role guide your team will use/i,
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create your career playbook/i })).toHaveAttribute(
      'href',
      '/career-playbook/new'
    )
    expect(screen.getAllByText('Netflix Context over Control').length).toBeGreaterThan(1)
    expect(screen.getByText('Annotated B2B sales Role Guide preview')).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-jsonld')).toHaveAttribute(
      'type',
      'application/ld+json'
    )
    expect(
      JSON.parse(screen.getByTestId('career-playbook-jsonld').textContent ?? '{}')
    ).toMatchObject({
      description: 'Build a structured role manual for hiring, onboarding, and team review.',
      url: 'http://localhost:3000/en/career-playbook',
    })
    expect(screen.queryByText(/sharing, and course reuse/i)).not.toBeInTheDocument()
  })

  it('generates localized SEO metadata with social tags', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })

    expect(metadata.title).toBe('Career Playbook by MC2')
    expect(metadata.description).toBe(
      'Build a structured role manual for hiring, onboarding, and team review.'
    )
    expect(metadata.openGraph?.title).toBe('Career Playbook by MC2')
    expect(metadata.openGraph?.url).toBe('/en/career-playbook')
    expect(metadata.twitter?.card).toBe('summary_large_image')
    expect(metadata.alternates?.canonical).toBe('/en/career-playbook')
    expect(metadata.alternates?.languages).toEqual({
      ru: '/career-playbook',
      en: '/en/career-playbook',
    })
  })
})

describe('CareerPlaybookLandingPageClient', () => {
  beforeEach(() => {
    activeLocale = 'en'
  })

  it('shows six methodology cards, a 26-block map, and a 26-section interactive demo preview', () => {
    activeLocale = 'en'

    render(<CareerPlaybookLandingPageClient />)

    expect(screen.getAllByTestId('career-playbook-methodology-card')).toHaveLength(6)
    expect(screen.getAllByTestId('career-playbook-block-chip')).toHaveLength(26)
    expect(screen.getByText(/six sources we use most often/i)).toBeInTheDocument()
    const demoButtons = screen.getAllByTestId('career-playbook-demo-section-button')
    expect(demoButtons).toHaveLength(26)
    expect(demoButtons.slice(0, 6).map((button) => button.textContent)).toEqual([
      expect.stringMatching(/Mission and key results.*Block 1/i),
      expect.stringMatching(/Anti-goals.*Block 2/i),
      expect.stringMatching(/Responsibility zones.*Block 3/i),
      expect.stringMatching(/Duties.*Block 4/i),
      expect.stringMatching(/Decision matrix.*Block 5/i),
      expect.stringMatching(/KPI and counter-metrics.*Block 6/i),
    ])
    expect(screen.getByText('26 sections in the full guide')).toBeInTheDocument()
    expect(screen.getAllByText('All 26 sections are in the outline').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Open any section to see an example from the future guide.').length
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/the role turns b2b pipeline into predictable revenue/i)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Implementation checklist.*26/i }))

    expect(
      screen.getAllByText(/before launching the role, check the owner, goals, metrics/i).length
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /All 26 sections/i })).not.toBeInTheDocument()
  })

  it('localizes the block map, selected-block label, and demo chrome for Russian', () => {
    activeLocale = 'ru'

    render(<CareerPlaybookLandingPageClient />)

    expect(screen.getByText('Основа')).toBeInTheDocument()
    expect(screen.getByText('Где используется выбранный источник')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Нажмите на источник справа: здесь показано, какие разделы инструкции он помогает собрать.'
      )
    ).toBeInTheDocument()
    expect(screen.getAllByText('Netflix: контекст вместо контроля').length).toBeGreaterThan(1)
    expect(screen.getByText('Google: эффективность команд')).toBeInTheDocument()
    expect(
      screen.getByText(/шесть источников, которые мы чаще всего используем/i)
    ).toBeInTheDocument()
    expect(screen.getAllByText('1. Миссия и ключевые результаты').length).toBeGreaterThan(0)
    expect(screen.getAllByText('22. Памятка роли').length).toBeGreaterThan(0)
    expect(screen.getByText('Должностная инструкция: корпоративные продажи')).toBeInTheDocument()
    expect(screen.getByText('26 разделов в полной инструкции')).toBeInTheDocument()
    expect(screen.getAllByText('Все 26 разделов в списке').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Откройте любой раздел, чтобы увидеть пример из будущей инструкции.')
        .length
    ).toBeGreaterThan(0)
    expect(screen.getByText('Должностная инструкция, которой пользуются')).toBeInTheDocument()
    expect(screen.queryByText(/operating manual/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/block-level review/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Foundation')).not.toBeInTheDocument()
    expect(screen.queryByText('Selected blocks')).not.toBeInTheDocument()
    expect(screen.queryByText('Where the selected source is used')).not.toBeInTheDocument()
    expect(screen.queryByText('Netflix Context over Control')).not.toBeInTheDocument()
    expect(screen.queryByText('Google Team Effectiveness')).not.toBeInTheDocument()
    expect(screen.queryByText('B2B Sales Role Guide')).not.toBeInTheDocument()
  })

  it('shows the pre-start guidance block as a designed section', () => {
    activeLocale = 'ru'

    render(<CareerPlaybookLandingPageClient />)

    expect(screen.getByText('Перед стартом')).toBeInTheDocument()
    expect(screen.getByText('Что важно знать до первого черновика')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Коротко закрываем практические сомнения: кому подходит конструктор, можно ли править результат и что подготовить перед началом.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('3 ответа')).toBeInTheDocument()
    expect(screen.getByText('Без повторного сбора')).toBeInTheDocument()
    expect(screen.getByText('Можно начать с черновика')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Вопросы' })).not.toBeInTheDocument()
  })

  it('markets company-specific AI-assisted personalization without AI visual cliches', () => {
    activeLocale = 'ru'

    render(<CareerPlaybookLandingPageClient />)

    expect(
      screen.getByText(
        'Соберите не формальный шаблон, а рабочий документ под вашу компанию: искусственный интеллект превратит контекст роли в 26 полезных блоков для найма, ввода в должность и управления.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'В основе — практики Netflix, Amazon, Toyota, Spotify, Bridgewater и Google.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Дополнено подходами Topgrading, Who, Drive, The Alliance и The Checklist Manifesto.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Индивидуализация')).toBeInTheDocument()
    expect(screen.getByText('Не шаблон, а инструкция под вашу компанию')).toBeInTheDocument()
    expect(screen.getByText('Контекст компании')).toBeInTheDocument()
    expect(screen.getByText('Искусственный интеллект собирает структуру')).toBeInTheDocument()
    expect(screen.getByText('Вы оставляете контроль')).toBeInTheDocument()
  })

  it('marks landing sections and cards for subtle motion treatment', () => {
    activeLocale = 'ru'

    const { container } = render(<CareerPlaybookLandingPageClient />)

    expect(container.querySelector('.career-playbook-motion-page')).toBeInTheDocument()
    expect(container.querySelectorAll('.career-playbook-motion-section').length).toBeGreaterThan(3)
    expect(container.querySelectorAll('.career-playbook-motion-card').length).toBeGreaterThan(6)
  })

  it('uses a wider landing layout with a document preview in the hero', () => {
    activeLocale = 'ru'

    const { container } = render(<CareerPlaybookLandingPageClient />)

    expect(screen.getByText('Не скучная должностная инструкция')).toBeInTheDocument()
    expect(screen.getByText('26 блоков')).toBeInTheDocument()
    expect(screen.getByText('Лучшее из сильных команд')).toBeInTheDocument()
    expect(screen.getByText('Им будут пользоваться в работе')).toBeInTheDocument()
    expect(screen.getByText('Контекст роли')).toBeInTheDocument()
    expect(screen.getByText('Менеджер по продажам')).toBeInTheDocument()
    expect(container.querySelector('.career-playbook-hero-preview')).toBeInTheDocument()
    expect(container.querySelector('.career-playbook-hero-preview-card')).toBeInTheDocument()
    expect(container.querySelectorAll('.career-playbook-wide-container').length).toBeGreaterThan(5)
  })
})
