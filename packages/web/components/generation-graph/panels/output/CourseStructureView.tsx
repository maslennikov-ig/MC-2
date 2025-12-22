'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { PhaseAccordion, AccordionItem } from './PhaseAccordion';
import { CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Clock, Users, BookOpen, GraduationCap, Eye, FileText, Target, ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { SectionAccordion } from './SectionAccordion';
import { LessonRow } from './LessonRow';
import { AddElementChat } from './AddElementChat';
import { VirtualizedSectionsList, shouldUseVirtualization } from './VirtualizedSectionsList';
import { produce } from 'immer';
import { useEditingShortcuts } from '../../hooks/useEditingShortcuts';
import { toast } from 'sonner';
import { useEditHistoryStore } from '@/stores/useEditHistoryStore';
import { updateFieldAction } from '@/app/actions/admin-generation';

interface CourseStructureViewProps {
  data: CourseStructure;
  locale?: 'ru' | 'en';
  courseId?: string;        // Required for editing
  editMode?: boolean;       // Enable editing
  onStructureChange?: (data: CourseStructure) => void; // Optimistic update callback
  autoFocus?: boolean;      // Auto-focus first editable field
  readOnly?: boolean;       // View-only mode (hides edit and regenerate buttons)
}

// Helper for displaying lists as chips
const ChipList = ({ items, variant = 'secondary' }: { items: string[]; variant?: 'secondary' | 'outline' }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item, i) => (
      <Badge key={i} variant={variant} className="text-xs">
        {item}
      </Badge>
    ))}
  </div>
);

