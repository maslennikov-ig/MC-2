'use client'

import React, { useCallback, useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import {
  Play,
  X,
  CheckSquare,
  Rocket,
  ChevronUp,
  ChevronDown,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Trophy,
  ExternalLink,
  Layers,
  BookOpen,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOptionalPartialGenerationContext } from '../contexts/PartialGenerationContext'
import { useNodeSelection } from '../hooks/useNodeSelection'
import { createClient } from '@/lib/supabase/client'
import { finalizeCourse } from '@/app/actions/admin-generation'
import { toast } from 'sonner'
import type { CourseStructure } from '@megacampus/shared-types'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import { Link } from '@/src/i18n/navigation'
import { useTranslation } from '@/lib/generation-graph/useTranslation'
import { getModuleWord, getLessonWord } from '@/lib/generation-graph/utils/pluralization'

const STORAGE_KEY = 'stage6-toolbar-minimized'

/**
 * Props for the SelectionToolbar component.
 */
interface SelectionToolbarProps {
  /** Course UUID for generation actions */
  courseId?: string
  /** Whether all course generation is complete (shows celebration banner) */
  isCompleted?: boolean
  /** Course URL slug for navigation to completed course */
  courseSlug?: string
  /** Total number of modules (displayed in completion stats) */
  moduleCount?: number
  /** Total number of lessons (displayed in completion stats) */
  lessonCount?: number
  /** Current generation pipeline status (e.g., 'stage_6_generating', 'stage_6_complete') */
  generationStatus?: string
}

/**
 * Stage 6 Control Banner for lesson generation workflow.
 *
 * Four visual states:
 * 1. **Initial Mode** (stage_6_init): "Generate All" / "Select" buttons
 * 2. **Generating Mode** (stage_6_generating): Progress indicator, disabled actions
 * 3. **Ready to Finalize** (stage_6_complete): "Finalize Course" button
 * 4. **Celebration Mode** (completed): Green banner with "Open Course" link
 *
 * Features:
 * - Persists minimized state to localStorage
 * - Swipe-to-minimize gesture support
 * - Full dark/light theme support
 * - Accessible with proper ARIA labels
 *
 * @example
 * ```tsx
 * <SelectionToolbar
 *   courseId="123e4567-e89b-12d3-a456-426614174000"
 *   isCompleted={true}
 *   courseSlug="my-course"
 *   moduleCount={5}
 *   lessonCount={25}
 *   generationStatus="completed"
 * />
 * ```
 */
export function SelectionToolbar({
  courseId,
  isCompleted = false,
  courseSlug,
  moduleCount = 0,
  lessonCount = 0,
  generationStatus,
}: SelectionToolbarProps) {
  const contextValue = useOptionalPartialGenerationContext()
  const { selectedNodeId } = useNodeSelection()
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const { resolvedTheme, mounted } = useThemeSync()
  const isDark = mounted && resolvedTheme === 'dark'
  const { t } = useTranslation()

  // Memoized plural forms for Russian language support
  const moduleLabel = useMemo(() => getModuleWord(moduleCount, t, 'common'), [moduleCount, t])
  const lessonLabel = useMemo(() => getLessonWord(lessonCount, t, 'common'), [lessonCount, t])

  // Swipe tracking
  const x = useMotionValue(0)
  const opacity = useTransform(x, [-100, 0], [0.5, 1])

  // Load minimized state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'true') {
      setIsMinimized(true)
    }
  }, [])

  // Auto-minimize when side panel (NodeDetailsDrawer) opens
  // Stays minimized until user manually expands
  useEffect(() => {
    if (selectedNodeId) {
      setIsMinimized(true)
      localStorage.setItem(STORAGE_KEY, 'true')
    }
  }, [selectedNodeId])

  // Save minimized state to localStorage
  const toggleMinimized = useCallback((minimized: boolean) => {
    setIsMinimized(minimized)
    localStorage.setItem(STORAGE_KEY, String(minimized))
  }, [])

  // Handle swipe gestures
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      // Swipe left to minimize (velocity or distance threshold)
      if (info.velocity.x < -500 || info.offset.x < -100) {
        toggleMinimized(true)
      }
      // Reset position
      x.set(0)
    },
    [toggleMinimized, x]
  )

  /**
   * Generate ALL lessons in the course
   */
  const generateAllLessons = useCallback(async () => {
    if (!courseId || !contextValue || isGeneratingAll || contextValue.isGenerating) return

    setIsGeneratingAll(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('courses')
        .select('course_structure')
        .eq('id', courseId)
        .single()

      if (error || !data?.course_structure) {
        toast.error('Не удалось загрузить структуру курса')
        return
      }

      const structure = data.course_structure as CourseStructure
      const sectionIds = structure.sections.map((s) => s.section_number)

      if (sectionIds.length === 0) {
        toast.error('Структура курса пуста')
        return
      }

      const response = await fetch(`/api/coursegen/partial-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          courseId,
          sectionIds,
          priority: 5,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        const errorMessage = result.error?.message || result.message || 'Ошибка запуска генерации'
        toast.error(errorMessage)
        return
      }

      const resultData = result.result?.data || result
      toast.success(`Запущена генерация всех ${resultData.jobCount} уроков`)
    } catch (err) {
      console.error('[SelectionToolbar] Network error in generateAllLessons:', err)
      toast.error('Ошибка сети. Проверьте подключение.')
    } finally {
      setIsGeneratingAll(false)
    }
  }, [courseId, contextValue, isGeneratingAll])

  // State for finalize course action
  const [isFinalizingCourse, setIsFinalizingCourse] = useState(false)

  /**
   * Finalize the course after all lessons are generated
   */
  const handleFinalizeCourse = useCallback(async () => {
    if (!courseId || isFinalizingCourse) return

    setIsFinalizingCourse(true)
    try {
      await finalizeCourse(courseId)
      toast.success('Курс завершён!')
    } catch (error) {
      toast.error('Не удалось завершить курс', {
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
      })
    } finally {
      setIsFinalizingCourse(false)
    }
  }, [courseId, isFinalizingCourse])

  // Determine if we're in stage_6_generating or stage_6_complete state
  const isStage6Generating = generationStatus === 'stage_6_generating'
  const isStage6Complete = generationStatus === 'stage_6_complete'

  // For completed state, we don't need contextValue
  // For stage_6_complete state, we also don't need contextValue (just showing finalize button)
  if (!isCompleted && !isStage6Complete && !contextValue) return null

  const {
    selectedCount = 0,
    hasSelection = false,
    isSelectionMode = false,
    setSelectionMode = () => {},
    generateSelected = () => {},
    clearSelection = () => {},
    isGenerating = false,
  } = contextValue || {}

  const isProcessing = isGeneratingAll || isGenerating

  // Completed state - Celebration Banner
  if (isCompleted) {
    return (
      <AnimatePresence mode="wait">
        {isMinimized ? (
          /* Edge Tab - minimized state (completed) */
          <motion.div
            key="edge-tab-completed"
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto fixed right-0 bottom-6 z-50"
          >
            <motion.button
              onClick={() => toggleMinimized(false)}
              whileTap={{ scale: 0.98 }}
              className={`group flex items-center gap-1.5 rounded-l-xl py-2.5 pr-2 pl-3 shadow-lg backdrop-blur-md transition-all duration-200 hover:pl-5 ${
                isDark
                  ? 'border border-r-0 border-emerald-500/30 bg-gradient-to-r from-emerald-900/95 to-green-900/95 hover:border-emerald-400/50'
                  : 'border border-r-0 border-emerald-200/50 bg-gradient-to-r from-emerald-50/95 to-green-50/95 hover:border-emerald-300/70'
              }`}
              aria-label={t('selectionToolbar.expandPanel')}
            >
              <div
                className={`shrink-0 rounded-full border p-1 ${
                  isDark
                    ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                    : 'border-emerald-200 bg-emerald-100 text-emerald-600'
                }`}
              >
                <Trophy className="h-3 w-3" />
              </div>
              <span
                className={`text-xs font-medium ${isDark ? 'text-emerald-200' : 'text-emerald-700'}`}
              >
                ✓
              </span>
              <ChevronLeft
                className={`h-3 w-3 ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`}
              />
            </motion.button>
          </motion.div>
        ) : (
          /* Main Celebration Banner - completed state */
          <motion.div
            key="celebration-banner"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ x: 200, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-none fixed right-0 bottom-6 left-0 z-50 flex justify-center px-4"
          >
            <motion.div
              drag="x"
              dragConstraints={{ left: -150, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              style={{ x, opacity }}
              className="pointer-events-auto w-full max-w-3xl touch-pan-y"
              title={t('selectionToolbar.swipeToCollapse')}
            >
              <div
                className={`overflow-hidden rounded-lg shadow-lg backdrop-blur-md ${
                  isDark
                    ? 'border border-emerald-500/30 bg-gradient-to-r from-emerald-900/95 to-green-900/95'
                    : 'border border-emerald-200/50 bg-gradient-to-r from-emerald-50/95 to-green-50/95 shadow-emerald-500/10'
                }`}
              >
                {/* Header with celebration content */}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  {/* Left: Trophy + Title + Stats */}
                  <div className="flex items-center gap-3 overflow-hidden">
                    {/* Trophy Icon */}
                    <div
                      className={`shrink-0 rounded-full p-2 ${
                        isDark
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-emerald-100 text-emerald-600'
                      }`}
                    >
                      <Trophy className="h-5 w-5" />
                    </div>

                    {/* Title and Stats */}
                    <div className="flex min-w-0 flex-col">
                      <h3
                        className={`truncate text-sm font-semibold ${isDark ? 'text-emerald-100' : 'text-emerald-800'}`}
                      >
                        {t('selectionToolbar.completedTitle')}
                      </h3>
                      <div
                        className={`flex items-center gap-3 text-xs ${isDark ? 'text-emerald-300/80' : 'text-emerald-600/80'}`}
                        role="status"
                        aria-live="polite"
                      >
                        {moduleCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Layers size={12} />
                            {moduleCount} {moduleLabel}
                          </span>
                        )}
                        {lessonCount > 0 && (
                          <span className="flex items-center gap-1">
                            <BookOpen size={12} />
                            {lessonCount} {lessonLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sparkle decoration */}
                    <Sparkles
                      size={16}
                      className={`shrink-0 animate-pulse ${isDark ? 'text-yellow-400' : 'text-yellow-500'}`}
                    />
                  </div>

                  {/* Right: CTA Button + Minimize */}
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Open Course Button */}
                    {courseSlug && (
                      <Link href={`/courses/${courseSlug}`}>
                        <Button
                          size="compact"
                          className="border-0 bg-emerald-500 text-white shadow-md shadow-emerald-500/25 transition-all hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                          <span>{t('selectionToolbar.openCourse')}</span>
                          <ExternalLink size={14} className="ml-1.5" />
                        </Button>
                      </Link>
                    )}

                    {/* Minimize button */}
                    <button
                      onClick={() => toggleMinimized(true)}
                      className={`rounded-md p-1.5 transition-colors ${
                        isDark
                          ? 'text-emerald-400 hover:bg-white/5 hover:text-emerald-200'
                          : 'text-emerald-500 hover:bg-emerald-100/50 hover:text-emerald-700'
                      }`}
                      aria-label={t('selectionToolbar.collapsePanel')}
                      title={t('selectionToolbar.swipeToCollapse')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  // Stage 6 Complete state - Ready to Finalize Banner (blue/purple gradient)
  if (isStage6Complete) {
    return (
      <AnimatePresence mode="wait">
        {isMinimized ? (
          /* Edge Tab - minimized state (stage_6_complete) */
          <motion.div
            key="edge-tab-stage6-complete"
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto fixed right-0 bottom-6 z-50"
          >
            <motion.button
              onClick={() => toggleMinimized(false)}
              whileTap={{ scale: 0.98 }}
              className={`group flex items-center gap-1.5 rounded-l-xl py-2.5 pr-2 pl-3 shadow-lg backdrop-blur-md transition-all duration-200 hover:pl-5 ${
                isDark
                  ? 'border border-r-0 border-blue-500/30 bg-gradient-to-r from-blue-900/95 to-indigo-900/95 hover:border-blue-400/50'
                  : 'border border-r-0 border-blue-200/50 bg-gradient-to-r from-blue-50/95 to-indigo-50/95 hover:border-blue-300/70'
              }`}
              aria-label={t('selectionToolbar.expandPanel')}
            >
              <div
                className={`shrink-0 rounded-full border p-1 ${
                  isDark
                    ? 'border-blue-500/30 bg-blue-500/20 text-blue-400'
                    : 'border-blue-200 bg-blue-100 text-blue-600'
                }`}
              >
                <CheckCircle className="h-3 w-3" />
              </div>
              <span className={`text-xs font-medium ${isDark ? 'text-blue-200' : 'text-blue-700'}`}>
                ✓
              </span>
              <ChevronLeft className={`h-3 w-3 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
            </motion.button>
          </motion.div>
        ) : (
          /* Main Ready to Finalize Banner - stage_6_complete state */
          <motion.div
            key="finalize-banner"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ x: 200, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-none fixed right-0 bottom-6 left-0 z-50 flex justify-center px-4"
          >
            <motion.div
              drag="x"
              dragConstraints={{ left: -150, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              style={{ x, opacity }}
              className="pointer-events-auto w-full max-w-3xl touch-pan-y"
              title={t('selectionToolbar.swipeToCollapse')}
            >
              <div
                className={`overflow-hidden rounded-lg shadow-lg backdrop-blur-md ${
                  isDark
                    ? 'border border-blue-500/30 bg-gradient-to-r from-blue-900/95 to-indigo-900/95'
                    : 'border border-blue-200/50 bg-gradient-to-r from-blue-50/95 to-indigo-50/95 shadow-blue-500/10'
                }`}
              >
                {/* Header with finalize content */}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  {/* Left: CheckCircle + Title + Stats */}
                  <div className="flex items-center gap-3 overflow-hidden">
                    {/* CheckCircle Icon */}
                    <div
                      className={`shrink-0 rounded-full p-2 ${
                        isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      <CheckCircle className="h-5 w-5" />
                    </div>

                    {/* Title and Stats */}
                    <div className="flex min-w-0 flex-col">
                      <h3
                        className={`truncate text-sm font-semibold ${isDark ? 'text-blue-100' : 'text-blue-800'}`}
                      >
                        {t('selectionToolbar.allLessonsGenerated')}
                      </h3>
                      <div
                        className={`flex items-center gap-3 text-xs ${isDark ? 'text-blue-300/80' : 'text-blue-600/80'}`}
                        role="status"
                        aria-live="polite"
                      >
                        {moduleCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Layers size={12} />
                            {moduleCount} {moduleLabel}
                          </span>
                        )}
                        {lessonCount > 0 && (
                          <span className="flex items-center gap-1">
                            <BookOpen size={12} />
                            {lessonCount} {lessonLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sparkle decoration */}
                    <Sparkles
                      size={16}
                      className={`shrink-0 animate-pulse ${isDark ? 'text-blue-400' : 'text-blue-500'}`}
                    />
                  </div>

                  {/* Right: Finalize Button + Minimize */}
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Finalize Course Button */}
                    <Button
                      size="compact"
                      onClick={() => void handleFinalizeCourse()}
                      disabled={isFinalizingCourse}
                      className="border-0 bg-blue-500 text-white shadow-md shadow-blue-500/25 transition-all hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      {isFinalizingCourse ? (
                        <>
                          <Loader2 className="animate-spin" size={14} />
                          <span className="ml-1.5">{t('selectionToolbar.finalizing')}</span>
                        </>
                      ) : (
                        <>
                          <span>{t('selectionToolbar.finalizeCourse')}</span>
                          <CheckCircle size={14} className="ml-1.5" />
                        </>
                      )}
                    </Button>

                    {/* Minimize button */}
                    <button
                      onClick={() => toggleMinimized(true)}
                      className={`rounded-md p-1.5 transition-colors ${
                        isDark
                          ? 'text-blue-400 hover:bg-white/5 hover:text-blue-200'
                          : 'text-blue-500 hover:bg-blue-100/50 hover:text-blue-700'
                      }`}
                      aria-label={t('selectionToolbar.collapsePanel')}
                      title={t('selectionToolbar.swipeToCollapse')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  // Generation mode - original UI (includes stage_6_init and stage_6_generating)
  // When stage_6_generating, we show a generating indicator and disable actions
  const showGeneratingIndicator = isStage6Generating || isProcessing

  return (
    <AnimatePresence mode="wait">
      {isMinimized ? (
        /* Edge Tab - minimized state */
        <motion.div
          key="edge-tab"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="pointer-events-auto fixed right-0 bottom-6 z-50"
        >
          <motion.button
            onClick={() => toggleMinimized(false)}
            whileTap={{ scale: 0.98 }}
            className={`group flex items-center gap-1.5 rounded-l-xl py-2.5 pr-2 pl-3 shadow-lg backdrop-blur-md transition-all duration-200 hover:pl-5 ${
              isDark
                ? 'border border-r-0 border-purple-500/30 bg-gray-900/95 hover:border-purple-400/50 hover:bg-gray-800/95'
                : 'border border-r-0 border-purple-200/50 bg-white/95 hover:border-purple-300/70 hover:bg-gray-50/95'
            }`}
            aria-label={t('selectionToolbar.expandPanel')}
          >
            <div
              className={`shrink-0 rounded-full border p-1 ${
                isDark
                  ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                  : 'border-purple-200 bg-purple-50 text-purple-600'
              }`}
            >
              <Sparkles className="h-3 w-3" />
            </div>
            <span className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              6
            </span>
            {isProcessing && (
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
            )}
            <ChevronLeft className={`h-3 w-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          </motion.button>
        </motion.div>
      ) : (
        /* Main Control Banner - full state */
        <motion.div
          key="full-banner"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ x: 200, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="pointer-events-none fixed right-0 bottom-6 left-0 z-50 flex justify-center px-4"
        >
          <motion.div
            drag="x"
            dragConstraints={{ left: -150, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ x, opacity }}
            className="pointer-events-auto w-full max-w-3xl touch-pan-y"
            title={t('selectionToolbar.swipeToCollapse')}
          >
            <div
              className={`overflow-hidden rounded-lg shadow-lg backdrop-blur-md ${
                isDark
                  ? 'border border-purple-500/30 bg-gray-900/95'
                  : 'border border-purple-200/50 bg-white/95 shadow-purple-500/10'
              }`}
            >
              {/* Header with both buttons visible */}
              <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                {/* Left: Drag grip + Icon + Title + Expand toggle */}
                <div
                  className={`-mx-1.5 flex cursor-pointer items-center gap-2 overflow-hidden rounded px-1.5 py-0.5 transition-colors ${
                    isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {/* Drag grip indicator */}
                  <div className="mr-1 flex flex-col gap-0.5">
                    <div
                      className={`h-0.5 w-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`}
                    />
                    <div
                      className={`h-0.5 w-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`}
                    />
                    <div
                      className={`h-0.5 w-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`}
                    />
                  </div>
                  <div
                    className={`shrink-0 rounded-full border p-1 ${
                      isDark
                        ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                        : 'border-purple-200 bg-purple-50 text-purple-600'
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h3
                      className={`truncate text-xs font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                    >
                      {t('selectionToolbar.stageTitle')}
                    </h3>
                    {isProcessing && (
                      <div className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-purple-500" />
                    )}
                    <div className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronUp className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Action buttons + Minimize */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Show generating spinner only when stage_6_generating AND actively processing */}
                  {isStage6Generating && isProcessing ? (
                    /* Generating Status Badge */
                    <div
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${
                        isDark
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      <Loader2 className="animate-spin" size={14} />
                      <span className="text-xs font-medium">
                        {t('selectionToolbar.generatingLessons')}
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Selection mode toggle / Cancel button */}
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => {
                          if (isSelectionMode) {
                            clearSelection()
                            setSelectionMode(false)
                          } else {
                            setSelectionMode(true)
                          }
                        }}
                        disabled={showGeneratingIndicator}
                        className={
                          isDark
                            ? 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700'
                            : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }
                      >
                        {isSelectionMode ? (
                          <>
                            <X size={16} />
                            {t('selectionToolbar.cancel')}
                          </>
                        ) : (
                          <>
                            <CheckSquare size={16} />
                            {t('selectionToolbar.select')}
                          </>
                        )}
                      </Button>

                      {/* Main action button - changes based on selection */}
                      <Button
                        size="compact"
                        onClick={hasSelection ? generateSelected : generateAllLessons}
                        disabled={showGeneratingIndicator}
                        className="border-0 bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/25 transition-all hover:from-purple-600 hover:to-indigo-700"
                      >
                        {showGeneratingIndicator ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : hasSelection ? (
                          <>
                            <Play size={16} />
                            {selectedCount} {getLessonWord(selectedCount, t, 'common')}
                          </>
                        ) : (
                          <>
                            <Rocket size={16} />
                            {t('selectionToolbar.generateAll')}
                          </>
                        )}
                      </Button>
                    </>
                  )}

                  {/* Minimize button */}
                  <button
                    onClick={() => toggleMinimized(true)}
                    className={`rounded-md p-1.5 transition-colors ${
                      isDark
                        ? 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                        : 'text-gray-500 hover:bg-slate-100 hover:text-gray-700'
                    }`}
                    aria-label={t('selectionToolbar.collapsePanel')}
                    title={t('selectionToolbar.swipeToCollapse')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Details - stage description */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className={`px-3 pt-0 pb-2 ${isDark ? 'border-t border-white/5' : 'border-t border-slate-100'}`}
                    >
                      <div
                        className={`pt-2 text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}
                      >
                        <p>{t('selectionToolbar.howToGenerate')}</p>
                        <ul className="mt-1 ml-3 list-disc space-y-0.5">
                          <li>
                            <strong className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                              {t('selectionToolbar.generateAll')}
                            </strong>{' '}
                            — {t('selectionToolbar.generateAllDesc')}
                          </li>
                          <li>
                            <strong className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                              {t('selectionToolbar.select')}
                            </strong>{' '}
                            — {t('selectionToolbar.selectDesc')}
                          </li>
                        </ul>
                        <p className="mt-2 text-gray-500 italic">
                          {t('selectionToolbar.swipeToCollapse')}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Loader2({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
