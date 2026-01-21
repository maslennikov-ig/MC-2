'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Trash2,
  BookOpen,
  Globe,
  Loader2,
  Lock,
  Clock,
  Users,
  Award,
  ChevronRight,
  Heart,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Zap,
  Settings,
  ClipboardList,
  GitBranch,
  Building2,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { deleteCourse, toggleFavorite, updateCourseVisibility } from '../actions'
import type { CourseVisibility } from '@/types/database'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Course } from '@/types/database'
import { ShareButton } from '@/components/courses/share-button'
import { ActionButtonWithTooltip } from '@/components/courses/action-button-with-tooltip'

interface User {
  id: string
  email?: string
  role?: string
}
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface CourseWithFavorite extends Course {
  isFavorited?: boolean
  share_token?: string | null
  coverUrl?: string | null
}

interface CourseCardProps {
  course: CourseWithFavorite
  user: User | null
  canDelete?: boolean
  viewMode?: 'grid' | 'list'
  isFavorited?: boolean
  /** Index of the card in the list - used for priority loading of above-fold images */
  index?: number
}

interface StatusConfig {
  color: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  pulse?: boolean
}

const statusConfig: Record<string, StatusConfig> = {
  draft: {
    color: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    label: 'Черновик',
    icon: BookOpen,
  },
  generating: {
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    label: 'Генерируется',
    icon: Zap,
    pulse: true,
  },
  processing: {
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    label: 'Обрабатывается',
    icon: Settings,
    pulse: true,
  },
  structure_ready: {
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    label: 'Структура готова',
    icon: ClipboardList,
  },
  completed: {
    color: 'bg-green-500/10 text-green-400 border-green-500/20',
    label: 'Готов',
    icon: CheckCircle,
  },
  failed: {
    color: 'bg-red-500/10 text-red-400 border-red-500/20',
    label: 'Ошибка',
    icon: AlertCircle,
  },
  mixed: {
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    label: 'Смешанный',
    icon: Settings,
  },
}

const difficultyConfig = {
  beginner: {
    color: 'bg-green-500/10 text-green-400 border-green-500/20',
    label: 'Начальный',
    icon: <Award className="h-3 w-3" />,
  },
  intermediate: {
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    label: 'Средний',
    icon: <Award className="h-3 w-3" />,
  },
  advanced: {
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    label: 'Продвинутый',
    icon: <Award className="h-3 w-3" />,
  },
  master: {
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    label: 'Мастер',
    icon: <Award className="h-3 w-3" />,
  },
  expert: {
    color: 'bg-red-500/10 text-red-400 border-red-500/20',
    label: 'Эксперт',
    icon: <Award className="h-3 w-3" />,
  },
  mixed: {
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    label: 'Смешанный',
    icon: <Award className="h-3 w-3" />,
  },
}

// Visibility configuration
const visibilityConfig: Record<
  CourseVisibility,
  {
    color: string
    label: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  private: {
    color: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    label: 'Приватный',
    icon: Lock,
  },
  organization: {
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    label: 'Для организации',
    icon: Building2,
  },
  public: {
    color: 'bg-green-500/10 text-green-400 border-green-500/20',
    label: 'Публичный',
    icon: Globe,
  },
}

// Configuration constants
const NEW_COURSE_DAYS = 7
const CARD_HEIGHTS = {
  sm: 'min-h-[420px]',
  md: 'sm:min-h-[440px]',
  lg: 'lg:min-h-[460px]',
} as const

