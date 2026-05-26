import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CoursesFilters } from '@/app/[locale]/courses/_components/courses-filters'

const mockPush = vi.hoisted(() => vi.fn())
const mockSearchParams = vi.hoisted(() => new URLSearchParams())

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@/src/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    (
      ({
        searchPlaceholder: 'Поиск курсов',
        filterByStatus: 'Фильтр по статусу',
        allStatuses: 'Все статусы',
        'status.draft': 'Черновик',
        'status.generating': 'Генерируется',
        'status.completed': 'Завершен',
        'status.failed': 'Ошибка',
        filterByDifficulty: 'Фильтр по сложности',
        anyDifficulty: 'Любая сложность',
        'difficulty.beginner': 'Начальный',
        'difficulty.intermediate': 'Средний',
        'difficulty.advanced': 'Продвинутый',
        'difficulty.master': 'Мастер',
        'difficulty.expert': 'Эксперт',
        'difficulty.mixed': 'Смешанный',
        sortCourses: 'Сортировка',
        sort: 'Сортировка',
        'sortOptions.created_desc': 'Сначала новые',
        'sortOptions.created_asc': 'Сначала старые',
        'sortOptions.title_asc': 'Название А-Я',
        'sortOptions.title_desc': 'Название Я-А',
        'sortOptions.lessons_desc': 'Больше уроков',
        'sortOptions.lessons_asc': 'Меньше уроков',
        'sortOptions.difficulty_asc': 'Сложность по возрастанию',
        'sortOptions.difficulty_desc': 'Сложность по убыванию',
        favorites: 'Избранные',
        resultsCount: `${values?.count ?? 0} из ${values?.total ?? 0}`,
        loading: 'Загрузка',
      }) as Record<string, string>
    )[key] ?? key,
}))

describe('CoursesFilters', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('matches the favorites filter shape to the other filter controls', () => {
    render(<CoursesFilters totalCount={122} />)

    const favoritesButton = screen.getByRole('button', { name: 'Избранные' })

    expect(favoritesButton.className).toContain('rounded-lg')
    expect(favoritesButton.className).not.toContain('rounded-full')
  })

  it('routes filter changes through the locale-aware course library path', () => {
    render(<CoursesFilters totalCount={122} />)

    fireEvent.click(screen.getByRole('button', { name: 'Избранные' }))

    expect(mockPush).toHaveBeenCalledWith('/courses/library?favorites=true')
  })
})
