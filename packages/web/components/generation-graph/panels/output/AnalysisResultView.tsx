'use client'

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react'
import { PhaseAccordion, AccordionItem } from './PhaseAccordion'
import { AnalysisResult } from '@megacampus/shared-types'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { EditableField } from './EditableField'
import { EditableChips } from './EditableChips'
import { useAutoSave, SaveStatus } from '../../hooks/useAutoSave'
import {
  updateFieldAction,
  checkDownstreamStagesAction,
  deleteDownstreamStagesAction,
} from '@/app/actions/admin-generation'
import { SaveStatusIndicator } from './SaveStatusIndicator'
import { Eye } from 'lucide-react'
import { useEditingShortcuts } from '../../hooks/useEditingShortcuts'
import { toast } from 'sonner'
import { useEditHistoryStore } from '@/stores/useEditHistoryStore'
import { useFileCatalog } from '../../hooks/useFileCatalog'
import { CascadeStageDeleteModal, DownstreamStagesInfo } from './CascadeStageDeleteModal'

interface AnalysisResultViewProps {
  data: AnalysisResult
  locale?: 'ru' | 'en'
  courseId?: string // Required for editing
  editable?: boolean // Enable edit mode
  autoFocus?: boolean // Auto-focus first editable field
  readOnly?: boolean // View-only mode (hides edit and regenerate buttons)
}

// Helper for displaying lists as chips
const ChipList = ({
  items,
  variant = 'secondary',
}: {
  items: string[]
  variant?: 'secondary' | 'outline'
}) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item, i) => (
      <Badge key={i} variant={variant} className="text-xs">
        {item}
      </Badge>
    ))}
  </div>
)

// Helper for labeled value display
const LabeledValue = ({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) => (
  <div className={cn('space-y-1', className)}>
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
    <div className="text-sm text-slate-900 dark:text-slate-100">{value}</div>
  </div>
)

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
    assessmentApproach: 'Подход к оценке',
    progressionLogic: 'Логика прогресса',
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
    assessmentApproach: 'Assessment Approach',
    progressionLogic: 'Progression Logic',
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
}

