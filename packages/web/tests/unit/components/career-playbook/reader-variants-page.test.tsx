import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import CareerPlaybookReaderVariantsPage from '@/app/(mocks)/mocks/career-playbook-reader-variants/page'

describe('CareerPlaybookReaderVariantsPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/mocks/career-playbook-reader-variants')
  })

  it('renders five premium reader variants on localized Career Playbook content', () => {
    render(<CareerPlaybookReaderVariantsPage />)

    expect(screen.getByRole('heading', { name: '5 вариантов единого ридера' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: 'Менеджер по продажам' })).toBeInTheDocument()
    expect(screen.getAllByText('Шапка документа')).not.toHaveLength(0)
    expect(screen.getAllByText('Миссия и ключевые результаты')).not.toHaveLength(0)
    expect(
      screen.queryByText(/\b(Header|Role Guide|Contents|Mission and key results|Edit|Regenerate)\b/)
    ).not.toBeInTheDocument()
  })

  it('switches light and dark previews without changing the selected variant', async () => {
    const user = userEvent.setup()

    render(<CareerPlaybookReaderVariantsPage />)

    await user.click(screen.getByRole('button', { name: 'Темная тема' }))

    const gallery = screen.getByTestId('reader-variant-gallery')
    expect(gallery).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('status')).toHaveTextContent('Выбран: Документ руководителя')
    expect(window.location.search).toBe('?variant=executive-document&theme=dark')
  })

  it('marks the chosen variant and reflects it in the URL', async () => {
    const user = userEvent.setup()

    render(<CareerPlaybookReaderVariantsPage />)

    const academyVariant = screen.getByRole('article', { name: 'Академический ридер' })
    await user.click(
      within(academyVariant).getByRole('button', { name: 'Выбрать Академический ридер' })
    )

    expect(within(academyVariant).getByText('Выбрано')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Выбран: Академический ридер')
    expect(window.location.search).toBe('?variant=academy-reader&theme=light')
  })
})
