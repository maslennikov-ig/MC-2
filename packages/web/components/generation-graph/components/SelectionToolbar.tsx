'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Play, X, CheckSquare, Rocket, ChevronUp, ChevronDown, Sparkles, ChevronLeft, ChevronRight, Trophy, ExternalLink, Layers, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOptionalPartialGenerationContext } from '../contexts/PartialGenerationContext';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { CourseStructure } from '@megacampus/shared-types';
import { useTheme } from 'next-themes';
import { Link } from '@/src/i18n/navigation';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { getModuleWord, getLessonWord } from '@/lib/generation-graph/utils/pluralization';

const STORAGE_KEY = 'stage6-toolbar-minimized';

interface SelectionToolbarProps {
  courseId?: string;
  isCompleted?: boolean;
  courseSlug?: string;
  moduleCount?: number;
  lessonCount?: number;
}

/**
 * Stage 6 Control Banner - consistent with MissionControlBanner design.
 * Shows after Stage 5 is complete and lesson nodes are visible.
 * Provides "Generate All" and "Select Lessons" actions.
 * Shows celebration banner when course generation is completed.
 */
export function SelectionToolbar({
  courseId,
  isCompleted = false,
  courseSlug,
  moduleCount = 0,
  lessonCount = 0,
}: SelectionToolbarProps) {
  const contextValue = useOptionalPartialGenerationContext();
  const { selectedNodeId } = useNodeSelection();
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { t } = useTranslation();

  // Swipe tracking
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, 0], [0.5, 1]);

  // Load minimized state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      setIsMinimized(true);
    }
  }, []);

  // Auto-minimize when side panel (NodeDetailsDrawer) opens
  // Stays minimized until user manually expands
  useEffect(() => {
    if (selectedNodeId) {
      setIsMinimized(true);
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }, [selectedNodeId]);

  // Save minimized state to localStorage
  const toggleMinimized = useCallback((minimized: boolean) => {
    setIsMinimized(minimized);
    localStorage.setItem(STORAGE_KEY, String(minimized));
  }, []);

  // Handle swipe gestures
  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Swipe left to minimize (velocity or distance threshold)
    if (info.velocity.x < -500 || info.offset.x < -100) {
      toggleMinimized(true);
    }
    // Reset position
    x.set(0);
  }, [toggleMinimized, x]);

  /**
   * Generate ALL lessons in the course
   */
  const generateAllLessons = useCallback(async () => {
    if (!courseId || !contextValue || isGeneratingAll || contextValue.isGenerating) return;

    setIsGeneratingAll(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('courses')
        .select('course_structure')
        .eq('id', courseId)
        .single();

      if (error || !data?.course_structure) {
        toast.error('Не удалось загрузить структуру курса');
        return;
      }

      const structure = data.course_structure as CourseStructure;
      const sectionIds = structure.sections.map(s => s.section_number);

      if (sectionIds.length === 0) {
        toast.error('Структура курса пуста');
        return;
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
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error?.message || result.message || 'Ошибка запуска генерации';
        toast.error(errorMessage);
        return;
      }

      const resultData = result.result?.data || result;
      toast.success(`Запущена генерация всех ${resultData.jobCount} уроков`);
    } catch (err) {
      console.error('[SelectionToolbar] Network error in generateAllLessons:', err);
      toast.error('Ошибка сети. Проверьте подключение.');
    } finally {
      setIsGeneratingAll(false);
    }
  }, [courseId, contextValue, isGeneratingAll]);

  // For completed state, we don't need contextValue
  if (!isCompleted && !contextValue) return null;

  const {
    selectedCount = 0,
    hasSelection = false,
    isSelectionMode = false,
    setSelectionMode = () => {},
    generateSelected = () => {},
    clearSelection = () => {},
    isGenerating = false,
  } = contextValue || {};

  const isProcessing = isGeneratingAll || isGenerating;

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
            className="fixed bottom-6 right-0 z-50 pointer-events-auto"
          >
            <motion.button
              onClick={() => toggleMinimized(false)}
              whileTap={{ scale: 0.98 }}
              className={`group flex items-center gap-1.5 pr-2 py-2.5 rounded-l-xl shadow-lg backdrop-blur-md transition-all duration-200 pl-3 hover:pl-5 ${
                isDark
                  ? 'bg-gradient-to-r from-emerald-900/95 to-green-900/95 border border-r-0 border-emerald-500/30 hover:border-emerald-400/50'
                  : 'bg-gradient-to-r from-emerald-50/95 to-green-50/95 border border-r-0 border-emerald-200/50 hover:border-emerald-300/70'
              }`}
              aria-label={t('selectionToolbar.expandPanel')}
            >
              <div className={`p-1 rounded-full border shrink-0 ${
                isDark
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-emerald-100 border-emerald-200 text-emerald-600'
              }`}>
                <Trophy className="w-3 h-3" />
              </div>
              <span className={`text-xs font-medium ${isDark ? 'text-emerald-200' : 'text-emerald-700'}`}>
                ✓
              </span>
              <ChevronLeft className={`w-3 h-3 ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`} />
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
            className="fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center"
          >
            <motion.div
              drag="x"
              dragConstraints={{ left: -150, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              style={{ x, opacity }}
              className="w-full max-w-3xl pointer-events-auto touch-pan-y"
              title={t('selectionToolbar.swipeToCollapse')}
            >
              <div className={`backdrop-blur-md rounded-lg shadow-lg overflow-hidden ${
                isDark
                  ? 'bg-gradient-to-r from-emerald-900/95 to-green-900/95 border border-emerald-500/30'
                  : 'bg-gradient-to-r from-emerald-50/95 to-green-50/95 border border-emerald-200/50 shadow-emerald-500/10'
              }`}>

                {/* Header with celebration content */}
                <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                  {/* Left: Trophy + Title + Stats */}
                  <div className="flex items-center gap-3 overflow-hidden">
                    {/* Trophy Icon */}
                    <div className={`p-2 rounded-full shrink-0 ${
                      isDark
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      <Trophy className="w-5 h-5" />
                    </div>

                    {/* Title and Stats */}
                    <div className="flex flex-col min-w-0">
                      <h3 className={`text-sm font-semibold truncate ${isDark ? 'text-emerald-100' : 'text-emerald-800'}`}>
                        {t('selectionToolbar.completedTitle')}
                      </h3>
                      <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-emerald-300/80' : 'text-emerald-600/80'}`} role="status" aria-live="polite">
                        {moduleCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Layers size={12} />
                            {moduleCount} {getModuleWord(moduleCount, t, 'common')}
                          </span>
                        )}
                        {lessonCount > 0 && (
                          <span className="flex items-center gap-1">
                            <BookOpen size={12} />
                            {lessonCount} {getLessonWord(lessonCount, t, 'common')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sparkle decoration */}
                    <Sparkles size={16} className={`shrink-0 animate-pulse ${isDark ? 'text-yellow-400' : 'text-yellow-500'}`} />
                  </div>

                  {/* Right: CTA Button + Minimize */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Open Course Button */}
                    {courseSlug && (
                      <Link href={`/courses/${courseSlug}`}>
                        <Button
                          size="compact"
                          className="bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-md shadow-emerald-500/25 border-0 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                          <span>{t('selectionToolbar.openCourse')}</span>
                          <ExternalLink size={14} className="ml-1.5" />
                        </Button>
                      </Link>
                    )}

                    {/* Minimize button */}
                    <button
                      onClick={() => toggleMinimized(true)}
                      className={`p-1.5 rounded-md transition-colors ${
                        isDark
                          ? 'text-emerald-400 hover:text-emerald-200 hover:bg-white/5'
                          : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100/50'
                      }`}
                      aria-label={t('selectionToolbar.collapsePanel')}
                      title={t('selectionToolbar.swipeToCollapse')}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Generation mode - original UI
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
          className="fixed bottom-6 right-0 z-50 pointer-events-auto"
        >
          <motion.button
            onClick={() => toggleMinimized(false)}
            whileTap={{ scale: 0.98 }}
            className={`group flex items-center gap-1.5 pr-2 py-2.5 rounded-l-xl shadow-lg backdrop-blur-md transition-all duration-200 pl-3 hover:pl-5 ${
              isDark
                ? 'bg-gray-900/95 border border-r-0 border-purple-500/30 hover:bg-gray-800/95 hover:border-purple-400/50'
                : 'bg-white/95 border border-r-0 border-purple-200/50 hover:bg-gray-50/95 hover:border-purple-300/70'
            }`}
            aria-label={t('selectionToolbar.expandPanel')}
          >
            <div className={`p-1 rounded-full border shrink-0 ${
              isDark
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                : 'bg-purple-50 border-purple-200 text-purple-600'
            }`}>
              <Sparkles className="w-3 h-3" />
            </div>
            <span className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              6
            </span>
            {isProcessing && (
              <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
            )}
            <ChevronLeft className={`w-3 h-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
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
          className="fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center"
        >
          <motion.div
            drag="x"
            dragConstraints={{ left: -150, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ x, opacity }}
            className="w-full max-w-3xl pointer-events-auto touch-pan-y"
            title={t('selectionToolbar.swipeToCollapse')}
          >
            <div className={`backdrop-blur-md rounded-lg shadow-lg overflow-hidden ${
              isDark
                ? 'bg-gray-900/95 border border-purple-500/30'
                : 'bg-white/95 border border-purple-200/50 shadow-purple-500/10'
            }`}>

              {/* Header with both buttons visible */}
              <div className="px-3 py-1.5 flex items-center justify-between gap-2">
                {/* Left: Drag grip + Icon + Title + Expand toggle */}
                <div
                  className={`flex items-center gap-2 overflow-hidden cursor-pointer transition-colors rounded px-1.5 py-0.5 -mx-1.5 ${
                    isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {/* Drag grip indicator */}
                  <div className="flex flex-col gap-0.5 mr-1">
                    <div className={`w-0.5 h-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`} />
                    <div className={`w-0.5 h-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`} />
                    <div className={`w-0.5 h-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`} />
                  </div>
                  <div className={`p-1 rounded-full border shrink-0 ${
                    isDark
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                      : 'bg-purple-50 border-purple-200 text-purple-600'
                  }`}>
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className={`text-xs font-medium truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                      {t('selectionToolbar.stageTitle')}
                    </h3>
                    {isProcessing && (
                      <div className="w-1 h-1 bg-purple-500 rounded-full animate-pulse shrink-0" />
                    )}
                    <div className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    </div>
                  </div>
                </div>

                {/* Right: Action buttons + Minimize */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Selection mode toggle / Cancel button */}
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={() => {
                      if (isSelectionMode) {
                        clearSelection();
                        setSelectionMode(false);
                      } else {
                        setSelectionMode(true);
                      }
                    }}
                    className={
                      isDark
                        ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border-gray-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200'
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
                    disabled={isProcessing}
                    className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white transition-all shadow-md shadow-purple-500/25 border-0"
                  >
                    {isProcessing ? (
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

                  {/* Minimize button */}
                  <button
                    onClick={() => toggleMinimized(true)}
                    className={`p-1.5 rounded-md transition-colors ${
                      isDark
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-slate-100'
                    }`}
                    aria-label={t('selectionToolbar.collapsePanel')}
                    title={t('selectionToolbar.swipeToCollapse')}
                  >
                    <ChevronRight className="w-4 h-4" />
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
                    <div className={`px-3 pb-2 pt-0 ${isDark ? 'border-t border-white/5' : 'border-t border-slate-100'}`}>
                      <div className={`pt-2 text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        <p>{t('selectionToolbar.howToGenerate')}</p>
                        <ul className="mt-1 ml-3 list-disc space-y-0.5">
                          <li><strong className={isDark ? 'text-gray-300' : 'text-gray-700'}>{t('selectionToolbar.generateAll')}</strong> — {t('selectionToolbar.generateAllDesc')}</li>
                          <li><strong className={isDark ? 'text-gray-300' : 'text-gray-700'}>{t('selectionToolbar.select')}</strong> — {t('selectionToolbar.selectDesc')}</li>
                        </ul>
                        <p className="mt-2 text-gray-500 italic">{t('selectionToolbar.swipeToCollapse')}</p>
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
  );
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
  );
}
