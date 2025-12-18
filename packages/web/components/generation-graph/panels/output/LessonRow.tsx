'use client';

import React, { useState, useMemo } from 'react';
import { Lesson } from '@megacampus/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Target, BookMarked, Dumbbell, ChevronDown, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditableField } from './EditableField';
import { EditableChips } from './EditableChips';
import { useAutoSave } from '../../hooks/useAutoSave';
import { updateFieldAction, deleteElementAction } from '@/app/actions/admin-generation';
import type { FieldConfig } from './types';
import { produce } from 'immer';
import { StaleDataIndicator, calculateStaleStatus, type StaleStatus } from './StaleDataIndicator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface LessonRowProps {
  lesson: Lesson;
  sectionNumber: number;
  sectionIndex: number;      // For field path
  lessonIndex: number;
  locale?: 'ru' | 'en';
  editMode?: boolean;        // Enable editing
  courseId?: string;         // Required for editing
  onLessonChange?: (lesson: Lesson) => void; // Optimistic update callback
  isFirstLesson?: boolean;   // Whether this is the first lesson (for auto-focus)
  lessonLastModified?: Date;
  sectionLastModified?: Date;
}

const translations = {
  ru: {
    objectives: 'Цели урока',
    topics: 'Ключевые темы',
    exercises: 'Практические задания',
    minutes: 'мин',
  },
  en: {
    objectives: 'Lesson Objectives',
    topics: 'Key Topics',
    exercises: 'Practical Exercises',
    minutes: 'min',
  },
};

/**
 * LessonRow Component
 *
 * Compact row design showing lesson number (Section.Lesson format),
 * title, duration, objectives, topics, and practical exercises.
 *
 * Layout:
 * - Row header: Lesson badge + title + duration badge
 * - Expanded content: Objectives, topics, and exercises
 */
