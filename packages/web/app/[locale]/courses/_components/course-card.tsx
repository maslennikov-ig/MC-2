'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
  LockOpen,
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
  ClipboardList
} from 'lucide-react'
import { toast } from 'sonner'
import { deleteCourse, toggleFavorite, togglePublishStatus } from '../actions'
import { cn } from '@/lib/utils'
import type { Course } from '@/types/database'
import { ShareButton } from '@/components/courses/share-button'
import { ActionButtonWithTooltip } from '@/components/courses/action-button-with-tooltip'

interface User {
  id: string
  email?: string
  role?: string
}
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface CourseWithFavorite extends Course {
  isFavorited?: boolean
  share_token?: string | null
}

interface CourseCardProps {
  course: CourseWithFavorite
  user: User | null
  canDelete?: boolean
  viewMode?: 'grid' | 'list'
  isFavorited?: boolean
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
    icon: BookOpen
  },
  generating: { 
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', 
    label: 'Генерируется',
    icon: Zap,
    pulse: true
  },
  processing: { 
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', 
    label: 'Обрабатывается',
    icon: Settings,
    pulse: true
  },
  structure_ready: { 
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', 
    label: 'Структура готова',
    icon: ClipboardList
  },
  completed: { 
    color: 'bg-green-500/10 text-green-400 border-green-500/20', 
    label: 'Готов',
    icon: CheckCircle
  },
  failed: { 
    color: 'bg-red-500/10 text-red-400 border-red-500/20', 
    label: 'Ошибка',
    icon: AlertCircle
  },
  mixed: { 
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', 
    label: 'Смешанный',
    icon: Settings
  }
}

const difficultyConfig = {
  beginner: { 
    color: 'bg-green-500/10 text-green-400 border-green-500/20',
    label: 'Начальный',
    icon: <Award className="h-3 w-3" />
  },
  intermediate: { 
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    label: 'Средний',
    icon: <Award className="h-3 w-3" />
  },
  advanced: { 
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    label: 'Продвинутый',
    icon: <Award className="h-3 w-3" />
  },
  master: { 
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    label: 'Мастер',
    icon: <Award className="h-3 w-3" />
  },
  expert: { 
    color: 'bg-red-500/10 text-red-400 border-red-500/20',
    label: 'Эксперт',
    icon: <Award className="h-3 w-3" />
  },
  mixed: { 
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    label: 'Смешанный',
    icon: <Award className="h-3 w-3" />
  }
}

// Configuration constants
const NEW_COURSE_DAYS = 7
const CARD_HEIGHTS = {
  sm: 'min-h-[420px]',
  md: 'sm:min-h-[440px]',
  lg: 'lg:min-h-[460px]'
} as const