export const AnalysisResultView = ({
  data,
  locale = 'ru',
  courseId,
  editable = false,
  autoFocus = false,
  readOnly = false,
}: AnalysisResultViewProps) => {
  const t = translations[locale]

  // Fetch file catalog for document name resolution
  const { getFilename } = useFileCatalog(courseId || '')

  // Helper to get display name for document ID
  const getDocumentDisplayName = useMemo(() => {
    return (documentId: string): string => {
      const filename = getFilename(documentId)
      if (filename) return filename
      // Fallback: show shortened UUID if no filename found
      return documentId.length > 12 ? `${documentId.slice(0, 8)}...` : documentId
    }
  }, [getFilename])

  // Initialize useAutoSave only when in edit mode
  const { status, error, save, flush } = useAutoSave(
    async (input: { courseId: string; stageId: 'stage_4'; fieldPath: string; value: unknown }) => {
      return await updateFieldAction(input.courseId, input.stageId, input.fieldPath, input.value)
    },
    { courseId: courseId || '', stageId: 'stage_4' as const },
    { debounceMs: 1000 }
  )

  // Per-field save status tracking (fixes race condition with rapid edits)
  const [fieldStatuses, setFieldStatuses] = useState<Map<string, SaveStatus>>(new Map())
  const lastSavedFieldRef = useRef<string | null>(null)

  // Cascade delete modal state
  const [cascadeModalOpen, setCascadeModalOpen] = useState(false)
  const [downstreamInfo, setDownstreamInfo] = useState<DownstreamStagesInfo | null>(null)
  const [pendingChange, setPendingChange] = useState<{ fieldPath: string; value: unknown } | null>(
    null
  )
  const [isDeleting, setIsDeleting] = useState(false)
  // Track if we've already checked and confirmed deletion for this session
  const downstreamDeletedRef = useRef(false)
  // Key to force re-render of EditableFields when cascade is canceled (resets local state to original values)
  const [fieldResetKey, setFieldResetKey] = useState(0)

  // Helper to actually perform the save
  const performSave = useCallback(
    (fieldPath: string, value: unknown) => {
      // Set this field to 'saving' immediately
      setFieldStatuses((prev) => {
        const next = new Map(prev)
        next.set(fieldPath, 'saving')
        return next
      })
      lastSavedFieldRef.current = fieldPath
      save(fieldPath, value)
    },
    [save]
  )

  // Async handler that checks for downstream stages first
  const handleFieldSaveAsync = useCallback(
    async (fieldPath: string, value: unknown) => {
      // If we've already deleted downstream stages in this session, just save
      if (downstreamDeletedRef.current) {
        performSave(fieldPath, value)
        return
      }

      // Check for downstream stages
      if (!courseId) {
        performSave(fieldPath, value)
        return
      }

      try {
        const info = await checkDownstreamStagesAction(courseId)

        // If no downstream stages exist, just save
        if (!info.hasStage5 && !info.hasStage6) {
          performSave(fieldPath, value)
          return
        }

        // Downstream stages exist - show modal
        setDownstreamInfo(info)
        setPendingChange({ fieldPath, value })
        setCascadeModalOpen(true)
      } catch (error) {
        console.error('Failed to check downstream stages:', error)
        // On error, proceed with save anyway (fail open for UX)
        performSave(fieldPath, value)
      }
    },
    [courseId, performSave]
  )

  // Sync wrapper for EditableField onChange (avoids @typescript-eslint/no-misused-promises)
  const handleFieldSave = useCallback(
    (fieldPath: string, value: unknown) => {
      void handleFieldSaveAsync(fieldPath, value)
    },
    [handleFieldSaveAsync]
  )

  // Handle cascade delete confirmation (async handler)
  const handleCascadeConfirmAsync = useCallback(async () => {
    if (!courseId || !pendingChange) return

    setIsDeleting(true)
    try {
      // Delete downstream stages
      const result = await deleteDownstreamStagesAction(courseId, 4)

      toast.success(
        locale === 'ru'
          ? `Удалено: ${result.deletedLessonsCount} уроков, ${result.deletedSectionsCount} модулей`
          : `Deleted: ${result.deletedLessonsCount} lessons, ${result.deletedSectionsCount} sections`
      )

      // Mark as deleted for this session so we don't ask again
      downstreamDeletedRef.current = true

      // Now apply the pending change
      performSave(pendingChange.fieldPath, pendingChange.value)

      // Close modal and clear state
      setCascadeModalOpen(false)
      setPendingChange(null)
      setDownstreamInfo(null)
    } catch (error) {
      console.error('Failed to delete downstream stages:', error)
      toast.error(
        locale === 'ru' ? 'Ошибка при удалении данных' : 'Failed to delete downstream data'
      )
    } finally {
      setIsDeleting(false)
    }
  }, [courseId, pendingChange, performSave, locale])

  // Sync wrapper for void callback (avoids @typescript-eslint/no-misused-promises)
  const handleCascadeConfirm = useCallback(() => {
    void handleCascadeConfirmAsync()
  }, [handleCascadeConfirmAsync])

  // Handle cascade delete cancellation
  const handleCascadeCancel = useCallback(() => {
    setCascadeModalOpen(false)
    setPendingChange(null)
    setDownstreamInfo(null)
    // Force re-render of EditableFields to revert their local state to original values
    setFieldResetKey((prev) => prev + 1)
  }, [])

  // Get status for a specific field from the Map
  const getFieldStatus = useCallback(
    (fieldPath: string): SaveStatus => {
      return fieldStatuses.get(fieldPath) ?? 'idle'
    },
    [fieldStatuses]
  )

  // Update per-field status when save completes or errors
  useEffect(() => {
    if ((status === 'saved' || status === 'error') && lastSavedFieldRef.current) {
      const fieldPath = lastSavedFieldRef.current

      // Update this field's status
      setFieldStatuses((prev) => {
        const next = new Map(prev)
        next.set(fieldPath, status)
        return next
      })

      // Clear after 2 seconds with isMounted guard
      let isMounted = true
      const timer = setTimeout(() => {
        if (isMounted) {
          setFieldStatuses((prev) => {
            const next = new Map(prev)
            next.delete(fieldPath)
            return next
          })
        }
      }, 2000)

      return () => {
        isMounted = false
        clearTimeout(timer)
      }
    }
    return undefined
  }, [status])

  const canEdit = editable && courseId && !readOnly

  // Edit history store
  const { undo, redo, canUndo, canRedo } = useEditHistoryStore()

  // Keyboard shortcut handlers
  const handleForceSave = useCallback(() => {
    if (!canEdit) return
    // Trigger immediate flush of pending changes
    flush()
    toast.success(locale === 'ru' ? 'Изменения сохранены' : 'Changes saved')
  }, [canEdit, flush, locale])

  const handleUndo = useCallback(async () => {
    if (!courseId) return

    const entry = undo()
    if (!entry) return

    // Apply the previous value to local data
    if (entry.stageId === 'stage_4') {
      // For AnalysisResultView, we need to update the data prop
      // Since we don't have onDataChange callback, we'll just persist to server
      // and rely on parent component to re-fetch or update

      try {
        await updateFieldAction(entry.courseId, entry.stageId, entry.fieldPath, entry.previousValue)
        toast.success(locale === 'ru' ? 'Изменение отменено' : 'Change undone')

        // Trigger immediate save to sync UI
        flush()
      } catch (error) {
        console.error('Failed to undo:', error)
        toast.error(locale === 'ru' ? 'Ошибка при отмене' : 'Failed to undo')
      }
    }
  }, [undo, locale, courseId, flush])

  const handleRedo = useCallback(async () => {
    if (!courseId) return

    const entry = redo()
    if (!entry) return

    // Apply the new value back
    if (entry.stageId === 'stage_4') {
      try {
        await updateFieldAction(entry.courseId, entry.stageId, entry.fieldPath, entry.newValue)
        toast.success(locale === 'ru' ? 'Изменение повторено' : 'Change redone')

        // Trigger immediate save to sync UI
        flush()
      } catch (error) {
        console.error('Failed to redo:', error)
        toast.error(locale === 'ru' ? 'Ошибка при повторе' : 'Failed to redo')
      }
    }
  }, [redo, locale, courseId, flush])

  const handleCancelEdit = useCallback(() => {
    if (!canEdit) return
    // Blur the active element to trigger auto-save flush
    const activeElement = document.activeElement as HTMLElement
    activeElement?.blur()
    toast.info(locale === 'ru' ? 'Редактирование отменено' : 'Edit cancelled')
  }, [canEdit, locale])

  // Register keyboard shortcuts with undo/redo
  // Wrap async handlers to satisfy void return type requirement
  useEditingShortcuts({
    onSave: handleForceSave,
    onUndo: canUndo() ? () => void handleUndo() : undefined,
    onRedo: canRedo() ? () => void handleRedo() : undefined,
    onCancel: handleCancelEdit,
    enabled: !!canEdit,
  })

  // Auto-focus first editable field when panel opens automatically
  useEffect(() => {
    if (!autoFocus || !canEdit) return

    const timer = setTimeout(() => {
      // Find first editable input/textarea and focus it
      const firstInput = document.querySelector('[data-auto-focus-target="true"]') as HTMLElement
      firstInput?.focus()
    }, 200)

    return () => clearTimeout(timer)
  }, [autoFocus, canEdit])

  // Guard against incomplete data during stage transition
  // Check all required nested objects to prevent runtime errors
  // NOTE: contextual_language is now optional (deprecated field)
  if (
    !data?.course_category?.primary ||
    !data?.recommended_structure ||
    !data?.topic_analysis ||
    !data?.pedagogical_strategy ||
    !data?.generation_guidance
  ) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center py-8">
        <Skeleton className="mb-4 h-8 w-48" />
        <p className="text-sm">Загрузка данных анализа...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-2">
      {/* Cascade Delete Modal */}
      {downstreamInfo && (
        <CascadeStageDeleteModal
          isOpen={cascadeModalOpen}
          onClose={handleCascadeCancel}
          onConfirm={handleCascadeConfirm}
          downstreamInfo={downstreamInfo}
          locale={locale}
          isDeleting={isDeleting}
        />
      )}

      {/* Show read-only banner when in read-only mode */}
      {readOnly && (
        <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          <Eye className="mr-2 inline-block h-4 w-4" />
          Режим просмотра / View Only
        </div>
      )}

      {/* Show save status indicator at the top when editing */}
      {canEdit && status !== 'idle' && (
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <SaveStatusIndicator status={status} error={error} />
        </div>
      )}

      <PhaseAccordion
        key={fieldResetKey}
        type="multiple"
        defaultValue={['classification', 'topic', 'structure']}
      >
        {/* 1. Course Classification */}
        <AccordionItem
          value="classification"
          title={t.classification}
          description={t.classificationDesc}
        >
          <div className="space-y-4">
            {canEdit ? (
              <div data-auto-focus-target="true">
                <EditableField
                  config={{
                    path: 'course_category.primary',
                    label: t.category,
                    type: 'select',
                    options: [
                      'professional',
                      'personal',
                      'creative',
                      'hobby',
                      'spiritual',
                      'academic',
                    ],
                  }}
                  value={data.course_category.primary}
                  onChange={(v) => handleFieldSave('course_category.primary', v)}
                  onBlur={flush}
                  status={getFieldStatus('course_category.primary')}
                />
              </div>
            ) : (
              <LabeledValue
                label={t.category}
                value={<Badge variant="default">{data.course_category.primary}</Badge>}
              />
            )}
            <LabeledValue
              label={t.confidence}
              value={`${Math.round(data.course_category.confidence * 100)}%`}
            />
            <LabeledValue label={t.reasoning} value={data.course_category.reasoning} />
            {/* DEPRECATED: contextual_language is no longer generated for new courses */}
            {data.contextual_language && (
              <>
                {canEdit ? (
                  <EditableField
                    config={{
                      path: 'contextual_language.why_matters_context',
                      label: t.whyMatters,
                      type: 'textarea',
                    }}
                    value={data.contextual_language.why_matters_context}
                    onChange={(v) => handleFieldSave('contextual_language.why_matters_context', v)}
                    onBlur={flush}
                    status={getFieldStatus('contextual_language.why_matters_context')}
                  />
                ) : (
                  <LabeledValue
                    label={t.whyMatters}
                    value={data.contextual_language.why_matters_context}
                  />
                )}
                {canEdit ? (
                  <EditableField
                    config={{
                      path: 'contextual_language.motivators',
                      label: t.motivators,
                      type: 'textarea',
                    }}
                    value={data.contextual_language.motivators}
                    onChange={(v) => handleFieldSave('contextual_language.motivators', v)}
                    onBlur={flush}
                    status={getFieldStatus('contextual_language.motivators')}
                  />
                ) : (
                  <LabeledValue label={t.motivators} value={data.contextual_language.motivators} />
                )}
              </>
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
                  type: 'text',
                }}
                value={data.topic_analysis.determined_topic}
                onChange={(v) => handleFieldSave('topic_analysis.determined_topic', v)}
                onBlur={flush}
                status={getFieldStatus('topic_analysis.determined_topic')}
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
                onChange={(items) => handleFieldSave('topic_analysis.key_concepts', items)}
                onBlur={flush}
                status={getFieldStatus('topic_analysis.key_concepts')}
              />
            ) : (
              <LabeledValue
                label={t.keyConcepts}
                value={<ChipList items={data.topic_analysis.key_concepts} />}
              />
            )}
            <LabeledValue
              label={t.keywords}
              value={<ChipList items={data.topic_analysis.domain_keywords} variant="outline" />}
            />
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
                    max: 100,
                  }}
                  value={data.recommended_structure.total_lessons}
                  onChange={(v) => handleFieldSave('recommended_structure.total_lessons', v)}
                  onBlur={flush}
                  status={getFieldStatus('recommended_structure.total_lessons')}
                />
              ) : (
                <LabeledValue
                  label={t.totalLessons}
                  value={data.recommended_structure.total_lessons}
                />
              )}
              {canEdit ? (
                <EditableField
                  config={{
                    path: 'recommended_structure.total_sections',
                    label: t.totalSections,
                    type: 'number',
                    min: 1,
                    max: 30,
                  }}
                  value={data.recommended_structure.total_sections}
                  onChange={(v) => handleFieldSave('recommended_structure.total_sections', v)}
                  onBlur={flush}
                  status={getFieldStatus('recommended_structure.total_sections')}
                />
              ) : (
                <LabeledValue
                  label={t.totalSections}
                  value={data.recommended_structure.total_sections}
                />
              )}
              <LabeledValue
                label={t.lessonDuration}
                value={`${data.recommended_structure.lesson_duration_minutes} мин`}
              />
            </div>
            <LabeledValue
              label={t.scopeReasoning}
              value={data.recommended_structure.scope_reasoning}
            />
            {data.recommended_structure.scope_warning && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {data.recommended_structure.scope_warning}
              </div>
            )}
          </div>
        </AccordionItem>

        {/* 4. Pedagogical Strategy */}
        <AccordionItem value="pedagogy" title={t.pedagogy} description={t.pedagogyDesc}>
          <div className="space-y-4">
            {canEdit ? (
              <EditableField
                config={{
                  path: 'pedagogical_strategy.assessment_approach',
                  label: t.assessmentApproach,
                  type: 'textarea',
                }}
                value={data.pedagogical_strategy.assessment_approach}
                onChange={(v) => handleFieldSave('pedagogical_strategy.assessment_approach', v)}
                onBlur={flush}
                status={getFieldStatus('pedagogical_strategy.assessment_approach')}
              />
            ) : (
              <LabeledValue
                label={t.assessmentApproach}
                value={data.pedagogical_strategy.assessment_approach}
              />
            )}
            {canEdit ? (
              <EditableField
                config={{
                  path: 'pedagogical_strategy.progression_logic',
                  label: t.progressionLogic,
                  type: 'textarea',
                }}
                value={data.pedagogical_strategy.progression_logic}
                onChange={(v) => handleFieldSave('pedagogical_strategy.progression_logic', v)}
                onBlur={flush}
                status={getFieldStatus('pedagogical_strategy.progression_logic')}
              />
            ) : (
              <LabeledValue
                label={t.progressionLogic}
                value={data.pedagogical_strategy.progression_logic}
              />
            )}
            {canEdit ? (
              <EditableChips
                label={t.assessmentTypes}
                items={data.pedagogical_patterns.assessment_types}
                onChange={(items) =>
                  handleFieldSave('pedagogical_patterns.assessment_types', items)
                }
                onBlur={flush}
                status={getFieldStatus('pedagogical_patterns.assessment_types')}
              />
            ) : (
              <LabeledValue
                label={t.assessmentTypes}
                value={<ChipList items={data.pedagogical_patterns.assessment_types} />}
              />
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
                    type: 'toggle',
                  }}
                  value={data.generation_guidance.use_analogies}
                  onChange={(v) => handleFieldSave('generation_guidance.use_analogies', v)}
                  onBlur={flush}
                  status={getFieldStatus('generation_guidance.use_analogies')}
                />
                {data.generation_guidance.use_analogies && (
                  <EditableChips
                    label="Специфичные аналогии"
                    items={data.generation_guidance.specific_analogies || []}
                    onChange={(items) =>
                      handleFieldSave('generation_guidance.specific_analogies', items)
                    }
                    onBlur={flush}
                    status={getFieldStatus('generation_guidance.specific_analogies')}
                  />
                )}
              </>
            ) : (
              <LabeledValue
                label={t.analogies}
                value={
                  data.generation_guidance.use_analogies &&
                  data.generation_guidance.specific_analogies &&
                  data.generation_guidance.specific_analogies.length > 0 ? (
                    <ChipList items={data.generation_guidance.specific_analogies} />
                  ) : (
                    t.noAnalogies
                  )
                }
              />
            )}
            <LabeledValue
              label={t.visuals}
              value={<ChipList items={data.generation_guidance.include_visuals} />}
            />
            <LabeledValue
              label={t.exerciseTypes}
              value={<ChipList items={data.generation_guidance.exercise_types} />}
            />
          </div>
        </AccordionItem>

        {/* 6. Document Relations */}
        <AccordionItem value="documents" title={t.documents} description={t.documentsDesc}>
          <div className="space-y-4">
            {data.document_relevance_mapping &&
            Object.entries(data.document_relevance_mapping).length > 0 ? (
              Object.entries(data.document_relevance_mapping).map(([sectionId, mapping]) => (
                <div
                  key={sectionId}
                  className="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-700"
                >
                  <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                    {t.section} {sectionId}
                  </span>
                  <ChipList
                    items={mapping.primary_documents.map(getDocumentDisplayName)}
                    variant="outline"
                  />
                </div>
              ))
            ) : (
              <span className="text-sm text-slate-500 dark:text-slate-400">{t.noDocuments}</span>
            )}
          </div>
        </AccordionItem>
      </PhaseAccordion>
    </div>
  )
}

// Skeleton loader for AnalysisResultView
export const AnalysisResultViewSkeleton = () => (
  <div className="space-y-4 p-2">
    {/* Classification section skeleton */}
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="px-4 py-3">
        <Skeleton className="mb-1 h-4 w-40" />
        <Skeleton className="h-3 w-60" />
      </div>
      <div className="space-y-4 border-t border-slate-100 px-4 py-3 dark:border-slate-700">
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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="px-4 py-3">
        <Skeleton className="mb-1 h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="space-y-4 border-t border-slate-100 px-4 py-3 dark:border-slate-700">
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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="px-4 py-3">
        <Skeleton className="mb-1 h-4 w-44" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="space-y-4 border-t border-slate-100 px-4 py-3 dark:border-slate-700">
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
)
