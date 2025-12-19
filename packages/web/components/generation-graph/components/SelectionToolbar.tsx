'use client';

import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, CheckSquare, Square, Rocket } from 'lucide-react';
import { useOptionalPartialGenerationContext } from '../contexts/PartialGenerationContext';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { CourseStructure } from '@megacampus/shared-types';

interface SelectionToolbarProps {
  courseId?: string;
}

/**
 * Floating toolbar that appears when items are selected for partial generation.
 * Shows selection count and provides "Generate Selected" action.
 * Also provides "Generate All" button to start full course generation.
 */
export function SelectionToolbar({ courseId }: SelectionToolbarProps) {
  // Use optional hook - returns null when not inside PartialGenerationProvider
  const contextValue = useOptionalPartialGenerationContext();
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  /**
   * Generate ALL lessons in the course
   */
  const generateAllLessons = useCallback(async () => {
    if (!courseId || !contextValue || isGeneratingAll || contextValue.isGenerating) return;

    setIsGeneratingAll(true);
    try {
      // Fetch course structure to get all section IDs
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

      // Generate all sections (this generates all lessons in them)
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

  return (
    <AnimatePresence>
      {/* Left side buttons: Selection Mode + Generate All */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2"
      >
        {/* Generate All Button */}
        {courseId && (
          <button
            onClick={generateAllLessons}
            disabled={isGeneratingAll || isGenerating}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-all
              ${isGeneratingAll || isGenerating
                ? 'bg-slate-400 text-white cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700'
              }
            `}
            title="Запустить генерацию всех уроков"
          >
            <Rocket size={18} />
            <span className="text-sm font-medium">
              {isGeneratingAll ? 'Загрузка...' : 'Всё'}
            </span>
          </button>
        )}

        {/* Selection Mode Toggle Button */}
        <button
          onClick={() => {
            if (isSelectionMode) {
              clearSelection();
            }
            setSelectionMode(!isSelectionMode);
          }}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-all
            ${isSelectionMode
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }
          `}
          title={isSelectionMode ? 'Выйти из режима выбора' : 'Режим выбора'}
        >
          {isSelectionMode ? <CheckSquare size={18} /> : <Square size={18} />}
          <span className="text-sm font-medium">
            {isSelectionMode ? 'Выбор' : 'Выбрать'}
          </span>
        </button>
      </motion.div>

      {/* Floating Action Bar - shown when items are selected */}
      {hasSelection && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700">
            {/* Selection Count */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {selectedCount}
                </span>
              </div>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {selectedCount === 1 ? 'урок выбран' :
                 selectedCount < 5 ? 'урока выбрано' : 'уроков выбрано'}
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />

            {/* Generate Button */}
            <button
              onClick={generateSelected}
              disabled={isGenerating}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                ${isGenerating
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                }
              `}
            >
              <Play size={16} />
              <span>Сгенерировать</span>
            </button>

            {/* Clear Selection */}
            <button
              onClick={clearSelection}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Очистить выбор"
            >
              <X size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