export function CourseCard({
  course,
  user,
  canDelete = false,
  viewMode = 'grid',
  isFavorited: propFavorited
}: CourseCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  // Use prop if provided, otherwise use course.isFavorited, otherwise false
  const initialFavorited = propFavorited ?? course.isFavorited ?? false
  const [isFavorited, setIsFavorited] = useState(initialFavorited)
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false)
  const [isPublished, setIsPublished] = useState(course.is_published || false)
  const [isUpdatingPublish, setIsUpdatingPublish] = useState(false)
  
  const slug = course.slug || course.id
  // Use total_lessons_count if available, otherwise fall back to actual_lessons_count
  const lessonsCount = course.total_lessons_count || course.actual_lessons_count || 0
  const sectionsCount = course.total_sections_count || course.actual_sections_count || 0
  const estimatedLessons = course.estimated_lessons || 15
  const progress = estimatedLessons > 0 
    ? Math.min(100, Math.round((lessonsCount / estimatedLessons) * 100))
    : 0
  
  // Use estimated_completion_minutes if available, otherwise calculate
  const duration = course.estimated_completion_minutes 
    ? Math.round(course.estimated_completion_minutes / 60)
    : Math.round((lessonsCount * 5) / 60)
  const statusInfo = statusConfig[course.status as keyof typeof statusConfig] || statusConfig.draft
  const difficultyInfo = difficultyConfig[course.difficulty as keyof typeof difficultyConfig]
  
  // Optimize date calculations with useMemo
  const isNewCourse = useMemo(() => {
    return new Date(course.created_at) > new Date(Date.now() - NEW_COURSE_DAYS * 24 * 60 * 60 * 1000)
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
        toast.success(
          isFavoritedValue
            ? 'Добавлено в избранное'
            : 'Удалено из избранного'
        )
      } else {
        toast.error(result.error || 'Ошибка при обновлении избранного')
      }
    } catch {
      toast.error('Не удалось обновить избранное')
    } finally {
      setIsUpdatingFavorite(false)
    }
  }

  const handleTogglePublish = async () => {
    if (!user) {
      toast.error('Войдите, чтобы изменить статус публикации')
      return
    }

    setIsUpdatingPublish(true)

    try {
      const result = await togglePublishStatus(course.id)

      if (result.success) {
        setIsPublished(result.isPublished)
        toast.success(
          result.isPublished
            ? 'Курс опубликован'
            : 'Курс снят с публикации'
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось изменить статус публикации')
    } finally {
      setIsUpdatingPublish(false)
    }
  }


  if (viewMode === 'list') {
    return (
      <Card 
        className={cn(
          "group relative overflow-hidden transition-smooth",
          "elevation-2 hover-lift",
          "bg-white dark:bg-slate-900/80 border-gray-200 dark:border-slate-800 backdrop-blur-sm",
          "hover:bg-gray-50 dark:hover:bg-slate-900/90",
          "focus:ring-2 focus:ring-purple-500 focus:ring-offset-2",
          "focus-within:elevation-5 focus-within:border-purple-500/50",
          "cursor-pointer gpu-accelerated rounded-lg",
          isDeleting && "opacity-50"
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
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge 
                    className={cn(
                      statusInfo.color,
                      'text-xs px-2 py-0.5 border',
                      statusInfo.pulse && 'animate-pulse'
                    )}
                  >
                    <statusInfo.icon className="h-3 w-3 mr-1" aria-hidden="true" />
                    <span className="sr-only">Статус курса: </span>
                    {statusInfo.label}
                  </Badge>
                  {difficultyInfo && (
                    <Badge className={cn(difficultyInfo.color, 'text-xs px-2 py-0.5 border')}>
                      {difficultyInfo.icon}
                      <span className="sr-only">Уровень сложности: </span>
                      <span className="ml-1">{difficultyInfo.label}</span>
                    </Badge>
                  )}
                </div>
                <h3 
                  id={`course-title-list-${course.id}`}
                  className="font-semibold text-lg text-gray-900 dark:text-white mb-2 line-clamp-1"
                >
                  {course.title}
                </h3>
                {course.course_description && (
                  <p 
                    id={`course-description-list-${course.id}`}
                    className="text-sm text-gray-400 line-clamp-2 mb-3"
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
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-red-500 transition-colors"
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
              className="bg-purple-600 hover:bg-purple-700 text-white !rounded-full"
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
    )
  }
  
  return (
    <TooltipProvider>
      <Card 
        className={cn(
          "group relative overflow-hidden transition-smooth",
          "elevation-3 hover-scale card-interactive",
          "bg-white dark:bg-slate-900/80 border-gray-200 dark:border-slate-800 backdrop-blur-sm",
          "hover:bg-gray-50 dark:hover:bg-slate-900/90",
          "hover:border-purple-500/30",
          "focus:ring-2 focus:ring-purple-500 focus:ring-offset-2",
          "focus-within:elevation-6 focus-within:border-purple-500/50",
          "cursor-pointer gpu-accelerated rounded-xl",
          // Adaptive heights that expand to fill available space
          `${CARD_HEIGHTS.sm} ${CARD_HEIGHTS.md} ${CARD_HEIGHTS.lg} h-full`,
          "flex flex-col",
          isDeleting && "opacity-50"
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
        {/* New badge for new courses */}
        {isNewCourse && (
          <div className="absolute top-2 right-2 z-10">
            <Badge className="bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0">
              <Sparkles className="h-3 w-3 mr-1" />
              Новый
            </Badge>
          </div>
        )}
        
        {/* Subtle gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        
        <CardHeader className="px-6 pt-6 pb-3 flex-shrink-0">
          {/* Status and difficulty badges */}
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge 
              className={cn(
                statusInfo.color,
                'text-xs px-2 py-0.5 border',
                statusInfo.pulse && 'animate-pulse'
              )}
            >
              <statusInfo.icon className="h-3 w-3 mr-1" aria-hidden="true" />
              <span className="sr-only">Статус курса: </span>
              {statusInfo.label}
            </Badge>
            
            {difficultyInfo && (
              <Badge className={cn(difficultyInfo.color, 'text-xs px-2 py-0.5 border')}>
                {difficultyInfo.icon}
                <span className="sr-only">Уровень сложности: </span>
                <span className="ml-1">{difficultyInfo.label}</span>
              </Badge>
            )}
          </div>
          
          {/* Title */}
          <h3
            id={`course-title-${course.id}`}
            className="font-semibold text-lg text-truncate-2 text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors-fast"
          >
            {course.title}
          </h3>
        </CardHeader>
        
        <CardContent className="px-6 py-0 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="space-y-4">
            {/* Description - more compact with tooltip for full text */}
            {course.course_description && (
              <div className="flex-shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p 
                        id={`course-description-${course.id}`}
                        className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed cursor-help"
                      >
                        {course.course_description}
                      </p>
                    </TooltipTrigger>
                    {course.course_description.length > 100 && (
                      <TooltipContent side="top" className="max-w-md p-3 z-50 bg-gray-900 text-white">
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
                      <div className="flex items-start gap-2 cursor-help">
                        <Users className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">
                          <span className="font-medium text-gray-600 dark:text-gray-400">Для кого:</span> {course.target_audience}
                        </p>
                      </div>
                    </TooltipTrigger>
                    {course.target_audience.length > 50 && (
                      <TooltipContent side="top" className="max-w-md p-3 z-50 bg-gray-900 text-white">
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
                      <div className="flex items-start gap-2 cursor-help">
                        <Award className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">
                          <span className="font-medium text-gray-600 dark:text-gray-400">Результаты:</span> {
                            Array.isArray(course.learning_outcomes) 
                              ? course.learning_outcomes.slice(0, 2).join(', ') + (course.learning_outcomes.length > 2 ? '...' : '')
                              : course.learning_outcomes
                          }
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-md p-3 z-50 bg-gray-900 text-white">
                      <div>
                        <p className="text-sm font-medium mb-2">Что вы получите:</p>
                        {Array.isArray(course.learning_outcomes) ? (
                          <ul className="text-sm leading-relaxed space-y-1">
                            {course.learning_outcomes.map((outcome, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <CheckCircle className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
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
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-slate-800/30 rounded-lg border border-gray-100 dark:border-slate-700/50">
                  <BookOpen className="h-4 w-4 text-purple-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-500">Модули</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{sectionsCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-slate-800/30 rounded-lg border border-gray-100 dark:border-slate-700/50">
                  <BookOpen className="h-4 w-4 text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-500">Уроки</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{lessonsCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-slate-800/30 rounded-lg border border-gray-100 dark:border-slate-700/50">
                  <Clock className="h-4 w-4 text-green-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-500">Время</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{duration}ч</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-slate-800/30 rounded-lg border border-gray-100 dark:border-slate-700/50">
                  <Globe className="h-4 w-4 text-yellow-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-500">Язык</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{course.language === 'ru' ? 'RU' : course.language?.toUpperCase()}</p>
                  </div>
                </div>
              </div>
            </div>
          
            {/* Progress bar */}
            {course.generation_status !== null && course.generation_status !== 'completed' && course.generation_status !== 'failed' && course.generation_status !== 'cancelled' && (
              <div className="pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-gray-500">Прогресс генерации</span>
                    <span className="text-purple-400 font-medium">{progress}%</span>
                  </div>
                  <Progress 
                    value={progress} 
                    className="h-2 bg-gray-200 dark:bg-slate-800"
                  />
                </div>
              </div>
            )}

          </div>
        </CardContent>
        
        {/* Main action button - positioned between content and footer */}
        <div className="px-6 pb-3 flex-shrink-0">
          <Button
            size="sm"
            variant="default"
            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white h-10 text-sm font-medium shadow-sm hover:shadow-md transition-all !rounded-full"
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
        
        <CardFooter className="px-6 py-3 border-t border-gray-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            {/* Secondary actions only */}
            <div className="flex items-center gap-1">
              <ActionButtonWithTooltip
                icon={
                  isUpdatingFavorite ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Heart className={cn("h-3.5 w-3.5", isFavorited && "fill-purple-400 text-purple-400")} />
                  )
                }
                label="Добавить в избранное"
                onClick={handleToggleFavorite}
                disabled={isUpdatingFavorite}
                className="h-7 w-7 text-gray-400 hover:text-purple-400"
                isActive={isFavorited}
              />

              <ShareButton
                slug={slug}
                shareToken={course.share_token}
                isOwner={user?.id === course.user_id}
                isAdmin={user?.role === 'admin' || user?.role === 'superadmin'}
                className="h-7 w-7"
              />

              {user && (user.id === course.user_id || user.role === 'admin' || user.role === 'superadmin') && (
                <ActionButtonWithTooltip
                  icon={
                    isUpdatingPublish ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isPublished ? (
                      <LockOpen className="h-3.5 w-3.5" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )
                  }
                  label={isPublished ? 'Снять с публикации' : 'Опубликовать курс'}
                  onClick={handleTogglePublish}
                  disabled={isUpdatingPublish}
                  className="h-7 w-7 text-gray-400 hover:text-purple-400"
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
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="h-7 w-7 text-gray-400 hover:text-red-500"
                />
              )}
            </div>
          </div>
        </CardFooter>
      </Card>
    </TooltipProvider>
  )
}