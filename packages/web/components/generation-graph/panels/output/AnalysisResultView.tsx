'use client';

import React, { useEffect, useCallback, useMemo } from 'react';
import { PhaseAccordion, AccordionItem } from './PhaseAccordion';
import { AnalysisResult } from '@megacampus/shared-types';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { EditableField } from './EditableField';
import { EditableChips } from './EditableChips';
import { useAutoSave } from '../../hooks/useAutoSave';
import { updateFieldAction } from '@/app/actions/admin-generation';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { Eye } from 'lucide-react';
import { useEditingShortcuts } from '../../hooks/useEditingShortcuts';
import { toast } from 'sonner';
import { useEditHistoryStore } from '@/stores/useEditHistoryStore';
import { useFileCatalog } from '../../hooks/useFileCatalog';

interface AnalysisResultViewProps {
  data: AnalysisResult;
  locale?: 'ru' | 'en';
  courseId?: string;      // Required for editing
  editable?: boolean;     // Enable edit mode
  autoFocus?: boolean;    // Auto-focus first editable field
  readOnly?: boolean;     // View-only mode (hides edit and regenerate buttons)
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

const translations = {
  ru: {
    classification: 'Классификация курса',
    classificationDesc: 'Категория и контекст курса',
    category: 'Категория',
    confidence: 'Уверенность',
    reasoning: 'Обоснование',
    whyMatters: 'Почему это важно',
    motivators: 'Мотиваторы',
    topicAnalysis: 'Анализ темы',
    topicAnalysisDesc: 'Детали темы и ключевые концепции',
    topic: 'Тема',
    complexity: 'Сложность',
    audience: 'Аудитория',
    keyConcepts: 'Ключевые концепции',
    keywords: 'Ключевые слова',
    structure: 'Рекомендуемая структура',
    structureDesc: 'Объём и распределение уроков',
    totalLessons: 'Уроков',
    totalSections: 'Модулей',
    lessonDuration: 'Длительность урока',
    scopeReasoning: 'Обоснование объёма',
    pedagogy: 'Педагогическая стратегия',
    pedagogyDesc: 'Стиль обучения и подход',
    teachingStyle: 'Стиль',
    practicalFocus: 'Практический фокус',
    interactivity: 'Интерактивность',
    assessmentApproach: 'Подход к оценке',
    assessmentTypes: 'Типы заданий',
    guidance: 'Рекомендации для генерации',
    guidanceDesc: 'Тон, примеры и упражнения',
    tone: 'Тон изложения',
    analogies: 'Аналогии',
    noAnalogies: 'Без аналогий',
    visuals: 'Визуальные элементы',
    exerciseTypes: 'Типы упражнений',
    documents: 'Связь с документами',
    documentsDesc: 'RAG-планирование по модулям',
    section: 'Модуль',
    noDocuments: 'Нет связанных документов',
  },
  en: {
    classification: 'Course Classification',
    classificationDesc: 'Category and course context',
    category: 'Category',
    confidence: 'Confidence',
    reasoning: 'Reasoning',
    whyMatters: 'Why it matters',
    motivators: 'Motivators',
    topicAnalysis: 'Topic Analysis',
    topicAnalysisDesc: 'Topic details and key concepts',
    topic: 'Topic',
    complexity: 'Complexity',
    audience: 'Audience',
    keyConcepts: 'Key Concepts',
    keywords: 'Keywords',
    structure: 'Recommended Structure',
    structureDesc: 'Scope and lesson distribution',
    totalLessons: 'Lessons',
    totalSections: 'Modules',
    lessonDuration: 'Lesson Duration',
    scopeReasoning: 'Scope Reasoning',
    pedagogy: 'Pedagogical Strategy',
    pedagogyDesc: 'Teaching style and approach',
    teachingStyle: 'Style',
    practicalFocus: 'Practical Focus',
    interactivity: 'Interactivity',
    assessmentApproach: 'Assessment Approach',
    assessmentTypes: 'Assessment Types',
    guidance: 'Generation Guidance',
    guidanceDesc: 'Tone, examples, and exercises',
    tone: 'Tone',
    analogies: 'Analogies',
    noAnalogies: 'No analogies',
    visuals: 'Visual Elements',
    exerciseTypes: 'Exercise Types',
    documents: 'Document Relations',
    documentsDesc: 'RAG planning by module',
    section: 'Module',
    noDocuments: 'No linked documents',
  },
};

export const AnalysisResultView = ({ data, locale = 'ru', courseId, editable = false, autoFocus = false, readOnly = false }: AnalysisResultViewProps) => {
  const t = translations[locale];

  // Fetch file catalog for document name resolution
  const { getFilename } = useFileCatalog(courseId || '');

  // Helper to get display name for document ID
  const getDocumentDisplayName = useMemo(() => {
    return (documentId: string): string => {
      const filename = getFilename(documentId);
      if (filename) return filename;
      // Fallback: show shortened UUID if no filename found
      return documentId.length > 12 ? `${documentId.slice(0, 8)}...` : documentId;
    };
  }, [getFilename]);

  // Initialize useAutoSave only when in edit mode
  const { status, error, save, flush } = useAutoSave(
    async (input: { courseId: string; stageId: 'stage_4'; fieldPath: string; value: unknown }) => {
      return await updateFieldAction(input.courseId, input.stageId, input.fieldPath, input.value);
    },
    { courseId: courseId || '', stageId: 'stage_4' as const },
    { debounceMs: 1000 }
  );

  const canEdit = editable && courseId && !readOnly;

  // Edit history store
  const { undo, redo, canUndo, canRedo } = useEditHistoryStore();

  // Keyboard shortcut handlers
  const handleForceSave = useCallback(() => {
    if (!canEdit) return;
    // Trigger immediate flush of pending changes
    flush();
    toast.success(locale === 'ru' ? 'Изменения сохранены' : 'Changes saved');
  }, [canEdit, flush, locale]);

  const handleUndo = useCallback(async () => {
    if (!courseId) return;

    const entry = undo();
    if (!entry) return;

    // Apply the previous value to local data
    if (entry.stageId === 'stage_4') {
      // For AnalysisResultView, we need to update the data prop
      // Since we don't have onDataChange callback, we'll just persist to server
      // and rely on parent component to re-fetch or update

      try {
        await updateFieldAction(
          entry.courseId,
          entry.stageId,
          entry.fieldPath,
          entry.previousValue
        );
        toast.success(locale === 'ru' ? 'Изменение отменено' : 'Change undone');

        // Trigger immediate save to sync UI
        flush();
      } catch (error) {
        console.error('Failed to undo:', error);
        toast.error(locale === 'ru' ? 'Ошибка при отмене' : 'Failed to undo');
      }
    }
  }, [undo, locale, courseId, flush]);

  const handleRedo = useCallback(async () => {
    if (!courseId) return;

    const entry = redo();
    if (!entry) return;

    // Apply the new value back
    if (entry.stageId === 'stage_4') {
      try {
        await updateFieldAction(
          entry.courseId,
          entry.stageId,
          entry.fieldPath,
          entry.newValue
        );
        toast.success(locale === 'ru' ? 'Изменение повторено' : 'Change redone');

        // Trigger immediate save to sync UI
        flush();
      } catch (error) {
        console.error('Failed to redo:', error);
        toast.error(locale === 'ru' ? 'Ошибка при повторе' : 'Failed to redo');
      }
    }
  }, [redo, locale, courseId, flush]);

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

  // Guard against incomplete data during stage transition
  // Check all required nested objects to prevent runtime errors
  if (
    !data?.course_category?.primary ||
    !data?.recommended_structure ||
    !data?.topic_analysis ||
    !data?.pedagogical_strategy ||
    !data?.generation_guidance ||
    !data?.contextual_language
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Skeleton className="h-8 w-48 mb-4" />
        <p className="text-sm">Загрузка данных анализа...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {/* Show read-only banner when in read-only mode */}
      {readOnly && (
        <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300">
          <Eye className="inline-block w-4 h-4 mr-2" />
          Режим просмотра / View Only
        </div>
      )}

      {/* Show save status indicator at the top when editing */}
      {canEdit && status !== 'idle' && (
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-4 py-2 border-b border-slate-200 dark:border-slate-700">
          <SaveStatusIndicator status={status} error={error} />
        </div>
      )}

      <PhaseAccordion type="multiple" defaultValue={['classification', 'topic', 'structure']}>
        {/* 1. Course Classification */}
        <AccordionItem value="classification" title={t.classification} description={t.classificationDesc}>
          <div className="space-y-4">
            {canEdit ? (
              <div data-auto-focus-target="true">
                <EditableField
                  config={{
                    path: 'course_category.primary',
                    label: t.category,
                    type: 'select',
                    options: ['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']
                  }}
                  value={data.course_category.primary}
                  onChange={(v) => save('course_category.primary', v)}
                  onBlur={flush}
                  status={status}
                />
              </div>
            ) : (
              <LabeledValue label={t.category} value={
                <Badge variant="default">{data.course_category.primary}</Badge>
              } />
            )}
            <LabeledValue label={t.confidence} value={`${Math.round(data.course_category.confidence * 100)}%`} />
            <LabeledValue label={t.reasoning} value={data.course_category.reasoning} />
            {canEdit ? (
              <EditableField
                config={{
                  path: 'contextual_language.why_matters_context',
                  label: t.whyMatters,
                  type: 'textarea'
                }}
                value={data.contextual_language.why_matters_context}
                onChange={(v) => save('contextual_language.why_matters_context', v)}
                onBlur={flush}
                status={status}
              />
            ) : (
              <LabeledValue label={t.whyMatters} value={data.contextual_language.why_matters_context} />
            )}
            {canEdit ? (
              <EditableField
                config={{
                  path: 'contextual_language.motivators',
                  label: t.motivators,
                  type: 'textarea'
                }}
                value={data.contextual_language.motivators}
                onChange={(v) => save('contextual_language.motivators', v)}
                onBlur={flush}
                status={status}
              />
            ) : (
              <LabeledValue label={t.motivators} value={data.contextual_language.motivators} />
            )}
          </div>
        </AccordionItem>

        {/* 2. Topic Analysis */}
        <AccordionItem value="topic" title={t.topicAnalysis} description={t.topicAnalysisDesc}>
          <div className="space-y-4">
            {canEdit ? (
              <EditableField
                config={{
                  path: 'topic_analysis.determined_topic',
                  label: t.topic,
                  type: 'text'
                }}
                value={data.topic_analysis.determined_topic}
                onChange={(v) => save('topic_analysis.determined_topic', v)}
                onBlur={flush}
                status={status}
              />
            ) : (
              <LabeledValue label={t.topic} value={data.topic_analysis.determined_topic} />
            )}
            <div className="grid grid-cols-2 gap-4">
              <LabeledValue label={t.complexity} value={data.topic_analysis.complexity} />
              <LabeledValue label={t.audience} value={data.topic_analysis.target_audience} />
            </div>
            {canEdit ? (
              <EditableChips
                label={t.keyConcepts}
                items={data.topic_analysis.key_concepts}
                onChange={(items) => save('topic_analysis.key_concepts', items)}
                onBlur={flush}
                status={status}
              />
            ) : (
              <LabeledValue label={t.keyConcepts} value={<ChipList items={data.topic_analysis.key_concepts} />} />
            )}
            <LabeledValue label={t.keywords} value={<ChipList items={data.topic_analysis.domain_keywords} variant="outline" />} />
          </div>
        </AccordionItem>

        {/* 3. Recommended Structure */}
        <AccordionItem value="structure" title={t.structure} description={t.structureDesc}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {canEdit ? (
                <EditableField
                  config={{
                    path: 'recommended_structure.total_lessons',
                    label: t.totalLessons,
                    type: 'number',
                    min: 10,
                    max: 100
                  }}
                  value={data.recommended_structure.total_lessons}
                  onChange={(v) => save('recommended_structure.total_lessons', v)}
                  onBlur={flush}
                  status={status}
                />
              ) : (
                <LabeledValue label={t.totalLessons} value={data.recommended_structure.total_lessons} />
              )}
              {canEdit ? (
                <EditableField
                  config={{
                    path: 'recommended_structure.total_sections',
                    label: t.totalSections,
                    type: 'number',
                    min: 1,
                    max: 30
                  }}
                  value={data.recommended_structure.total_sections}
                  onChange={(v) => save('recommended_structure.total_sections', v)}
                  onBlur={flush}
                  status={status}
                />
              ) : (
                <LabeledValue label={t.totalSections} value={data.recommended_structure.total_sections} />
              )}
              <LabeledValue label={t.lessonDuration} value={`${data.recommended_structure.lesson_duration_minutes} мин`} />
            </div>
            <LabeledValue label={t.scopeReasoning} value={data.recommended_structure.scope_reasoning} />
            {data.recommended_structure.scope_warning && (
              <div className="p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded text-sm text-amber-800 dark:text-amber-300">
                {data.recommended_structure.scope_warning}
              </div>
            )}
          </div>
        </AccordionItem>

        {/* 4. Pedagogical Strategy */}
        <AccordionItem value="pedagogy" title={t.pedagogy} description={t.pedagogyDesc}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {canEdit ? (
                <EditableField
                  config={{
                    path: 'pedagogical_strategy.teaching_style',
                    label: t.teachingStyle,
                    type: 'select',
                    options: ['hands-on', 'theory-first', 'project-based', 'mixed']
                  }}
                  value={data.pedagogical_strategy.teaching_style}
                  onChange={(v) => save('pedagogical_strategy.teaching_style', v)}
                  onBlur={flush}
                  status={status}
                />
              ) : (
                <LabeledValue label={t.teachingStyle} value={data.pedagogical_strategy.teaching_style} />
              )}
              <LabeledValue label={t.practicalFocus} value={data.pedagogical_strategy.practical_focus} />
              <LabeledValue label={t.interactivity} value={data.pedagogical_strategy.interactivity_level} />
            </div>
            <LabeledValue label={t.assessmentApproach} value={data.pedagogical_strategy.assessment_approach} />
            {canEdit ? (
              <EditableChips
                label={t.assessmentTypes}
                items={data.pedagogical_patterns.assessment_types}
                onChange={(items) => save('pedagogical_patterns.assessment_types', items)}
                onBlur={flush}
                status={status}
              />
            ) : (
              <LabeledValue label={t.assessmentTypes} value={<ChipList items={data.pedagogical_patterns.assessment_types} />} />
            )}
          </div>
        </AccordionItem>

        {/* 5. Generation Guidance */}
        <AccordionItem value="guidance" title={t.guidance} description={t.guidanceDesc}>
          <div className="space-y-4">
            <LabeledValue label={t.tone} value={data.generation_guidance.tone} />
            {canEdit ? (
              <>
                <EditableField
                  config={{
                    path: 'generation_guidance.use_analogies',
                    label: t.analogies,
                    type: 'toggle'
                  }}
                  value={data.generation_guidance.use_analogies}
                  onChange={(v) => save('generation_guidance.use_analogies', v)}
                  onBlur={flush}
                  status={status}
                />
                {data.generation_guidance.use_analogies && (
                  <EditableChips
                    label="Специфичные аналогии"
                    items={data.generation_guidance.specific_analogies || []}
                    onChange={(items) => save('generation_guidance.specific_analogies', items)}
                    onBlur={flush}
                    status={status}
                  />
                )}
              </>
            ) : (
              <LabeledValue label={t.analogies} value={
                data.generation_guidance.use_analogies && data.generation_guidance.specific_analogies && data.generation_guidance.specific_analogies.length > 0
                  ? <ChipList items={data.generation_guidance.specific_analogies} />
                  : t.noAnalogies
              } />
            )}
            <LabeledValue label={t.visuals} value={<ChipList items={data.generation_guidance.include_visuals} />} />
            <LabeledValue label={t.exerciseTypes} value={<ChipList items={data.generation_guidance.exercise_types} />} />
          </div>
        </AccordionItem>

        {/* 6. Document Relations */}
        <AccordionItem value="documents" title={t.documents} description={t.documentsDesc}>
          <div className="space-y-4">
            {data.document_relevance_mapping && Object.entries(data.document_relevance_mapping).length > 0 ? (
              Object.entries(data.document_relevance_mapping).map(([sectionId, mapping]) => (
                <div key={sectionId} className="border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0">
                  <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{t.section} {sectionId}</span>
                  <ChipList items={mapping.primary_documents.map(getDocumentDisplayName)} variant="outline" />
                </div>
              ))
            ) : (
              <span className="text-sm text-slate-500 dark:text-slate-400">{t.noDocuments}</span>
            )}
          </div>
        </AccordionItem>
      </PhaseAccordion>
    </div>
  );
};

// Skeleton loader for AnalysisResultView
export const AnalysisResultViewSkeleton = () => (
  <div className="space-y-4 p-2">
    {/* Classification section skeleton */}
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
      <div className="px-4 py-3">
        <Skeleton className="h-4 w-40 mb-1" />
        <Skeleton className="h-3 w-60" />
      </div>
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>

    {/* Topic section skeleton */}
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
      <div className="px-4 py-3">
        <Skeleton className="h-4 w-32 mb-1" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </div>

    {/* Structure section skeleton */}
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
      <div className="px-4 py-3">
        <Skeleton className="h-4 w-44 mb-1" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
      </div>
    </div>
  </div>
);