export function CourseCard({
  course,
  user,
  canDelete = false,
  viewMode = 'grid',
  isFavorited: propFavorited,
  index = 0,
}: CourseCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  // Use prop if provided, otherwise use course.isFavorited, otherwise false
  const initialFavorited = propFavorited ?? course.isFavorited ?? false
  const [isFavorited, setIsFavorited] = useState(initialFavorited)
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false)
  const [visibility, setVisibility] = useState<CourseVisibility>(course.visibility || 'private')
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)

  const slug = course.slug || course.id
  const coverUrl = course.coverUrl
  const hasCover = !!coverUrl
  // First 4 cards are typically above the fold in 2x2 grid
  const isAboveFold = index < 4
  // Use total_lessons_count if available, otherwise fall back to actual_lessons_count
  const lessonsCount = course.total_lessons_count || course.actual_lessons_count || 0
  const sectionsCount = course.total_sections_count || course.actual_sections_count || 0
  const estimatedLessons = course.estimated_lessons || 15
  // Use generation_progress.percentage when available (real progress),
  // otherwise fallback to lesson-based calculation
  const progress =
    course.generation_progress?.percentage !== undefined
      ? Math.round(course.generation_progress.percentage)
      : estimatedLessons > 0
        ? Math.min(100, Math.round((lessonsCount / estimatedLessons) * 100))
        : 0

  // Use estimated_completion_minutes if available, otherwise calculate
  const duration = course.estimated_completion_minutes
    ? Math.round(course.estimated_completion_minutes / 60)
    : Math.round((lessonsCount * 5) / 60)
  // Use generation_status for display if available, otherwise fall back to course.status
  const displayStatus = course.generation_status || course.status
  const statusInfo = statusConfig[displayStatus as keyof typeof statusConfig] || statusConfig.draft
  const difficultyInfo = difficultyConfig[course.difficulty as keyof typeof difficultyConfig]

  // Optimize date calculations with useMemo
  const isNewCourse = useMemo(() => {
    return (
      new Date(course.created_at) > new Date(Date.now() - NEW_COURSE_DAYS * 24 * 60 * 60 * 1000)
    )
  }, [course.created_at])

  const handleDelete = async () => {
    if (!confirm('Вы уверены, что хотите удалить этот курс?')) return

    setIsDeleting(true)
    try {
      const result = await deleteCourse(slug)
      toast.success(`Курс "${result.deletedTitle}" успешно удален`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при удалении курса')
      setIsDeleting(false)
    }
  }

  const handleView = () => {
    router.push(`/courses/${slug}`)
  }

  const handleWorkflow = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(`/courses/generating/${slug}?workflow=true`, '_blank')
  }

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!user) {
      toast.error('Войдите, чтобы добавлять курсы в избранное')
      return
    }

    setIsUpdatingFavorite(true)

    try {
      const result = await toggleFavorite(course.id)

      // Check if we got a success response with isFavorited property
      if ('success' in result && result.success && 'isFavorited' in result) {
        const isFavoritedValue = result.isFavorited as boolean
        setIsFavorited(isFavoritedValue)
        toast.success(isFavoritedValue ? 'Добавлено в избранное' : 'Удалено из избранного')
      } else {
        toast.error(result.error || 'Ошибка при обновлении избранного')
      }
    } catch {
      toast.error('Не удалось обновить избранное')
    } finally {
      setIsUpdatingFavorite(false)
    }
  }

  const handleUpdateVisibility = async (newVisibility: CourseVisibility) => {
    if (!user) {
      toast.error('Войдите, чтобы изменить видимость')
      return
    }

    if (newVisibility === visibility) return

    setIsUpdatingVisibility(true)

    try {
      const result = await updateCourseVisibility(course.id, newVisibility)

      if (result.success) {
        setVisibility(result.visibility)
        toast.success('Видимость обновлена')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось изменить видимость')
    } finally {
      setIsUpdatingVisibility(false)
    }
  }

  // Get current visibility config
  const currentVisibility = visibilityConfig[visibility]

  if (viewMode === 'list') {
    return (
      <TooltipProvider>
        <Card
          className={cn(
            'group transition-smooth relative overflow-hidden',
            'elevation-2 hover-lift',
            'border-gray-200 bg-white backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80',
            'hover:bg-gray-50 dark:hover:bg-slate-900/90',
            'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2',
            'focus-within:elevation-5 focus-within:border-purple-500/50',
            'gpu-accelerated cursor-pointer rounded-lg',
            isDeleting && 'opacity-50'
          )}
          tabIndex={0}
          role="article"
          aria-labelledby={`course-title-list-${course.id}`}
          aria-describedby={`course-description-list-${course.id}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleView()
            }
          }}
          onClick={handleView}
        >
          <div className="flex flex-row gap-4 p-6">
            <div className="flex-1">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge
                      className={cn(
                        statusInfo.color,
                        'border px-2 py-0.5 text-xs',
                        statusInfo.pulse && 'animate-pulse'
                      )}
                    >
                      <statusInfo.icon className="mr-1 h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">Статус курса: </span>
                      {statusInfo.label}
                    </Badge>
                    {difficultyInfo && (
                      <Badge className={cn(difficultyInfo.color, 'border px-2 py-0.5 text-xs')}>
                        {difficultyInfo.icon}
                        <span className="sr-only">Уровень сложности: </span>
                        <span className="ml-1">{difficultyInfo.label}</span>
                      </Badge>
                    )}
                  </div>
                  <h3
                    id={`course-title-list-${course.id}`}
                    className="mb-2 line-clamp-1 text-lg font-semibold text-gray-900 dark:text-white"
                  >
                    {course.title}
                  </h3>
                  {course.course_description && (
                    <p
                      id={`course-description-list-${course.id}`}
                      className="mb-3 line-clamp-2 text-sm text-gray-400"
                    >
                      {course.course_description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <ShareButton
                    slug={slug}
                    shareToken={course.share_token}
                    isOwner={user?.id === course.user_id}
                    isAdmin={user?.role === 'admin' || user?.role === 'superadmin'}
                    className="h-8 w-8"
                  />
                  {user &&
                    (user.id === course.user_id ||
                      user.role === 'admin' ||
                      user.role === 'superadmin') && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-400 transition-colors hover:text-blue-400"
                            onClick={handleWorkflow}
                          >
                            <GitBranch className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Конструктор курса</TooltipContent>
                      </Tooltip>
                    )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 transition-colors hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete()
                      }}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  {sectionsCount} модулей
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  {lessonsCount} уроков
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {duration}ч
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                className="!rounded-full bg-purple-600 text-white hover:bg-purple-700"
                onClick={(e) => {
                  e.stopPropagation()
                  handleView()
                }}
                tabIndex={-1}
              >
                Открыть
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Card
        className={cn(
          'group transition-smooth relative overflow-hidden',
          'elevation-3 hover-scale card-interactive',
          // Background changes based on whether cover exists
          hasCover
            ? 'border-slate-700/50 bg-slate-900'
            : 'border-gray-200 bg-white backdrop-blur-sm hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:bg-slate-900/90',
          'hover:border-purple-500/30',
          'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2',
          'focus-within:elevation-6 focus-within:border-purple-500/50',
          'gpu-accelerated cursor-pointer rounded-xl',
          // Adaptive heights that expand to fill available space
          `${CARD_HEIGHTS.sm} ${CARD_HEIGHTS.md} ${CARD_HEIGHTS.lg} h-full`,
          'flex flex-col',
          isDeleting && 'opacity-50'
        )}
        tabIndex={0}
        role="article"
        aria-labelledby={`course-title-${course.id}`}
        aria-describedby={`course-description-${course.id}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleView()
          }
        }}
        onClick={handleView}
      >
        {/* Cover image background */}
        {hasCover && (
          <>
            <div className="absolute inset-0 z-0">
              <Image
                src={coverUrl}
                alt={`Обложка курса: ${course.title}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority={isAboveFold}
              />
            </div>
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
          </>
        )}

        {/* New badge for new courses */}
        {isNewCourse && (
          <div className="absolute top-2 right-2 z-10">
            <Badge className="border-0 bg-gradient-to-r from-purple-500 to-blue-500 text-white">
              <Sparkles className="mr-1 h-3 w-3" />
              Новый
            </Badge>
          </div>
        )}

        {/* Subtle gradient overlay on hover (only when no cover) */}
        {!hasCover && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-purple-500/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        )}

        <CardHeader className={cn('relative flex-shrink-0 px-6 pt-6 pb-3', hasCover && 'z-[2]')}>
          {/* Status and difficulty badges */}
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge
              className={cn(
                hasCover
                  ? 'border-white/30 bg-white/20 text-white backdrop-blur-sm'
                  : statusInfo.color,
                'border px-2 py-0.5 text-xs',
                statusInfo.pulse && 'animate-pulse'
              )}
            >
              <statusInfo.icon className="mr-1 h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Статус курса: </span>
              {statusInfo.label}
            </Badge>

            {difficultyInfo && (
              <Badge
                className={cn(
                  hasCover
                    ? 'border-white/30 bg-white/20 text-white backdrop-blur-sm'
                    : difficultyInfo.color,
                  'border px-2 py-0.5 text-xs'
                )}
              >
                {difficultyInfo.icon}
                <span className="sr-only">Уровень сложности: </span>
                <span className="ml-1">{difficultyInfo.label}</span>
              </Badge>
            )}
          </div>

          {/* Title */}
          <h3
            id={`course-title-${course.id}`}
            className={cn(
              'text-truncate-2 transition-colors-fast text-lg font-semibold',
              hasCover
                ? 'text-white group-hover:text-purple-200'
                : 'text-gray-900 group-hover:text-purple-600 dark:text-white dark:group-hover:text-purple-300'
            )}
          >
            {course.title}
          </h3>
        </CardHeader>

        <CardContent
          className={cn(
            'relative flex flex-1 flex-col justify-between overflow-hidden px-6 py-0',
            hasCover && 'z-[2]'
          )}
        >
          <div className="space-y-4">
            {/* Description - more compact with tooltip for full text */}
            {course.course_description && (
              <div className="flex-shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p
                        id={`course-description-${course.id}`}
                        className={cn(
                          'line-clamp-2 cursor-help text-sm leading-relaxed',
                          hasCover ? 'text-gray-200' : 'text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {course.course_description}
                      </p>
                    </TooltipTrigger>
                    {course.course_description.length > 100 && (
                      <TooltipContent
                        side="top"
                        className="z-50 max-w-md bg-gray-900 p-3 text-white"
                      >
                        <p className="text-sm leading-relaxed">{course.course_description}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            {/* Key Information Section - Only show most important info with tooltip */}
            {course.target_audience && (
              <div className="flex-shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-help items-start gap-2">
                        <Users
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0',
                            hasCover ? 'text-purple-300' : 'text-purple-400'
                          )}
                        />
                        <p
                          className={cn(
                            'line-clamp-1 text-xs',
                            hasCover ? 'text-gray-300' : 'text-gray-500 dark:text-gray-500'
                          )}
                        >
                          <span
                            className={cn(
                              'font-medium',
                              hasCover ? 'text-gray-200' : 'text-gray-600 dark:text-gray-400'
                            )}
                          >
                            Для кого:
                          </span>{' '}
                          {course.target_audience}
                        </p>
                      </div>
                    </TooltipTrigger>
                    {course.target_audience.length > 50 && (
                      <TooltipContent
                        side="top"
                        className="z-50 max-w-md bg-gray-900 p-3 text-white"
                      >
                        <p className="text-sm leading-relaxed">{course.target_audience}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            {/* Learning Outcomes - Only show if available and not too many */}
            {course.learning_outcomes && (
              <div className="flex-shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-help items-start gap-2">
                        <Award
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0',
                            hasCover ? 'text-green-300' : 'text-green-400'
                          )}
                        />
                        <p
                          className={cn(
                            'line-clamp-1 text-xs',
                            hasCover ? 'text-gray-300' : 'text-gray-500 dark:text-gray-500'
                          )}
                        >
                          <span
                            className={cn(
                              'font-medium',
                              hasCover ? 'text-gray-200' : 'text-gray-600 dark:text-gray-400'
                            )}
                          >
                            Результаты:
                          </span>{' '}
                          {Array.isArray(course.learning_outcomes)
                            ? course.learning_outcomes.slice(0, 2).join(', ') +
                              (course.learning_outcomes.length > 2 ? '...' : '')
                            : course.learning_outcomes}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="z-50 max-w-md bg-gray-900 p-3 text-white">
                      <div>
                        <p className="mb-2 text-sm font-medium">Что вы получите:</p>
                        {Array.isArray(course.learning_outcomes) ? (
                          <ul className="space-y-1 text-sm leading-relaxed">
                            {course.learning_outcomes.map((outcome, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                                {outcome}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm leading-relaxed">{course.learning_outcomes}</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            {/* Stats grid - expanded to fill space */}
            <div className="mt-auto pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5',
                    hasCover
                      ? 'border-white/20 bg-white/10 backdrop-blur-sm'
                      : 'border-gray-100 bg-gray-50 dark:border-slate-700/50 dark:bg-slate-800/30'
                  )}
                >
                  <BookOpen
                    className={cn('h-4 w-4', hasCover ? 'text-purple-300' : 'text-purple-400')}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-xs',
                        hasCover ? 'text-gray-300' : 'text-gray-500 dark:text-gray-500'
                      )}
                    >
                      Модули
                    </p>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        hasCover ? 'text-white' : 'text-gray-900 dark:text-white'
                      )}
                    >
                      {sectionsCount}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5',
                    hasCover
                      ? 'border-white/20 bg-white/10 backdrop-blur-sm'
                      : 'border-gray-100 bg-gray-50 dark:border-slate-700/50 dark:bg-slate-800/30'
                  )}
                >
                  <BookOpen
                    className={cn('h-4 w-4', hasCover ? 'text-blue-300' : 'text-blue-400')}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-xs',
                        hasCover ? 'text-gray-300' : 'text-gray-500 dark:text-gray-500'
                      )}
                    >
                      Уроки
                    </p>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        hasCover ? 'text-white' : 'text-gray-900 dark:text-white'
                      )}
                    >
                      {lessonsCount}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5',
                    hasCover
                      ? 'border-white/20 bg-white/10 backdrop-blur-sm'
                      : 'border-gray-100 bg-gray-50 dark:border-slate-700/50 dark:bg-slate-800/30'
                  )}
                >
                  <Clock
                    className={cn('h-4 w-4', hasCover ? 'text-green-300' : 'text-green-400')}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-xs',
                        hasCover ? 'text-gray-300' : 'text-gray-500 dark:text-gray-500'
                      )}
                    >
                      Время
                    </p>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        hasCover ? 'text-white' : 'text-gray-900 dark:text-white'
                      )}
                    >
                      {duration}ч
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5',
                    hasCover
                      ? 'border-white/20 bg-white/10 backdrop-blur-sm'
                      : 'border-gray-100 bg-gray-50 dark:border-slate-700/50 dark:bg-slate-800/30'
                  )}
                >
                  <Globe
                    className={cn('h-4 w-4', hasCover ? 'text-yellow-300' : 'text-yellow-400')}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-xs',
                        hasCover ? 'text-gray-300' : 'text-gray-500 dark:text-gray-500'
                      )}
                    >
                      Язык
                    </p>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        hasCover ? 'text-white' : 'text-gray-900 dark:text-white'
                      )}
                    >
                      {course.language === 'ru' ? 'RU' : course.language?.toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            {course.generation_status !== null &&
              course.generation_status !== 'completed' &&
              course.generation_status !== 'failed' &&
              course.generation_status !== 'cancelled' && (
                <div className="pt-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={cn(
                          hasCover ? 'text-gray-300' : 'text-gray-500 dark:text-gray-500'
                        )}
                      >
                        Прогресс генерации
                      </span>
                      <span
                        className={cn(
                          'font-medium',
                          hasCover ? 'text-purple-300' : 'text-purple-400'
                        )}
                      >
                        {progress}%
                      </span>
                    </div>
                    <Progress
                      value={progress}
                      className={cn(
                        'h-2',
                        hasCover ? 'bg-white/20' : 'bg-gray-200 dark:bg-slate-800'
                      )}
                    />
                  </div>
                </div>
              )}
          </div>
        </CardContent>

        {/* Main action button - positioned between content and footer */}
        <div className={cn('relative flex-shrink-0 px-6 pt-4 pb-3', hasCover && 'z-[2]')}>
          <Button
            size="sm"
            variant="default"
            className={cn(
              'h-10 w-full !rounded-full text-sm font-medium shadow-sm transition-all hover:shadow-md',
              hasCover
                ? 'border border-white/30 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30'
                : 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800'
            )}
            onClick={(e) => {
              e.stopPropagation()
              handleView()
            }}
            tabIndex={-1}
          >
            Открыть курс
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <CardFooter
          className={cn(
            'relative flex-shrink-0 border-t px-6 py-3',
            hasCover ? 'z-[2] border-white/20' : 'border-gray-200 dark:border-slate-800'
          )}
        >
          <div className="flex w-full items-center justify-between">
            {/* Secondary actions only */}
            <div className="flex items-center gap-1">
              <ActionButtonWithTooltip
                icon={
                  isUpdatingFavorite ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Heart
                      className={cn(
                        'h-3.5 w-3.5',
                        isFavorited && 'fill-purple-400 text-purple-400'
                      )}
                    />
                  )
                }
                label="Добавить в избранное"
                onClick={(e) => void handleToggleFavorite(e)}
                disabled={isUpdatingFavorite}
                className={cn(
                  'h-7 w-7',
                  hasCover
                    ? 'text-gray-300 hover:text-purple-300'
                    : 'text-gray-400 hover:text-purple-400'
                )}
                isActive={isFavorited}
              />

              <ShareButton
                slug={slug}
                shareToken={course.share_token}
                isOwner={user?.id === course.user_id}
                isAdmin={user?.role === 'admin' || user?.role === 'superadmin'}
                className={cn('h-7 w-7', hasCover && 'text-gray-300 hover:text-white')}
              />

              {user &&
                (user.id === course.user_id ||
                  user.role === 'admin' ||
                  user.role === 'superadmin') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-7 gap-1 px-2 text-xs font-normal',
                          currentVisibility.color,
                          'hover:opacity-80'
                        )}
                        disabled={isUpdatingVisibility}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isUpdatingVisibility ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <currentVisibility.icon className="h-3 w-3" />
                        )}
                        <span className="hidden sm:inline">{currentVisibility.label}</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                      {(
                        Object.entries(visibilityConfig) as [
                          CourseVisibility,
                          typeof currentVisibility,
                        ][]
                      ).map(([key, config]) => (
                        <DropdownMenuItem
                          key={key}
                          onClick={() => void handleUpdateVisibility(key)}
                          className={cn('cursor-pointer gap-2', visibility === key && 'bg-accent')}
                        >
                          <config.icon className="h-4 w-4" />
                          {config.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

              {user &&
                (user.id === course.user_id ||
                  user.role === 'admin' ||
                  user.role === 'superadmin') && (
                  <ActionButtonWithTooltip
                    icon={<GitBranch className="h-3.5 w-3.5" />}
                    label="Конструктор курса"
                    onClick={handleWorkflow}
                    className={cn(
                      'h-7 w-7',
                      hasCover
                        ? 'text-gray-300 hover:text-blue-300'
                        : 'text-gray-400 hover:text-blue-400'
                    )}
                  />
                )}

              {canDelete && (
                <ActionButtonWithTooltip
                  icon={
                    isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )
                  }
                  label="Удалить курс"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className={cn(
                    'h-7 w-7',
                    hasCover
                      ? 'text-gray-300 hover:text-red-400'
                      : 'text-gray-400 hover:text-red-500'
                  )}
                />
              )}
            </div>
          </div>
        </CardFooter>
      </Card>
    </TooltipProvider>
  )
}
