import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CoursesFilters } from '@/app/[locale]/courses/_components/courses-filters'

const mockPush = vi.hoisted(() => vi.fn())
const mockSearchParams = vi.hoisted(() => new URLSearchParams())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
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
  it('matches the favorites filter shape to the other filter controls', () => {
    render(<CoursesFilters totalCount={122} />)

    const favoritesButton = screen.getByRole('button', { name: 'Избранные' })

    expect(favoritesButton.className).toContain('rounded-lg')
    expect(favoritesButton.className).not.toContain('rounded-full')
  })
})
