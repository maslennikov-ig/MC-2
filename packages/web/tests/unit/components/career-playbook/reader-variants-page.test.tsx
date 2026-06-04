import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import CareerPlaybookReaderVariantsPage from '@/app/(mocks)/mocks/career-playbook-reader-variants/page'

describe('CareerPlaybookReaderVariantsPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/mocks/career-playbook-reader-variants')
  })

  it('renders the selected executive document reader by default', () => {
    render(<CareerPlaybookReaderVariantsPage />)

    expect(
      screen.getByRole('heading', { name: 'Единый ридер: Документ руководителя' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Менеджер по продажам' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Содержание документа' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Инспектор документа' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Скрыть левую панель' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Скрыть правый блок' })).toBeInTheDocument()
    expect(screen.getAllByText('Шапка документа')).not.toHaveLength(0)
    expect(screen.getAllByText('Миссия и ключевые результаты')).not.toHaveLength(0)
    expect(
      screen.queryByText(/\b(Header|Role Guide|Contents|Mission and key results|Edit|Regenerate)\b/)
    ).not.toBeInTheDocument()
  })

  it('switches light and dark themes and reflects the state in the URL', async () => {
    const user = userEvent.setup()

    render(<CareerPlaybookReaderVariantsPage />)

    await user.click(screen.getByRole('button', { name: 'Темная тема' }))

    const gallery = screen.getByTestId('reader-variant-gallery')
    expect(gallery).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('status')).toHaveTextContent('Режим: стандартный')
    expect(window.location.search).toBe('?theme=dark&toc=open&panel=open&mode=standard')
  })

  it('hides and restores the left contents panel with URL state', async () => {
    const user = userEvent.setup()

    render(<CareerPlaybookReaderVariantsPage />)

    await user.click(screen.getByRole('button', { name: 'Скрыть левую панель' }))

    expect(
      screen.queryByRole('navigation', { name: 'Содержание документа' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Левая панель скрыта')
    expect(window.location.search).toBe('?theme=light&toc=closed&panel=open&mode=standard')

    await user.click(screen.getByRole('button', { name: 'Показать левую панель' }))

    expect(screen.getByRole('navigation', { name: 'Содержание документа' })).toBeInTheDocument()
    expect(window.location.search).toBe('?theme=light&toc=open&panel=open&mode=standard')
  })

  it('hides and restores the right inspector with URL state', async () => {
    const user = userEvent.setup()

    render(<CareerPlaybookReaderVariantsPage />)

    await user.click(screen.getByRole('button', { name: 'Скрыть правый блок' }))

    expect(
      screen.queryByRole('complementary', { name: 'Инспектор документа' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Правая панель скрыта')
    expect(window.location.search).toBe('?theme=light&toc=open&panel=closed&mode=standard')

    await user.click(screen.getByRole('button', { name: 'Показать правый блок' }))

    expect(screen.getByRole('complementary', { name: 'Инспектор документа' })).toBeInTheDocument()
    expect(window.location.search).toBe('?theme=light&toc=open&panel=open&mode=standard')
  })

  it('enters reading mode and hides side panels while keeping the document visible', async () => {
    const user = userEvent.setup()

    render(<CareerPlaybookReaderVariantsPage />)

    await user.click(screen.getByRole('button', { name: 'Режим чтения' }))

    const gallery = screen.getByTestId('reader-variant-gallery')
    expect(gallery).toHaveAttribute('data-mode', 'reading')
    expect(
      screen.queryByRole('heading', { name: 'Единый ридер: Документ руководителя' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Содержание документа' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('complementary', { name: 'Инспектор документа' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Менеджер по продажам' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти из режима чтения' })).toBeInTheDocument()
    expect(window.location.search).toBe('?theme=light&toc=open&panel=open&mode=reading')
  })
})
