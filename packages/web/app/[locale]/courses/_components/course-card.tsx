'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Trash2,
  BookOpen,
  Loader2,
  Lock,
  Clock,
  Users,
  Award,
  ChevronRight,
  Heart,
  CheckCircle,
  AlertCircle,
  Zap,
  Settings,
  ClipboardList,
  GitBranch,
  Building2,
  ChevronDown,
  Globe,
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
  const [isHovered, setIsHovered] = useState(false)
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

  // Check if course is being generated
  const isGenerating =
    course.generation_status !== null &&
    course.generation_status !== 'completed' &&
    course.generation_status !== 'failed' &&
    course.generation_status !== 'cancelled'

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleView}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleView()
          }
        }}
        tabIndex={0}
        role="article"
        aria-labelledby={`course-title-${course.id}`}
        aria-describedby={`course-description-${course.id}`}
        className={cn(
          'group relative cursor-pointer overflow-hidden rounded-2xl',
          'flex min-h-[480px] flex-col transition-shadow duration-300',
          'border border-gray-200 bg-white shadow-md hover:shadow-xl',
          'dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg dark:hover:shadow-2xl',
          'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:outline-none',
          isDeleting && 'opacity-50'
        )}
      >
        {/* Cover Image - main image area */}
        <div className="relative min-h-[280px] flex-1 overflow-hidden">
          {hasCover ? (
            <Image
              src={coverUrl}
              alt={`Обложка курса: ${course.title}`}
              fill
              className={cn(
                'object-cover transition-all duration-500',
                isHovered && 'scale-105 brightness-90 dark:scale-110 dark:brightness-75'
              )}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              priority={isAboveFold}
            />
          ) : (
            <div
              className={cn(
                'flex h-full items-center justify-center transition-all duration-500',
                'bg-gradient-to-br from-gray-100 to-gray-200',
                'dark:from-slate-800 dark:to-slate-900',
                isHovered && 'brightness-95 dark:brightness-75'
              )}
            >
              <BookOpen className="h-16 w-16 text-gray-400 dark:text-slate-700" />
            </div>
          )}

          {/* Gradient at bottom of image for dark theme */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent dark:from-black/60" />

          {/* Badges over image */}
          <div className="absolute top-4 left-4 flex flex-wrap gap-2">
            <Badge
              className={cn(
                'border backdrop-blur-sm',
                statusInfo.color,
                statusInfo.pulse && 'animate-pulse'
              )}
            >
              <statusInfo.icon className="mr-1 h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Статус курса: </span>
              {statusInfo.label}
            </Badge>
            {difficultyInfo && (
              <Badge className={cn('border backdrop-blur-sm', difficultyInfo.color)}>
                {difficultyInfo.icon}
                <span className="sr-only">Уровень сложности: </span>
                <span className="ml-1">{difficultyInfo.label}</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Base Content - always visible */}
        <div className="p-4">
          <h3
            id={`course-title-${course.id}`}
            className={cn(
              'line-clamp-2 text-base font-semibold transition-colors',
              'text-gray-900 group-hover:text-purple-600',
              'dark:text-white dark:group-hover:text-purple-400'
            )}
          >
            {course.title}
          </h3>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              {lessonsCount} уроков
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {duration}ч
            </span>
          </div>
        </div>

        {/* Hover Reveal Panel */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className={cn(
                'absolute inset-x-0 bottom-0 flex flex-col',
                'rounded-t-2xl border-t p-4 pt-5 backdrop-blur-md',
                'border-gray-200 bg-gradient-to-t from-white via-white to-white/95 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)]',
                'dark:border-slate-700/50 dark:bg-gradient-to-t dark:from-slate-900 dark:via-slate-900 dark:to-slate-900/95 dark:shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.3)]'
              )}
            >
              {/* Title */}
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="line-clamp-2 text-base font-semibold text-gray-900 dark:text-white"
              >
                {course.title}
              </motion.h3>

              {/* Description */}
              {course.course_description && (
                <motion.p
                  id={`course-description-${course.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-slate-300"
                >
                  {course.course_description}
                </motion.p>
              )}

              {/* Target audience */}
              {course.target_audience && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mt-3 flex items-start gap-2"
                >
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-purple-500 dark:text-purple-400" />
                  <p className="line-clamp-1 text-sm text-gray-700 dark:text-slate-300">
                    {course.target_audience}
                  </p>
                </motion.div>
              )}

              {/* Learning outcomes */}
              {course.learning_outcomes &&
                Array.isArray(course.learning_outcomes) &&
                course.learning_outcomes.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-2 flex items-start gap-2"
                  >
                    <Award className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                    <div className="space-y-0.5 text-sm text-gray-700 dark:text-slate-300">
                      {course.learning_outcomes.slice(0, 2).map((outcome, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-500 dark:text-green-400" />
                          <span className="line-clamp-1">{outcome}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

              {/* Progress bar for generating courses */}
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  className="mt-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-slate-400">Прогресс генерации</span>
                      <span className="font-medium text-purple-500 dark:text-purple-400">
                        {progress}%
                      </span>
                    </div>
                    <Progress value={progress} className="h-1.5 bg-gray-200 dark:bg-slate-700" />
                  </div>
                </motion.div>
              )}

              {/* CTA Button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Button
                  size="sm"
                  variant="default"
                  className={cn(
                    'mt-4 h-10 w-full rounded-full',
                    'bg-gradient-to-r from-purple-600 to-purple-700 font-medium text-white',
                    'hover:from-purple-700 hover:to-purple-800',
                    'transition-all hover:scale-[1.02]'
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
              </motion.div>

              {/* Divider */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-4 border-t border-gray-200 dark:border-slate-700"
              />

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32 }}
                className="mt-3 flex items-center gap-1"
              >
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
                  className="h-7 w-7 text-gray-500 hover:text-purple-500 dark:text-slate-400 dark:hover:text-purple-400"
                  isActive={isFavorited}
                />

                <ShareButton
                  slug={slug}
                  shareToken={course.share_token}
                  isOwner={user?.id === course.user_id}
                  isAdmin={user?.role === 'admin' || user?.role === 'superadmin'}
                  className="h-7 w-7 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white"
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
                            className={cn(
                              'cursor-pointer gap-2',
                              visibility === key && 'bg-accent'
                            )}
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
                      className="h-7 w-7 text-gray-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400"
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
                    className="h-7 w-7 text-gray-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
                  />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </TooltipProvider>
  )
}
