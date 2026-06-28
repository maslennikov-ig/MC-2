import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import HeroContent from '@/components/common/hero-content'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        badge: 'Два продукта для обучения команды',
        title: 'Сначала ясная роль. Потом сильный курс.',
        description:
          'MegaCampusAI помогает оформить должностную инструкцию под вашу компанию и на её основе собрать понятный учебный курс.',
        roleProduct: 'Должностные инструкции',
        roleProductEyebrow: 'Начать здесь',
        roleProductPurpose:
          'Помогает договориться, что делает человек в роли: задачи, зона ответственности, ожидания и критерии результата.',
        courseProduct: 'Курсы',
        courseProductEyebrow: 'Затем обучение',
        courseProductPurpose:
          'Помогает превратить роль в обучение: программу, уроки, проверки знаний и материалы для команды.',
        productConnection:
          'Инструкция задаёт контекст курса: из задач, критериев и стандартов рождается программа обучения.',
        workflowTitle: 'Как продукты связаны',
        createRoleGuide: 'Создать инструкцию',
        createCourse: 'Создать курс',
        learnMoreRole: 'Узнать больше об инструкциях',
        learnMoreCourses: 'Узнать больше о курсах',
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

describe('HeroContent', () => {
  it('uses the selected two-product hero with creation CTAs and product explainer links', () => {
    render(<HeroContent />)

    expect(screen.getByRole('link', { name: /Создать инструкцию/ })).toHaveAttribute(
      'href',
      '/career-playbook/new?fresh=1'
    )
    expect(screen.getByRole('link', { name: /Создать курс/ })).toHaveAttribute('href', '/create')

    expect(screen.getByRole('link', { name: /Узнать больше об инструкциях/ })).toHaveAttribute(
      'href',
      '/career-playbook'
    )
    expect(screen.getByRole('link', { name: /Узнать больше о курсах/ })).toHaveAttribute(
      'href',
      '/courses'
    )

    expect(
      screen.getByText(
        'Помогает договориться, что делает человек в роли: задачи, зона ответственности, ожидания и критерии результата.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Помогает превратить роль в обучение: программу, уроки, проверки знаний и материалы для команды.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Как продукты связаны' })).toBeInTheDocument()
  })
})
