import { NextIntlClientProvider } from 'next-intl'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Toolbar } from '@/components/course/viewer/components/Toolbar'
import type { Course } from '@/types/database'

const messages = {
  course: {
    viewer: {
      showSidebar: 'Показать боковую панель',
      hideSidebar: 'Скрыть боковую панель',
      showInspector: 'Показать правую панель',
      hideInspector: 'Скрыть правую панель',
      section: 'Модуль',
      lesson: 'Урок',
      allLessons: 'Уроки',
      allLessonsTooltip: 'Все уроки курса',
      constructor: 'Конструктор',
      constructorTooltip: 'Конструктор курса',
      focusMode: 'Режим чтения',
      focusModeTooltip: 'Режим чтения',
      prev: 'Назад',
      next: 'Далее',
      lessonsCount: 'Уроков',
      duration: 'Длительность',
      completed: 'Завершено',
      level: 'Уровень',
    },
  },
}

const course = {
  id: 'course-1',
  title: 'Продажи для руководителей',
  slug: 'sales-leaders',
  difficulty: 'middle',
} as Course

function renderToolbar({
  sidebarOpen = true,
  inspectorOpen = true,
}: {
  sidebarOpen?: boolean
  inspectorOpen?: boolean
} = {}) {
  const handlers = {
    onToggleSidebar: vi.fn(),
    onToggleMobileSidebar: vi.fn(),
    onToggleInspector: vi.fn(),
    onToggleFocusMode: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
  }

  render(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <Toolbar
        course={course}
        isMobile={false}
        sidebarOpen={sidebarOpen}
        inspectorOpen={inspectorOpen}
        focusMode={false}
        totalLessons={8}
        totalTime="2ч 10м"
        progressPercentage={25}
        hasPrev
        hasNext
        orgSlug="demo"
        {...handlers}
      />
    </NextIntlClientProvider>
  )

  return handlers
}

describe('Course viewer Toolbar', () => {
  it('shows clickable left and right panel controls with open and closed states', async () => {
    const user = userEvent.setup()
    const handlers = renderToolbar()

    const leftPanelButton = screen.getByRole('button', { name: 'Скрыть боковую панель' })
    const rightPanelButton = screen.getByRole('button', { name: 'Скрыть правую панель' })
    expect(leftPanelButton).toHaveAttribute('aria-expanded', 'true')
    expect(rightPanelButton).toHaveAttribute('aria-expanded', 'true')

    await user.click(leftPanelButton)
    expect(handlers.onToggleSidebar).toHaveBeenCalledTimes(1)

    await user.click(rightPanelButton)
    expect(handlers.onToggleInspector).toHaveBeenCalledTimes(1)

    renderToolbar({ sidebarOpen: false, inspectorOpen: false })

    expect(screen.getByRole('button', { name: 'Показать боковую панель' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.getByRole('button', { name: 'Показать правую панель' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})
