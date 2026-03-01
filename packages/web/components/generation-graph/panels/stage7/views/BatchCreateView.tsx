/**
 * BatchCreateView Component
 *
 * Multi-step inline wizard for creating enrichments across multiple lessons.
 * Renders inside the inspector panel (not a modal).
 *
 * Steps:
 * 1. Select enrichment type and configure settings
 * 2. Select target lessons from a scrollable grouped list
 * 3. Confirm batch operation
 * 4. Track progress with BatchProgressPanel
 *
 * @module components/generation-graph/panels/stage7/views/BatchCreateView
 */

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import { useSupabase } from '@/lib/supabase/browser-client'
import {
  ENRICHMENT_TYPE_CONFIG,
  type EnrichmentType,
} from '@/lib/generation-graph/enrichment-config'
import {
  CREATEABLE_TYPE_GROUPS,
  type CreateableEnrichmentType,
  getFormConfig,
  getDefaultSettings,
  type FormFieldConfig,
} from '../forms/enrichment-form-config'
import { useStaticGraph } from '../../../contexts/StaticGraphContext'
import { useEnrichmentInspectorStore } from '../../../stores/enrichment-inspector-store'
import { useBatchEnrichmentStore } from '../../../stores/batch-enrichment-store'
import { BatchProgressPanel, type BatchLessonInfo } from '../components/BatchProgressPanel'
import { logger } from '@/lib/client-logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LessonData {
  id: string
  label: string
  title: string
  sectionTitle: string
  sectionIndex: number
  lessonIndex: number
}