// Helper for labeled value display
const LabeledValue = ({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-1", className)}>
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
    <div className="text-sm text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

// Helper for duration formatting
const formatDuration = (minutes: number, locale: 'ru' | 'en'): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const t = translations[locale];

  if (hours > 0 && mins > 0) {
    return `${hours} ${t.hours} ${mins} ${t.minutes}`;
  } else if (hours > 0) {
    return `${hours} ${t.hours}`;
  } else {
    return `${mins} ${t.minutes}`;
  }
};

const translations = {
  ru: {
    courseInfo: 'Информация о курсе',
    targetAudience: 'Целевая аудитория',
    difficulty: 'Сложность',
    duration: 'Длительность',
    prerequisites: 'Требования',
    tags: 'Теги',
    sections: 'Структура курса',
    sectionsDesc: 'Модули и уроки',
    lessons: 'уроков',
    hours: 'ч',
    minutes: 'мин',
    beginner: 'Начинающий',
    intermediate: 'Средний',
    advanced: 'Продвинутый',
    noPrerequisites: 'Без требований',
    description: 'Описание',
    overview: 'Обзор',
    learningOutcomes: 'Результаты обучения',
    assessment: 'Оценивание',
    quizPerSection: 'Тест в конце каждого модуля',
    finalExam: 'Финальный экзамен',
    practicalProjects: 'Практических проектов',
  },
  en: {
    courseInfo: 'Course Information',
    targetAudience: 'Target Audience',
    difficulty: 'Difficulty',
    duration: 'Duration',
    prerequisites: 'Prerequisites',
    tags: 'Tags',
    sections: 'Course Structure',
    sectionsDesc: 'Modules and lessons',
    lessons: 'lessons',
    hours: 'h',
    minutes: 'min',
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    noPrerequisites: 'No prerequisites',
    description: 'Description',
    overview: 'Overview',
    learningOutcomes: 'Learning Outcomes',
    assessment: 'Assessment',
    quizPerSection: 'Quiz at the end of each module',
    finalExam: 'Comprehensive final exam',
    practicalProjects: 'Practical projects',
  },
};

const difficultyLabels = {
  ru: {
    beginner: 'Начинающий',
    intermediate: 'Средний',
    advanced: 'Продвинутый',
  },
  en: {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  },
};

export const CourseStructureView = ({
  data,
  locale = 'ru',
  courseId,
  editMode = false,
  onStructureChange,
  autoFocus = false,
  readOnly = false
}: CourseStructureViewProps) => {
  const t = translations[locale];
  const difficultyLabel = difficultyLabels[locale][data.difficulty_level];

  // Track section modification timestamps for stale detection
  const [sectionTimestamps, setSectionTimestamps] = useState<Map<number, Date>>(new Map());

  // Track lesson modification timestamps for stale detection
  const [lessonTimestamps, setLessonTimestamps] = useState<Map<string, Date>>(new Map());

  // Effective edit mode is false when readOnly is true
  const canEdit = editMode && !readOnly;

  // Determine if virtualization should be used
  const useVirtualization = React.useMemo(() => {
    return shouldUseVirtualization(data.sections);
  }, [data.sections]);

  // Calculate total duration in minutes
  const totalMinutes = data.sections.reduce(
    (sum, section) => sum + section.estimated_duration_minutes,
    0
  );

  // Edit history store
  const { undo, redo, canUndo, canRedo } = useEditHistoryStore();

  // Helper function to apply a value at a field path using Immer
  const applyFieldValue = useCallback(<T,>(data: T, path: string, value: unknown): T => {
    return produce(data, (draft) => {
      const parts = path.replace(/\[/g, '.').replace(/\]/g, '').split('.');
      let current: any = draft;

      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
      }

      current[parts[parts.length - 1]] = value;
    });
  }, []);

  // Keyboard shortcut handlers
  const handleForceSave = useCallback(() => {
    if (!canEdit) return;
    // Trigger a visual feedback - actual saving happens via auto-save in child components
    toast.success(locale === 'ru' ? 'Сохранение изменений...' : 'Saving changes...');
  }, [canEdit, locale]);

  const handleUndo = useCallback(async () => {
    if (!courseId) return;

    const entry = undo();
    if (!entry) return;

    // Apply the previous value to UI
    if (onStructureChange && entry.stageId === 'stage_5') {
      // Reconstruct structure with previous value
      const updatedStructure = applyFieldValue(data, entry.fieldPath, entry.previousValue);
      onStructureChange(updatedStructure);

      // Persist via Server Action
      try {
        await updateFieldAction(
          entry.courseId,
          entry.stageId,
          entry.fieldPath,
          entry.previousValue
        );
        toast.success(locale === 'ru' ? 'Изменение отменено' : 'Change undone');
      } catch (error) {
        console.error('Failed to undo:', error);
        toast.error(locale === 'ru' ? 'Ошибка при отмене' : 'Failed to undo');
      }
    }
  }, [undo, onStructureChange, data, locale, courseId, applyFieldValue]);

  const handleRedo = useCallback(async () => {
    if (!courseId) return;

    const entry = redo();
    if (!entry) return;

    // Apply the new value back
    if (onStructureChange && entry.stageId === 'stage_5') {
      const updatedStructure = applyFieldValue(data, entry.fieldPath, entry.newValue);
      onStructureChange(updatedStructure);

      // Persist via Server Action
      try {
        await updateFieldAction(
          entry.courseId,
          entry.stageId,
          entry.fieldPath,
          entry.newValue
        );
        toast.success(locale === 'ru' ? 'Изменение повторено' : 'Change redone');
      } catch (error) {
        console.error('Failed to redo:', error);
        toast.error(locale === 'ru' ? 'Ошибка при повторе' : 'Failed to redo');
      }
    }
  }, [redo, onStructureChange, data, locale, courseId, applyFieldValue]);

  const handleCancelEdit = useCallback(() => {
    if (!canEdit) return;
    // Blur the active element to trigger auto-save flush
    const activeElement = document.activeElement as HTMLElement;
    activeElement?.blur();
    toast.info(locale === 'ru' ? 'Редактирование отменено' : 'Edit cancelled');
  }, [canEdit, locale]);

  // Register keyboard shortcuts with undo/redo
  useEditingShortcuts({
    onSave: handleForceSave,
    onUndo: canUndo() ? handleUndo : undefined,
    onRedo: canRedo() ? handleRedo : undefined,
    onCancel: handleCancelEdit,
    enabled: !!canEdit,
  });

  // Initialize section timestamps from course structure on mount
  useEffect(() => {
    if (data?.sections) {
      const initial = new Map<number, Date>();
      data.sections.forEach((_, idx) => {
        // Set to current time for initial load
        initial.set(idx, new Date());
      });
      setSectionTimestamps(initial);
    }
  }, [data]);

  // Auto-focus first editable field when panel opens automatically
  useEffect(() => {
    if (!autoFocus || !canEdit) return;

    const timer = setTimeout(() => {
      // Find first editable input/textarea and focus it
      const firstInput = document.querySelector(
        '[data-auto-focus-target="true"]'
      ) as HTMLElement;
      firstInput?.focus();
    }, 200);

    return () => clearTimeout(timer);
  }, [autoFocus, canEdit]);

  // Handler for lesson changes (optimistic updates)
  const handleLessonChange = (sectionIdx: number, lessonIdx: number, updatedLesson: any) => {
    if (!onStructureChange) return;

    // Update lesson timestamp
    setLessonTimestamps((prev) => {
      const updated = new Map(prev);
      updated.set(`${sectionIdx}-${lessonIdx}`, new Date());
      return updated;
    });

    const updatedStructure = produce(data, (draft) => {
      draft.sections[sectionIdx].lessons[lessonIdx] = updatedLesson;
    });

    onStructureChange(updatedStructure);
  };

  // Handler for section changes (optimistic updates)
  const handleSectionChange = (sectionIdx: number, field: string, value: unknown) => {
    if (!onStructureChange) return;

    // Update section timestamp
    setSectionTimestamps((prev) => {
      const updated = new Map(prev);
      updated.set(sectionIdx, new Date());
      return updated;
    });

    const updatedStructure = produce(data, (draft) => {
      const section = draft.sections[sectionIdx] as any;
      section[field] = value;
    });

    onStructureChange(updatedStructure);
  };

  // Handler for lesson added (optimistic updates)
  const handleLessonAdded = (sectionIdx: number, newLesson: Lesson) => {
    if (!onStructureChange) return;

    const updatedStructure = produce(data, (draft) => {
      draft.sections[sectionIdx].lessons.push(newLesson);
    });

    onStructureChange(updatedStructure);
  };

  // Handler for section added (optimistic updates)
  const handleSectionAdded = (newSection: Section) => {
    if (!onStructureChange) return;

    const updatedStructure = produce(data, (draft) => {
      draft.sections.push(newSection);
    });

    onStructureChange(updatedStructure);
  };

  return (
    <div className="space-y-4 p-2">
      {/* Show read-only banner when in read-only mode */}
      {readOnly && (
        <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300">
          <Eye className="inline-block w-4 h-4 mr-2" />
          Режим просмотра / View Only
        </div>
      )}

      {/* Metadata Header Section (always visible) */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 p-4 space-y-4">
        {/* Course Title */}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.course_title}</h2>

        {/* Course Description */}
        <p className="text-sm text-slate-700 dark:text-slate-300">{data.course_description}</p>

        {/* Course Overview (collapsible for long content) */}
        {data.course_overview && (
          <LabeledValue
            label={t.overview}
            value={
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {data.course_overview}
                </p>
              </div>
            }
          />
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700">
          <LabeledValue
            label={t.targetAudience}
            value={
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span>{data.target_audience}</span>
              </div>
            }
          />
          <LabeledValue
            label={t.difficulty}
            value={
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <Badge variant="default">{difficultyLabel}</Badge>
              </div>
            }
          />
          <LabeledValue
            label={t.duration}
            value={
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span>{formatDuration(totalMinutes, locale)}</span>
              </div>
            }
          />
          <LabeledValue
            label={t.sections}
            value={
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span>
                  {data.sections.length} {t.sections.toLowerCase()} · {data.sections.reduce((sum, s) => sum + s.lessons.length, 0)} {t.lessons}
                </span>
              </div>
            }
          />
        </div>

        {/* Prerequisites */}
        <LabeledValue
          label={t.prerequisites}
          value={
            data.prerequisites.length > 0 ? (
              <ChipList items={data.prerequisites} variant="outline" />
            ) : (
              <span className="text-sm text-slate-500 dark:text-slate-400">{t.noPrerequisites}</span>
            )
          }
        />

        {/* Course Tags */}
        <LabeledValue
          label={t.tags}
          value={<ChipList items={data.course_tags} />}
        />

        {/* Learning Outcomes */}
        {data.learning_outcomes && data.learning_outcomes.length > 0 && (
          <LabeledValue
            label={t.learningOutcomes}
            value={
              <div className="space-y-2">
                {data.learning_outcomes.map((outcome, idx) => {
                  // Handle both object format {id, text, language} and string format
                  const text = typeof outcome === 'string' ? outcome : outcome.text;
                  const key = typeof outcome === 'string' ? idx : outcome.id || idx;
                  return (
                    <div key={key} className="flex items-start gap-2">
                      <Target className="h-4 w-4 text-green-500 dark:text-green-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{text}</span>
                    </div>
                  );
                })}
              </div>
            }
          />
        )}

        {/* Assessment Strategy */}
        {data.assessment_strategy && (
          <LabeledValue
            label={t.assessment}
            value={
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {data.assessment_strategy.quiz_per_section && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {t.quizPerSection}
                    </Badge>
                  )}
                  {data.assessment_strategy.final_exam && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <ClipboardCheck className="h-3 w-3" />
                      {t.finalExam}
                    </Badge>
                  )}
                  {data.assessment_strategy.practical_projects > 0 && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {data.assessment_strategy.practical_projects} {t.practicalProjects}
                    </Badge>
                  )}
                </div>
                {data.assessment_strategy.assessment_description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {data.assessment_strategy.assessment_description}
                  </p>
                )}
              </div>
            }
          />
        )}
      </div>

      {/* Sections with Lessons */}
      <PhaseAccordion type="multiple" defaultValue={['sections']}>
        <AccordionItem value="sections" title={t.sections} description={t.sectionsDesc}>
          {useVirtualization ? (
            /* Virtualized rendering for large courses */
            <VirtualizedSectionsList
              sections={data.sections}
              locale={locale}
              editMode={canEdit}
              courseId={courseId}
              onLessonAdded={handleLessonAdded}
              onSectionChange={handleSectionChange}
              sectionTimestamps={sectionTimestamps}
              lessonTimestamps={lessonTimestamps}
              onLessonChange={handleLessonChange}
            />
          ) : (
            /* Non-virtualized rendering for small/medium courses */
            <>
              <SectionAccordion
                sections={data.sections}
                locale={locale}
                editMode={canEdit}
                courseId={courseId}
                onLessonAdded={handleLessonAdded}
                onSectionChange={handleSectionChange}
                sectionTimestamps={sectionTimestamps}
              >
                {(section, sectionIdx) => (
                  <div className="border border-slate-100 dark:border-slate-700 rounded-md overflow-hidden">
                    {section.lessons.map((lesson, lessonIdx) => (
                      <LessonRow
                        key={`lesson-${section.section_number}-${lesson.lesson_number}`}
                        lesson={lesson}
                        sectionNumber={section.section_number}
                        sectionIndex={sectionIdx}
                        lessonIndex={lessonIdx}
                        locale={locale}
                        editMode={canEdit}
                        courseId={courseId}
                        onLessonChange={(updatedLesson) => handleLessonChange(sectionIdx, lessonIdx, updatedLesson)}
                        isFirstLesson={sectionIdx === 0 && lessonIdx === 0}
                        lessonLastModified={lessonTimestamps.get(`${sectionIdx}-${lessonIdx}`)}
                        sectionLastModified={sectionTimestamps.get(sectionIdx)}
                      />
                    ))}
                  </div>
                )}
              </SectionAccordion>

              {/* Add Section Button - Only in edit mode */}
              {canEdit && courseId && (
                <div className="mt-4">
                  <AddElementChat
                    courseId={courseId}
                    elementType="section"
                    parentPath="sections"
                    position="end"
                    locale={locale}
                    onSuccess={(newElement) => handleSectionAdded(newElement as Section)}
                  />
                </div>
              )}
            </>
          )}
        </AccordionItem>
      </PhaseAccordion>
    </div>
  );
};

// Skeleton loader for CourseStructureView
export const CourseStructureViewSkeleton = () => (
  <div className="space-y-4 p-2">
    {/* Metadata Header Skeleton */}
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 p-4 space-y-4">
      {/* Title */}
      <Skeleton className="h-8 w-3/4" />

      {/* Description */}
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-36" />
        </div>
      </div>

      {/* Prerequisites */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-12" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-18 rounded-full" />
          <Skeleton className="h-6 w-22 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </div>

    {/* Sections Skeleton */}
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
      <div className="px-4 py-3">
        <Skeleton className="h-4 w-32 mb-1" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-48" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
