'use client';

import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, CheckSquare, Rocket, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOptionalPartialGenerationContext } from '../contexts/PartialGenerationContext';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { CourseStructure } from '@megacampus/shared-types';
import { useTheme } from 'next-themes';

interface SelectionToolbarProps {
  courseId?: string;
}

/**
 * Stage 6 Control Banner - consistent with MissionControlBanner design.
 * Shows after Stage 5 is complete and lesson nodes are visible.
 * Provides "Generate All" and "Select Lessons" actions.
 */
export function SelectionToolbar({ courseId }: SelectionToolbarProps) {
  const contextValue = useOptionalPartialGenerationContext();
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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

  if (!contextValue) return null;

  const {
    selectedCount,
    hasSelection,
    isSelectionMode,
    setSelectionMode,
    generateSelected,
    clearSelection,
    isGenerating,
  } = contextValue;

  const isProcessing = isGeneratingAll || isGenerating;

  return (
    <>
      {/* Main Control Banner - matches MissionControlBanner design */}
      <div className="fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="w-full max-w-3xl pointer-events-auto"
        >
          <div className={`backdrop-blur-md rounded-xl shadow-lg overflow-hidden ${
            isDark
              ? 'bg-gray-900/95 border border-purple-500/30'
              : 'bg-white/95 border border-purple-200/50 shadow-purple-500/10'
          }`}>

            {/* Header with both buttons visible */}
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              {/* Left: Icon + Title + Expand toggle */}
              <div
                className={`flex items-center gap-3 overflow-hidden cursor-pointer transition-colors rounded-lg px-2 py-1 -mx-2 ${
                  isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                }`}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <div className={`p-2 rounded-full border shrink-0 ${
                  isDark
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                    : 'bg-purple-50 border-purple-200 text-purple-600'
                }`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className={`text-sm font-bold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    Этап 6: Генерация
                  </h3>
                  {isProcessing && (
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse shrink-0" />
                  )}
                  <div className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Right: Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Selection mode toggle / Cancel button */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (isSelectionMode) {
                      clearSelection();
                      setSelectionMode(false);
                    } else {
                      setSelectionMode(true);
                    }
                  }}
                  className={`h-9 px-4 text-sm font-medium ${
                    isDark
                      ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border-gray-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200'
                  }`}
                >
                  {isSelectionMode ? (
                    <>
                      <X className="w-3.5 h-3.5 mr-1.5" />
                      Отмена
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                      Выбрать уроки
                    </>
                  )}
                </Button>

                {/* Main action button - changes based on selection */}
                <Button
                  size="sm"
                  onClick={hasSelection ? generateSelected : generateAllLessons}
                  disabled={isProcessing}
                  className="h-9 px-5 text-sm font-medium bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white transition-all shadow-lg shadow-purple-500/25 border-0"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : hasSelection ? (
                    <>
                      <Play className="w-3.5 h-3.5 mr-1.5" />
                      Сгенерировать {selectedCount} {selectedCount === 1 ? 'урок' : selectedCount < 5 ? 'урока' : 'уроков'}
                    </>
                  ) : (
                    <>
                      <Rocket className="w-3.5 h-3.5 mr-1.5" />
                      Запустить всё
                    </>
                  )}
                </Button>
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
                  <div className={`px-4 pb-4 pt-0 ${isDark ? 'border-t border-white/5' : 'border-t border-slate-100'}`}>
                    <div className={`pt-3 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      <p>Структура курса готова. Выберите способ генерации контента:</p>
                      <ul className="mt-2 ml-4 list-disc space-y-1">
                        <li><strong className={isDark ? 'text-gray-300' : 'text-gray-700'}>Запустить всё</strong> — сгенерировать контент для всех уроков сразу</li>
                        <li><strong className={isDark ? 'text-gray-300' : 'text-gray-700'}>Выбрать</strong> — выбрать отдельные уроки и сгенерировать только их</li>
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

    </>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
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
