import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CoursesLibraryPage, { generateMetadata } from '@/app/[locale]/courses/library/page'

vi.mock('server-only', () => ({}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(() => (key: string) => {
    const messages: Record<string, string> = {
      title: 'Каталог курсов',
      description: 'Курсы и черновики',
      metaDescription: 'Каталог созданных курсов',
      metaKeywords: 'курсы, каталог',
    }
    return messages[key] ?? key
  }),
  setRequestLocale: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/app/[locale]/courses/actions', () => ({
  checkFavorites: vi.fn(() => Promise.resolve({})),
  getCourseCovers: vi.fn(() => Promise.resolve({})),
  getCourses: vi.fn(() =>
    Promise.resolve({
      courses: [],
      currentPage: 1,
      hasMore: false,
      totalCount: 0,
    })
  ),
  getCoursesStatistics: vi.fn(() =>
    Promise.resolve({
      totalCourses: 0,
      completedCourses: 0,
      totalLessons: 0,
    })
  ),
}))

vi.mock('@/app/[locale]/courses/_components/courses-header', () => ({
  CoursesHeader: () => <header data-testid="courses-header" />,
}))

vi.mock('@/app/[locale]/courses/_components/course-statistics', () => ({
  CourseStatistics: () => <section data-testid="course-statistics" />,
}))

vi.mock('@/app/[locale]/courses/_components/courses-filters', () => ({
  CoursesFilters: () => <section data-testid="courses-filters" />,
}))

vi.mock('@/app/[locale]/courses/_components/course-grid', () => ({
  CourseGrid: () => <section data-testid="course-grid" />,
}))

describe('CoursesLibraryPage', () => {
  it('keeps the course catalog available at /courses/library', async () => {
    render(
      await CoursesLibraryPage({
        params: Promise.resolve({ locale: 'ru' }),
        searchParams: Promise.resolve({}),
      })
    )

    expect(screen.getByRole('heading', { name: 'Каталог курсов' })).toBeInTheDocument()
    expect(screen.getByTestId('course-statistics')).toBeInTheDocument()
    expect(screen.getByTestId('courses-filters')).toBeInTheDocument()
    expect(screen.getByTestId('course-grid')).toBeInTheDocument()
  })

  it('generates catalog metadata for /courses/library', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })

    expect(metadata.alternates?.canonical).toBe('/courses/library')
    expect(metadata.openGraph?.url).toBe('/courses/library')
  })
})
