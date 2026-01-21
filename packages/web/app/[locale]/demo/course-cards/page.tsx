'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Moon, Sun, Smartphone, Monitor } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

// Import selected card variant
import { HoverRevealCard } from './variants/hover-reveal-card'

// Demo course data
export interface DemoCourse {
  id: string
  title: string
  slug: string
  course_description: string | null
  status: 'draft' | 'published' | 'archived'
  language: string
  difficulty: string
  visibility: 'private' | 'organization' | 'public'
  total_lessons_count: number
  total_sections_count: number
  learning_outcomes: string[]
  target_audience: string
  estimated_completion_minutes: number
  generation_status: string | null
  coverUrl: string | null
}

const demoCourses: DemoCourse[] = [
  {
    id: '1',
    title: 'Основы машинного обучения для аналитиков',
    slug: 'ml-basics',
    course_description:
      'Изучите фундаментальные концепции машинного обучения, от линейной регрессии до нейронных сетей. Практические примеры на Python.',
    status: 'published',
    language: 'ru',
    difficulty: 'intermediate',
    visibility: 'public',
    total_lessons_count: 24,
    total_sections_count: 6,
    learning_outcomes: [
      'Понимание основных алгоритмов ML',
      'Работа с библиотеками scikit-learn и TensorFlow',
      'Построение и оценка моделей',
      'Практические проекты для портфолио',
    ],
    target_audience: 'Аналитики данных и разработчики, желающие освоить ML',
    estimated_completion_minutes: 720,
    generation_status: 'completed',
    coverUrl: 'https://picsum.photos/seed/ml-course/800/600',
  },
  {
    id: '2',
    title: 'Продвинутый TypeScript для Enterprise',
    slug: 'typescript-advanced',
    course_description:
      'Глубокое погружение в TypeScript: дженерики, условные типы, декораторы и паттерны для масштабируемых приложений.',
    status: 'draft',
    language: 'ru',
    difficulty: 'advanced',
    visibility: 'private',
    total_lessons_count: 18,
    total_sections_count: 4,
    learning_outcomes: [
      'Мастерство в системе типов TypeScript',
      'Создание type-safe API',
      'Паттерны для больших кодовых баз',
    ],
    target_audience: 'Опытные JavaScript разработчики',
    estimated_completion_minutes: 540,
    generation_status: 'generating',
    coverUrl: null,
  },
  {
    id: '3',
    title: 'UX/UI Дизайн: от идеи до прототипа',
    slug: 'ux-ui-design',
    course_description:
      'Комплексный курс по созданию пользовательских интерфейсов. Figma, прототипирование, user research и дизайн-системы.',
    status: 'published',
    language: 'ru',
    difficulty: 'beginner',
    visibility: 'public',
    total_lessons_count: 32,
    total_sections_count: 8,
    learning_outcomes: [
      'Создание wireframes и прототипов',
      'Работа в Figma на профессиональном уровне',
      'Проведение UX-исследований',
      'Построение дизайн-систем',
      'Презентация дизайн-решений',
    ],
    target_audience: 'Начинающие дизайнеры и продакт-менеджеры',
    estimated_completion_minutes: 960,
    generation_status: 'completed',
    coverUrl: 'https://picsum.photos/seed/ux-design/800/600',
  },
]

export default function CourseCardsDemo() {
  const router = useRouter()
  const [isDark, setIsDark] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  const handleCardClick = (slug: string) => {
    router.push(`/courses/${slug}`)
  }

  return (
    <div
      className={cn(
        'min-h-screen transition-colors duration-300',
        isDark ? 'dark bg-slate-950 text-white' : 'bg-gray-50 text-gray-900'
      )}
    >
      {/* Header */}
      <header
        className={cn(
          'sticky top-0 z-50 border-b backdrop-blur-xl',
          isDark ? 'border-slate-800 bg-slate-950/80' : 'border-gray-200 bg-white/80'
        )}
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Варианты карточек курсов</h1>
              <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-gray-500')}>
                Сравните 6 дизайн-вариантов и выберите лучший
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Mobile/Desktop toggle */}
              <div className="flex items-center gap-2">
                <Monitor
                  className={cn(
                    'h-4 w-4',
                    !isMobile ? 'text-cyan-500' : isDark ? 'text-slate-500' : 'text-gray-400'
                  )}
                />
                <Switch checked={isMobile} onCheckedChange={setIsMobile} />
                <Smartphone
                  className={cn(
                    'h-4 w-4',
                    isMobile ? 'text-cyan-500' : isDark ? 'text-slate-500' : 'text-gray-400'
                  )}
                />
              </div>
              {/* Theme toggle */}
              <div className="flex items-center gap-2">
                <Sun
                  className={cn(
                    'h-4 w-4',
                    !isDark ? 'text-amber-500' : isDark ? 'text-slate-500' : 'text-gray-400'
                  )}
                />
                <Switch checked={isDark} onCheckedChange={setIsDark} />
                <Moon className={cn('h-4 w-4', isDark ? 'text-cyan-500' : 'text-gray-400')} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-6 py-8">
        {/* Description */}
        <div
          className={cn(
            'mb-8 rounded-xl border p-6',
            isDark ? 'border-slate-800 bg-slate-900/50' : 'border-gray-200 bg-white'
          )}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Hover Reveal Card</h2>
            <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-sm font-medium text-cyan-400">
              ★★★★★
            </span>
          </div>
          <p className={cn('mt-2', isDark ? 'text-slate-400' : 'text-gray-500')}>
            Выезжающая панель с информацией при наведении — лучший баланс UX и информативности
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-medium text-green-400">Плюсы:</h4>
              <ul className="mt-1 space-y-1">
                <li className={cn('text-sm', isDark ? 'text-slate-300' : 'text-gray-600')}>
                  + Плавная анимация
                </li>
                <li className={cn('text-sm', isDark ? 'text-slate-300' : 'text-gray-600')}>
                  + Работает с touch
                </li>
                <li className={cn('text-sm', isDark ? 'text-slate-300' : 'text-gray-600')}>
                  + Лучший баланс UX и информативности
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-medium text-amber-400">Минусы:</h4>
              <ul className="mt-1 space-y-1">
                <li className={cn('text-sm', isDark ? 'text-slate-300' : 'text-gray-600')}>
                  - Изображение частично скрывается
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div
          className={cn(
            'grid gap-6',
            isMobile ? 'mx-auto max-w-sm grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {demoCourses.map((course) => (
            <HoverRevealCard
              key={course.id}
              course={course}
              onClick={() => handleCardClick(course.slug)}
              isDark={isDark}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