interface SectionGroup {
  sectionIndex: number
  sectionTitle: string
  lessons: LessonData[]
}

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const t = useTranslations('enrichments')

  return (
    <div className="text-muted-foreground flex items-center gap-2 px-4 py-2 text-xs">
      <span>{t('batch.step', { current: currentStep, total: totalSteps })}</span>
      <div className="flex gap-1">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 w-6 rounded-full',
              i + 1 <= currentStep ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Type & Settings
// ---------------------------------------------------------------------------

function TypeSelectionStep({
  selectedType,
  settings,
  onSelectType,
  onSettingsChange,
  onNext,
}: {
  selectedType: CreateableEnrichmentType | null
  settings: Record<string, unknown>
  onSelectType: (type: CreateableEnrichmentType) => void
  onSettingsChange: (settings: Record<string, unknown>) => void
  onNext: () => void
}) {
  const t = useTranslations('enrichments')

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Type Selection Grid */}
          <div>
            <Label className="text-muted-foreground mb-2 block text-xs font-medium tracking-wide uppercase">
              {t('batch.selectType')}
            </Label>

            {CREATEABLE_TYPE_GROUPS.map((group) => (
              <div key={group.groupKey} className="mb-3">
                <p className="text-muted-foreground mb-1.5 text-xs">
                  {t(`inspector.groups.${group.groupKey}` as Parameters<typeof t>[0])}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {group.types.map((type) => {
                    const config = ENRICHMENT_TYPE_CONFIG[type]
                    const Icon = config.icon

                    return (
                      <button
                        key={type}
                        onClick={() => onSelectType(type)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all',
                          selectedType === type
                            ? 'border-primary bg-primary/5 ring-primary/20 ring-1'
                            : 'hover:bg-accent border-transparent'
                        )}
                      >
                        <div className={cn('rounded p-1', config.bgClass)}>
                          <Icon className={cn('h-4 w-4', config.colorClass)} />
                        </div>
                        <span className="w-full truncate text-center text-[10px] font-medium">
                          {t(`types.${type}` as Parameters<typeof t>[0])}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Settings Form (if type has settings) */}
          {selectedType && (
            <SettingsForm
              type={selectedType}
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
          )}
        </div>
      </ScrollArea>

      {/* Next button */}
      <div className="border-t p-4">
        <Button onClick={onNext} disabled={!selectedType} className="w-full">
          {t('batch.next')}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Renders dynamic settings form fields based on form config
 */
function SettingsForm({
  type,
  settings,
  onSettingsChange,
}: {
  type: CreateableEnrichmentType
  settings: Record<string, unknown>
  onSettingsChange: (settings: Record<string, unknown>) => void
}) {
  const t = useTranslations('enrichments')
  const formConfig = getFormConfig(type)

  if (!formConfig) return null

  const updateField = (fieldName: string, value: unknown) => {
    onSettingsChange({ ...settings, [fieldName]: value })
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t('batch.settings')}
      </Label>

      {formConfig.fields.map((field) => (
        <SettingsField
          key={field.name}
          field={field}
          formKey={formConfig.formKey}
          value={settings[field.name] ?? field.defaultValue}
          onChange={(v) => updateField(field.name, v)}
        />
      ))}
    </div>
  )
}

/**
 * Individual settings field renderer
 */
function SettingsField({
  field,
  formKey,
  value,
  onChange,
}: {
  field: FormFieldConfig
  formKey: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  const t = useTranslations('enrichments')

  const labelPath = `forms.${formKey}.${field.labelKey}` as Parameters<typeof t>[0]

  switch (field.widget) {
    case 'select':
      return (
        <div>
          <Label className="text-sm">{t(labelPath)}</Label>
          <Select value={String(value)} onValueChange={onChange}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(`forms.${formKey}.${opt.labelKey}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )

    case 'slider':
      return (
        <div>
          <Label className="text-sm">{t(labelPath)}</Label>
          <Slider
            value={[Number(value)]}
            onValueChange={([v]) => onChange(v)}
            min={field.min}
            max={field.max}
            step={field.step}
            className="mt-2"
          />
          <span className="text-muted-foreground mt-1 block text-sm">
            {field.formatValue ? field.formatValue(Number(value)) : String(value)}
          </span>
        </div>
      )

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked)} />
          <Label className="cursor-pointer text-sm">{t(labelPath)}</Label>
        </div>
      )

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Step 2: Lesson Selection
// ---------------------------------------------------------------------------

function LessonSelectionStep({
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onNext,
  onBack,
  courseId,
  enrichmentType,
}: {
  selectedIds: string[]
  onToggle: (lessonId: string) => void
  onSelectAll: (ids: string[]) => void
  onDeselectAll: () => void
  onNext: () => void
  onBack: () => void
  courseId: string
  enrichmentType: CreateableEnrichmentType
}) {
  const t = useTranslations('enrichments')
  const { supabase } = useSupabase()
  const [sectionGroups, setSectionGroups] = useState<SectionGroup[]>([])
  const [existingEnrichments, setExistingEnrichments] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  // Fetch sections and lessons for the course
  useEffect(() => {
    let cancelled = false

    async function fetchLessons() {
      setIsLoading(true)
      try {
        // Fetch sections
        const { data: sections, error: sectionsError } = await supabase
          .from('sections')
          .select('id, title, order_index')
          .eq('course_id', courseId)
          .order('order_index', { ascending: true })

        if (sectionsError || !sections) {
          logger.warn('[BatchCreateView] Failed to fetch sections', { error: sectionsError })
          setIsLoading(false)
          return
        }

        // Fetch all lessons for these sections
        const sectionIds = sections.map((s) => s.id)
        const { data: lessons, error: lessonsError } = await supabase
          .from('lessons')
          .select('id, title, section_id, order_index')
          .in('section_id', sectionIds)
          .order('order_index', { ascending: true })

        if (lessonsError || !lessons) {
          logger.warn('[BatchCreateView] Failed to fetch lessons', { error: lessonsError })
          setIsLoading(false)
          return
        }

        // Fetch existing enrichments of this type for all lessons
        const lessonIds = lessons.map((l) => l.id)
        const { data: existing } = await supabase
          .from('lesson_enrichments')
          .select('lesson_id')
          .in('lesson_id', lessonIds)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('enrichment_type', enrichmentType as any)

        if (cancelled) return

        const existingSet = new Set(existing?.map((e) => e.lesson_id) ?? [])
        setExistingEnrichments(existingSet)

        // Group lessons by section
        const groups: SectionGroup[] = sections.map((section) => ({
          sectionIndex: section.order_index,
          sectionTitle: section.title || `Module ${section.order_index}`,
          lessons: lessons
            .filter((l) => l.section_id === section.id)
            .map((l) => ({
              id: l.id,
              label: `${section.order_index}.${l.order_index}`,
              title: l.title || `Lesson ${l.order_index}`,
              sectionTitle: section.title || `Module ${section.order_index}`,
              sectionIndex: section.order_index,
              lessonIndex: l.order_index,
            })),
        }))

        setSectionGroups(groups)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void fetchLessons()

    return () => {
      cancelled = true
    }
  }, [supabase, courseId, enrichmentType])

  // All lesson UUIDs for select all
  const allLessonIds = useMemo(
    () => sectionGroups.flatMap((g) => g.lessons.map((l) => l.id)),
    [sectionGroups]
  )

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with select all/deselect all + counter */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-muted-foreground text-sm">
          {t('batch.selectedCount', { count: selectedIds.length })}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onSelectAll(allLessonIds)}>
            {t('batch.selectAll')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDeselectAll}>
            {t('batch.deselectAll')}
          </Button>
        </div>
      </div>

      {/* Scrollable lesson list grouped by section */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {sectionGroups.map((group) => (
            <div key={group.sectionIndex}>
              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                {group.sectionTitle}
              </p>
              <div className="space-y-1">
                {group.lessons.map((lesson) => {
                  const hasExisting = existingEnrichments.has(lesson.id)
                  const isSelected = selectedIds.includes(lesson.id)

                  return (
                    <label
                      key={lesson.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
                        isSelected && 'border-primary/30 bg-primary/5',
                        hasExisting && 'opacity-60'
                      )}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => onToggle(lesson.id)} />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">
                          {lesson.label}: {lesson.title}
                        </span>
                      </div>
                      {hasExisting && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {t('batch.alreadyExists')}
                        </Badge>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer with back/next buttons */}
      <div className="flex gap-3 border-t p-4">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {t('batch.back')}
        </Button>
        <Button onClick={onNext} disabled={selectedIds.length === 0} className="flex-1">
          {t('batch.next')}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Confirmation
// ---------------------------------------------------------------------------

function ConfirmationStep({
  enrichmentType,
  selectedCount,
  settings,
  isSubmitting,
  onConfirm,
  onBack,
}: {
  enrichmentType: CreateableEnrichmentType
  selectedCount: number
  settings: Record<string, unknown>
  isSubmitting: boolean
  onConfirm: () => void
  onBack: () => void
}) {
  const t = useTranslations('enrichments')
  const typeConfig = ENRICHMENT_TYPE_CONFIG[enrichmentType]
  const TypeIcon = typeConfig.icon
  const typeName = t(`types.${enrichmentType}` as Parameters<typeof t>[0])

  // Format settings summary
  const formConfig = getFormConfig(enrichmentType)
  const settingsSummary = formConfig?.fields
    .map((field) => {
      const value = settings[field.name] ?? field.defaultValue
      const labelPath = `forms.${formConfig.formKey}.${field.labelKey}` as Parameters<typeof t>[0]
      return `${t(labelPath)}: ${formatSettingValue(field, value, t, formConfig.formKey)}`
    })
    .filter(Boolean)

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          {/* Type info */}
          <div className="flex items-center gap-3">
            <div className={cn('rounded-lg p-2.5', typeConfig.bgClass)}>
              <TypeIcon className={cn('h-6 w-6', typeConfig.colorClass)} />
            </div>
            <div>
              <h3 className="font-medium">{typeName}</h3>
              <p className="text-muted-foreground text-sm">
                {t('batch.confirmDescription', {
                  count: selectedCount,
                  type: typeName,
                })}
              </p>
            </div>
          </div>

          {/* Settings summary */}
          {settingsSummary && settingsSummary.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {t('batch.settings')}
              </Label>
              {settingsSummary.map((line, i) => (
                <p key={i} className="text-sm">
                  {line}
                </p>
              ))}
            </div>
          )}

          {/* Count summary */}
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold">{selectedCount}</div>
            <div className="text-muted-foreground text-sm">
              {t('batch.selectedCount', { count: selectedCount })}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex gap-3 border-t p-4">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting} className="flex-1">
          {t('batch.cancel')}
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting} className="flex-1">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('batch.startGeneration')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Format a settings value for display in the confirmation step
 */
function formatSettingValue(
  field: FormFieldConfig,
  value: unknown,
  t: ReturnType<typeof useTranslations<'enrichments'>>,
  formKey: string
): string {
  if (field.widget === 'select' && field.options) {
    const option = field.options.find((o) => o.value === String(value))
    if (option) {
      return t(`forms.${formKey}.${option.labelKey}` as Parameters<typeof t>[0])
    }
  }
  if (field.widget === 'slider' && field.formatValue) {
    return field.formatValue(Number(value))
  }
  return String(value)
}

// ---------------------------------------------------------------------------
// Main BatchCreateView
// ---------------------------------------------------------------------------

export interface BatchCreateViewProps {
  /** Optional pre-selected enrichment type */
  initialType?: CreateableEnrichmentType
  /** Optional className */
  className?: string
}

/**
 * BatchCreateView
 *
 * Multi-step inline wizard for creating enrichments across multiple lessons.
 * Renders inside the inspector panel (not a modal).
 *
 * @example
 * ```tsx
 * <BatchCreateView initialType="quiz" />
 * ```
 */
export function BatchCreateView({ initialType, className }: BatchCreateViewProps) {
  const t = useTranslations('enrichments')
  const { courseInfo } = useStaticGraph()
  const { supabase } = useSupabase()
  const { goBack } = useEnrichmentInspectorStore()

  const store = useBatchEnrichmentStore()

  // Lesson info map for progress display (enrichmentId -> lesson label/title)
  const [lessonInfoMap, setLessonInfoMap] = useState<BatchLessonInfo[]>([])

  // Initialize store with pre-selected type
  useEffect(() => {
    if (initialType && !store.enrichmentType) {
      store.setEnrichmentType(initialType)
      store.setSettings(getDefaultSettings(initialType))
    }
  }, [initialType])

  // Handle type selection (step 1)
  const handleSelectType = useCallback((type: CreateableEnrichmentType) => {
    store.setEnrichmentType(type)
    store.setSettings(getDefaultSettings(type))
  }, [])

  // tRPC createBatch mutation
  const createBatchMutation = trpc.enrichment.createBatch.useMutation()

  /**
   * Submit the batch using lesson UUIDs already stored in the store.
   * Fetches lesson info (labels/titles) for progress display via a simple ID lookup.
   */
  const handleSubmitBatch = useCallback(async () => {
    if (!store.enrichmentType || !courseInfo?.id) return

    store.startBatch()

    try {
      const selectedUUIDs = store.selectedLessonIds

      if (selectedUUIDs.length === 0) {
        store.setError('No valid lessons found')
        return
      }

      // Fetch lesson info for progress display (simple ID→info lookup)
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id, title, section_id, order_index')
        .in('id', selectedUUIDs)

      const { data: sections } = await supabase
        .from('sections')
        .select('id, order_index, title')
        .eq('course_id', courseInfo.id)

      const sectionMap = new Map((sections ?? []).map((s) => [s.id, s]))

      // Build label/title info keyed by lesson UUID
      const lessonInfoByUUID = new Map<string, { label: string; title: string }>()
      for (const lesson of lessons ?? []) {
        const section = sectionMap.get(lesson.section_id)
        const label = section
          ? `${section.order_index}.${lesson.order_index}`
          : `${lesson.order_index}`
        lessonInfoByUUID.set(lesson.id, {
          label,
          title: lesson.title || `Lesson ${lesson.order_index}`,
        })
      }

      // Call the createBatch mutation
      const result = await createBatchMutation.mutateAsync({
        lessonIds: selectedUUIDs,
        enrichmentType: store.enrichmentType,
        settings: Object.keys(store.settings).length > 0 ? store.settings : undefined,
      })

      // Handle success inline (CR-002: no onSuccess callback)
      store.setBatchResult(result.enrichmentIds, result.created)
      toast.success(
        t('batch.inProgress', {
          completed: 0,
          total: result.created,
        })
      )

      // Map enrichment IDs to lesson info for progress display
      const mappedInfos: BatchLessonInfo[] = result.enrichmentIds.map((eid, idx) => {
        const lessonId = selectedUUIDs[idx]
        const info = lessonId ? lessonInfoByUUID.get(lessonId) : undefined
        return {
          enrichmentId: eid,
          lessonLabel: info?.label ?? `Lesson ${idx + 1}`,
          lessonTitle: info?.title ?? '',
        }
      })

      setLessonInfoMap(mappedInfos)
    } catch (err) {
      // Handle error inline (CR-002: no onError callback)
      const message = err instanceof Error ? err.message : 'Batch creation failed'
      store.setError(message)
      toast.error(message)
    }
  }, [store, courseInfo?.id, supabase, createBatchMutation, t])

  // Handle "Done" from progress panel
  const handleDone = useCallback(() => {
    store.reset()
    goBack()
  }, [store, goBack])

  // Handle cancel / go back
  const handleCancel = useCallback(() => {
    store.reset()
    goBack()
  }, [store, goBack])

  // Render current step
  const renderStep = () => {
    // Step 4: Progress tracking
    if (store.step === 4 && store.enrichmentIds.length > 0 && store.enrichmentType) {
      return (
        <BatchProgressPanel
          enrichmentIds={store.enrichmentIds}
          courseId={courseInfo?.id ?? ''}
          enrichmentType={store.enrichmentType as EnrichmentType}
          lessonInfoMap={lessonInfoMap}
          onDone={handleDone}
        />
      )
    }

    // Error state
    if (store.status === 'error') {
      return (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
          <h3 className="mb-2 font-medium text-red-700 dark:text-red-400">
            {store.error || t('errors.generationFailed')}
          </h3>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={handleCancel}>
              {t('batch.cancel')}
            </Button>
            <Button
              onClick={() => {
                store.retryFromConfirm()
              }}
            >
              {t('inspector.retry')}
            </Button>
          </div>
        </div>
      )
    }

    // Step 1: Type & Settings
    if (store.step === 1) {
      return (
        <TypeSelectionStep
          selectedType={store.enrichmentType}
          settings={store.settings}
          onSelectType={handleSelectType}
          onSettingsChange={store.setSettings}
          onNext={store.nextStep}
        />
      )
    }

    // Step 2: Lesson Selection
    if (store.step === 2 && store.enrichmentType) {
      return (
        <LessonSelectionStep
          selectedIds={store.selectedLessonIds}
          onToggle={store.toggleLesson}
          onSelectAll={store.selectAll}
          onDeselectAll={store.clearSelection}
          onNext={store.nextStep}
          onBack={store.prevStep}
          courseId={courseInfo?.id ?? ''}
          enrichmentType={store.enrichmentType}
        />
      )
    }

    // Step 3: Confirmation
    if (store.step === 3 && store.enrichmentType) {
      return (
        <ConfirmationStep
          enrichmentType={store.enrichmentType}
          selectedCount={store.selectedLessonIds.length}
          settings={store.settings}
          isSubmitting={store.status === 'submitting'}
          onConfirm={() => void handleSubmitBatch()}
          onBack={store.prevStep}
        />
      )
    }

    return null
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Step indicator (hidden during progress tracking) */}
      {store.step <= 3 && store.status !== 'error' && (
        <StepIndicator currentStep={store.step} totalSteps={3} />
      )}

      {/* Step content */}
      <div className="flex-1 overflow-hidden">{renderStep()}</div>
    </div>
  )
}

export default BatchCreateView