export const LessonRow = ({
  lesson,
  sectionNumber,
  sectionIndex,
  lessonIndex,
  locale = 'ru',
  editMode = false,
  courseId,
  onLessonChange,
  isFirstLesson = false,
  lessonLastModified,
  sectionLastModified,
}: LessonRowProps) => {
  const t = translations[locale];
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const rowRef = React.useRef<HTMLDivElement>(null);

  // Format lesson number as "Section.Lesson" (e.g., "1.1", "2.3")
  const lessonNumber = `${sectionNumber}.${lesson.lesson_number}`;

  // Check if lesson has content (for smart confirmation per FR-011a)
  const hasContent = lesson.lesson_objectives.length > 0 || lesson.key_topics.length > 0;

  // Calculate stale status
  const staleStatus = useMemo(() => {
    if (!lessonLastModified || !sectionLastModified) return 'fresh' as StaleStatus;
    return calculateStaleStatus(lessonLastModified, sectionLastModified);
  }, [lessonLastModified, sectionLastModified]);

  // Initialize useAutoSave for field updates
  const { status, error, save, flush } = useAutoSave(
    async (input: { courseId: string; stageId: 'stage_5'; fieldPath: string; value: unknown }) => {
      return await updateFieldAction(input.courseId, input.stageId, input.fieldPath, input.value);
    },
    { courseId: courseId || '', stageId: 'stage_5' as const },
    { debounceMs: 1000 }
  );

  const canEdit = editMode && courseId;

  // Helper to construct field path
  const getFieldPath = (field: string) => {
    return `sections[${sectionIndex}].lessons[${lessonIndex}].${field}`;
  };

  // Handle field changes with optimistic updates
  const handleFieldChange = (field: string, value: unknown) => {
    if (!onLessonChange) return;

    const updatedLesson = produce(lesson, (draft: any) => {
      (draft as any)[field] = value;
    });

    onLessonChange(updatedLesson);
  };

  // Handle lesson deletion
  const handleDelete = async () => {
    if (!courseId) return;

    setIsDeleting(true);
    try {
      const elementPath = `sections[${sectionIndex}].lessons[${lessonIndex}]`;
      await deleteElementAction(courseId, elementPath, true);

      toast.success(
        locale === 'ru'
          ? `Урок ${lessonNumber} удален`
          : `Lesson ${lessonNumber} deleted`
      );

      // Parent component will handle UI update via revalidation
    } catch (error) {
      toast.error(
        locale === 'ru'
          ? 'Не удалось удалить урок'
          : 'Failed to delete lesson'
      );
      console.error('Delete lesson error:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Field configs
  const titleConfig: FieldConfig = {
    path: getFieldPath('lesson_title'),
    label: locale === 'ru' ? 'Название урока' : 'Lesson Title',
    type: 'text',
    placeholder: locale === 'ru' ? 'Введите название...' : 'Enter title...',
  };

  const durationConfig: FieldConfig = {
    path: getFieldPath('estimated_duration_minutes'),
    label: locale === 'ru' ? 'Длительность (мин)' : 'Duration (min)',
    type: 'number',
    min: 3,
    max: 45,
  };

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    // Only handle keys when the row container itself is focused
    if (e.target !== rowRef.current) return;

    switch (e.key) {
      case 'Enter':
      case ' ': // Spacebar
        e.preventDefault();
        setIsExpanded(!isExpanded);
        break;
      case 'Escape':
        if (isExpanded) {
          e.preventDefault();
          setIsExpanded(false);
        }
        break;
    }
  };

  return (
    <StaleDataIndicator
      status={staleStatus}
      lastModified={lessonLastModified}
      parentLastModified={sectionLastModified}
      locale={locale}
    >
      <div
        ref={rowRef}
        className="border-b border-slate-100 dark:border-slate-700 last:border-0"
        role="listitem"
        aria-label={`${locale === 'ru' ? 'Урок' : 'Lesson'} ${lessonNumber}: ${lesson.lesson_title}`}
        tabIndex={0}
        onKeyDown={handleRowKeyDown}
      >
        {/* Row Header - Clickable for UX consistency with sections */}
        <div
          className="px-4 py-3 space-y-2 cursor-pointer rounded-md transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
          onClick={(e) => {
            // Don't toggle if clicking on interactive elements (inputs, buttons, badges with handlers)
            const target = e.target as HTMLElement;
            const isInteractive = target.closest('button') ||
              target.closest('input') ||
              target.closest('textarea') ||
              target.closest('[role="combobox"]') ||
              target.closest('[data-no-expand]');
            if (!isInteractive) {
              setIsExpanded(!isExpanded);
            }
          }}
          role="button"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? (locale === 'ru' ? 'Свернуть' : 'Collapse') : (locale === 'ru' ? 'Развернуть' : 'Expand')} ${locale === 'ru' ? 'урок' : 'lesson'} ${lessonNumber}`}
        >
          <div className="flex items-center gap-3">
            {/* Lesson Number Badge */}
            <Badge variant="outline" className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0 text-xs">
              {lessonNumber}
            </Badge>

            {/* Lesson Title - Editable or static */}
            <div className="flex-1 min-w-0" {...(canEdit && isFirstLesson ? { 'data-auto-focus-target': 'true' } : {})}>
              {canEdit ? (
                <EditableField
                  config={titleConfig}
                  value={lesson.lesson_title}
                  onChange={(value) => {
                    handleFieldChange('lesson_title', value);
                    save(getFieldPath('lesson_title'), value);
                  }}
                  onBlur={flush}
                  status={status}
                  className="mb-0"
                />
              ) : (
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {lesson.lesson_title}
                </span>
              )}
            </div>

            {/* Duration - Editable or static */}
            <div className="shrink-0">
              {canEdit ? (
                <div className="w-32">
                  <EditableField
                    config={durationConfig}
                    value={lesson.estimated_duration_minutes}
                    onChange={(value) => {
                      handleFieldChange('estimated_duration_minutes', value);
                      save(getFieldPath('estimated_duration_minutes'), value);
                    }}
                    onBlur={flush}
                    status={status}
                    className="mb-0"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{lesson.estimated_duration_minutes} {t.minutes}</span>
                </div>
              )}
            </div>

            {/* Delete Button (only when canEdit) */}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-400 hover:text-red-500 shrink-0"
                onClick={() => hasContent ? setShowDeleteConfirm(true) : handleDelete()}
                disabled={isDeleting}
                aria-label={locale === 'ru' ? 'Удалить урок' : 'Delete lesson'}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Chevron indicator (visual only - row header handles click) */}
            <div className="shrink-0 p-1">
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
              />
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div
            id={`lesson-${sectionIndex}-${lessonIndex}-content`}
            className="px-4 py-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700"
            role="region"
            aria-labelledby={`lesson-${sectionIndex}-${lessonIndex}-header`}
          >
            {/* Learning Objectives - Editable or static */}
            {canEdit ? (
              <EditableChips
                label={t.objectives}
                items={lesson.lesson_objectives}
                onChange={(items) => {
                  handleFieldChange('lesson_objectives', items);
                  save(getFieldPath('lesson_objectives'), items);
                }}
                onBlur={flush}
                status={status}
                error={error}
                placeholder={locale === 'ru' ? 'Добавить цель...' : 'Add objective...'}
                maxItems={5}
              />
            ) : (
              lesson.lesson_objectives.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                    <h4 className="text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      {t.objectives}
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {lesson.lesson_objectives.map((objective, idx) => (
                      <Badge
                        key={`objective-${lessonIndex}-${idx}`}
                        variant="secondary"
                        className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                      >
                        {objective}
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Key Topics - Editable or static */}
            {canEdit ? (
              <EditableChips
                label={t.topics}
                items={lesson.key_topics}
                onChange={(items) => {
                  handleFieldChange('key_topics', items);
                  save(getFieldPath('key_topics'), items);
                }}
                onBlur={flush}
                status={status}
                error={error}
                placeholder={locale === 'ru' ? 'Добавить тему...' : 'Add topic...'}
                maxItems={10}
              />
            ) : (
              lesson.key_topics.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <BookMarked className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                    <h4 className="text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      {t.topics}
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {lesson.key_topics.map((topic, idx) => (
                      <Badge
                        key={`topic-${lessonIndex}-${idx}`}
                        variant="outline"
                        className="text-xs"
                      >
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Practical Exercises (read-only for now) */}
            {lesson.practical_exercises.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                  <h4 className="text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                    {t.exercises}
                  </h4>
                  <Badge variant="secondary" className="text-xs ml-1">
                    {lesson.practical_exercises.length}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {lesson.practical_exercises.map((exercise, idx) => (
                    <div
                      key={`exercise-${lessonIndex}-${idx}`}
                      className="text-xs text-slate-600 dark:text-slate-400 pl-3 border-l-2 border-slate-200 dark:border-slate-600"
                    >
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {exercise.exercise_title}
                      </span>
                      {' · '}
                      <span className="text-slate-500 dark:text-slate-400 italic">
                        {exercise.exercise_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === 'ru' ? 'Удалить урок?' : 'Delete lesson?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {locale === 'ru'
                ? 'Урок содержит цели и темы. Это действие нельзя отменить.'
                : 'Lesson contains objectives and topics. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {locale === 'ru' ? 'Отмена' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting
                ? (locale === 'ru' ? 'Удаление...' : 'Deleting...')
                : (locale === 'ru' ? 'Удалить' : 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StaleDataIndicator>
  );
};
