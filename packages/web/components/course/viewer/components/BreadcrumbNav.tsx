'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight, ArrowLeft, BookOpen } from 'lucide-react'
import type { Course, Section, Lesson } from '@/types/database'

interface BreadcrumbNavProps {
  course: Course
  currentSection?: Section
  currentLesson?: Lesson
  focusMode?: boolean
}

export function BreadcrumbNav({
  course,
  currentSection,
  currentLesson,
  focusMode,
}: BreadcrumbNavProps) {
  const t = useTranslations('course.viewer')

  if (focusMode) return null

  return (
    <nav className="border-b border-gray-100 bg-gray-50/50 px-6 py-3 dark:border-gray-800/50 dark:bg-gray-900/30">
      {/* Desktop breadcrumbs */}
      <ol className="hidden items-center gap-2 text-sm text-gray-600 md:flex dark:text-gray-400">
        <li>
          <Link
            href="/courses"
            className="flex items-center gap-1 transition-colors hover:text-purple-600 dark:hover:text-purple-400"
          >
            <BookOpen className="h-4 w-4" />
            {t('breadcrumb.courses')}
          </Link>
        </li>

        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-600" />

        <li>
          <Link
            href={`/courses/${course.slug}`}
            className="max-w-[200px] truncate transition-colors hover:text-purple-600 dark:hover:text-purple-400"
            title={course.title}
          >
            {course.title}
          </Link>
        </li>

        {currentSection && (
          <>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-600" />
            <li className="max-w-[200px] truncate" title={currentSection.title}>
              {t('breadcrumb.section')} {currentSection.section_number}: {currentSection.title}
            </li>
          </>
        )}

        {currentLesson && (
          <>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-600" />
            <li
              className="max-w-[250px] truncate font-medium text-gray-800 dark:text-gray-200"
              title={currentLesson.title}
            >
              {t('breadcrumb.lesson')} {currentLesson.lesson_number}: {currentLesson.title}
            </li>
          </>
        )}
      </ol>

      {/* Mobile: compact back button */}
      <div className="md:hidden">
        <Link
          href="/courses"
          className="inline-flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('breadcrumb.backToCourses')}
        </Link>
      </div>
    </nav>
  )
}
