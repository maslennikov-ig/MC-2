'use client'

import React, { memo, useMemo, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { CheckCircle2, BookOpen, Clock, Tag, GitBranch } from 'lucide-react'
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations'
import { StructureTree } from './components/StructureTree'
import { AutoCardPreview } from '../shared/AutoCardPreview'
import { EditableField } from '../output/EditableField'
import { SaveStatusIndicator } from '../output/SaveStatusIndicator'
import { CascadeStageDeleteModal, DownstreamStagesInfo } from '../output/CascadeStageDeleteModal'
import { useAutoSave, SaveStatus } from '../../hooks/useAutoSave'
import {
  updateFieldAction,
  checkDownstreamStagesAction,
  deleteDownstreamStagesAction,
} from '@/app/actions/admin-generation'
import { toast } from 'sonner'
import type { Stage5OutputTabProps, CourseStructure } from './types'

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to validate CourseStructure from real database data
 * Real data uses snake_case fields directly (not wrapped in courseStructure)
 */
function isCourseStructure(data: unknown): data is CourseStructure {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return typeof d.course_title === 'string' && Array.isArray(d.sections)
}

// ============================================================================
// DIFFICULTY BADGE MAPPING
// ============================================================================

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  advanced: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

// ============================================================================
// TRANSLATIONS FOR EDITABLE FIELDS
// ============================================================================

const editableTranslations = {
  ru: {
    courseTitle: 'Название курса',
    courseDescription: 'Описание курса',
    courseOverview: 'Обзор курса',
    targetAudience: 'Целевая аудитория',
    cascadeDescription: 'Редактирование Stage 5 требует удаления существующих данных Stage 6:',
  },
  en: {
    courseTitle: 'Course Title',
    courseDescription: 'Course Description',
    courseOverview: 'Course Overview',
    targetAudience: 'Target Audience',
    cascadeDescription: 'Editing Stage 5 requires deleting existing Stage 6 data:',
  },
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Stage5OutputTab Component
 *
 * "Structure Preview" - displays the generated course structure as a tree view.
 *
 * Layout (two sections):
 * 1. Top - Metadata Card: Course title, description, learning outcomes, prerequisites, difficulty, duration, tags
 * 2. Bottom - Structure Tree: StructureTree component with sections and lessons
 *
 * Color scheme: Orange theme for Stage 5 (energy, creativity, transformation)
 *
 * Features:
 * - Course metadata with visual hierarchy
 * - Learning outcomes with green checkmarks
 * - Prerequisites display with fallback message
 * - Stats row: difficulty badge, duration badge, tags
 * - Collapsible structure tree for sections and lessons
 * - Full dark mode support
 * - Bilingual (Russian/English)
 * - Inline editing for metadata fields (when editable=true)
 * - Cascade deletion warning when Stage 6 exists
 */
export const Stage5OutputTab = memo<Stage5OutputTabProps>(function Stage5OutputTab({
  outputData,
  courseId,
  editable = false,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage5
  const te = editableTranslations[locale]

  // Expanded sections state for StructureTree
  const [expandedSections, setExpandedSections] = useState<string[]>([])

  // Parse output data - real data IS the CourseStructure directly
  const parsedData = useMemo((): CourseStructure | null => {
    if (isCourseStructure(outputData)) {
      return outputData
    }
    return null
  }, [outputData])

  // Handle section toggle - wrapped in useCallback for optimization
  const handleToggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    )
  }, [])

  // ============================================================================
  // AUTO-SAVE HOOK (only when editable)
  // ============================================================================

  const { status, error, save, flush } = useAutoSave(
    async (input: { courseId: string; stageId: 'stage_5'; fieldPath: string; value: unknown }) => {
      return await updateFieldAction(input.courseId, input.stageId, input.fieldPath, input.value)
    },
    { courseId: courseId || '', stageId: 'stage_5' as const },
    { debounceMs: 1000 }
  )

  // Per-field save status tracking
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

        // If no Stage 6 exists, just save (Stage 5 edits only affect Stage 6)
        if (!info.hasStage6) {
          performSave(fieldPath, value)
          return
        }

        // Stage 6 exists - show modal
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

  // Async handler for cascade delete confirmation
  const handleCascadeConfirmAsync = useCallback(async () => {
    if (!courseId || !pendingChange) return

    setIsDeleting(true)
    try {
      // Delete downstream stages (Stage 6 only for Stage 5 edits)
      const result = await deleteDownstreamStagesAction(courseId, 5)

      toast.success(
        locale === 'ru'
          ? `Удалено: ${result.deletedLessonsCount} уроков`
          : `Deleted: ${result.deletedLessonsCount} lessons`
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

  // Sync wrapper for modal onConfirm (avoids @typescript-eslint/no-misused-promises)
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

  // Get status for a specific field
  const getFieldStatus = useCallback(
    (fieldPath: string): SaveStatus => {
      return fieldStatuses.get(fieldPath) ?? 'idle'
    },
    [fieldStatuses]
  )

  // Update per-field status when save completes or errors
  React.useEffect(() => {
    if ((status === 'saved' || status === 'error') && lastSavedFieldRef.current) {
      const fieldPath = lastSavedFieldRef.current

      setFieldStatuses((prev) => {
        const next = new Map(prev)
        next.set(fieldPath, status)
        return next
      })

      // Clear after 2 seconds
      const timer = setTimeout(() => {
        setFieldStatuses((prev) => {
          const next = new Map(prev)
          next.delete(fieldPath)
          return next
        })
      }, 2000)

      return () => clearTimeout(timer)
    }
    return undefined
  }, [status])

  const canEdit = editable && courseId

  // Empty state - no data yet
  if (!parsedData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitBranch className="text-muted-foreground/50 mb-4 h-12 w-12" />
        <p className="text-muted-foreground text-sm">
          {t?.emptyOutput?.[locale] ?? 'Course structure will appear here'}
        </p>
      </div>
    )
  }

  // Extract fields using snake_case (real data format)
  const {
    course_title,
    course_description,
    course_overview,
    target_audience,
    learning_outcomes,
    prerequisites,
    difficulty_level,
    estimated_duration_hours,
    course_tags,
    sections,
  } = parsedData

  // Get difficulty badge color
  const difficultyColor =
    DIFFICULTY_COLORS[difficulty_level?.toLowerCase() ?? 'intermediate'] ||
    DIFFICULTY_COLORS.intermediate

  // Translate difficulty level (stage5 section uses simple keys: beginner, intermediate, advanced)
  const difficultyLower = (difficulty_level?.toLowerCase() ?? 'intermediate') as
    | 'beginner'
    | 'intermediate'
    | 'advanced'
  const difficultyLabel = t?.[difficultyLower]?.[locale] ?? difficulty_level

  return (
    <div className="space-y-4 p-1">
      {/* Cascade Delete Modal */}
      {downstreamInfo && (
        <CascadeStageDeleteModal
          isOpen={cascadeModalOpen}
          onClose={handleCascadeCancel}
          onConfirm={handleCascadeConfirm}
          downstreamInfo={{
            ...downstreamInfo,
            hasStage5: false, // Stage 5 edits don't delete Stage 5
          }}
          sourceStage={5}
          locale={locale}
          isDeleting={isDeleting}
        />
      )}

      {/* Show save status indicator at the top when editing */}
      {canEdit && status !== 'idle' && (
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <SaveStatusIndicator status={status} error={error} />
        </div>
      )}

      {/* Metadata Card */}
      <Card
        key={fieldResetKey}
        className={cn(
          'border-l-4 border-l-orange-500',
          'bg-gradient-to-r from-orange-50/50 to-amber-50/50',
          'dark:from-orange-900/10 dark:to-amber-900/10'
        )}
      >
        <CardHeader className="pb-3">
          {canEdit ? (
            <EditableField
              config={{
                path: 'course_title',
                label: te.courseTitle,
                type: 'text',
              }}
              value={course_title}
              onChange={(v) => handleFieldSave('course_title', v)}
              onBlur={flush}
              status={getFieldStatus('course_title')}
              stageId="stage_5"
              courseId={courseId}
              locale={locale}
            />
          ) : (
            <CardTitle className="text-foreground text-lg font-semibold">{course_title}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Course Description */}
          {canEdit ? (
            <EditableField
              config={{
                path: 'course_description',
                label: te.courseDescription,
                type: 'textarea',
              }}
              value={course_description ?? ''}
              onChange={(v) => handleFieldSave('course_description', v)}
              onBlur={flush}
              status={getFieldStatus('course_description')}
              stageId="stage_5"
              courseId={courseId}
              locale={locale}
            />
          ) : (
            course_description && (
              <p className="text-muted-foreground text-sm leading-relaxed">{course_description}</p>
            )
          )}

          {/* Course Overview (if exists) */}
          {(canEdit || course_overview) &&
            (canEdit ? (
              <EditableField
                config={{
                  path: 'course_overview',
                  label: te.courseOverview,
                  type: 'textarea',
                }}
                value={course_overview ?? ''}
                onChange={(v) => handleFieldSave('course_overview', v)}
                onBlur={flush}
                status={getFieldStatus('course_overview')}
                stageId="stage_5"
                courseId={courseId}
                locale={locale}
              />
            ) : course_overview ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold">{te.courseOverview}</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">{course_overview}</p>
              </div>
            ) : null)}

          {/* Target Audience (if exists) */}
          {(canEdit || target_audience) &&
            (canEdit ? (
              <EditableField
                config={{
                  path: 'target_audience',
                  label: te.targetAudience,
                  type: 'text',
                }}
                value={target_audience ?? ''}
                onChange={(v) => handleFieldSave('target_audience', v)}
                onBlur={flush}
                status={getFieldStatus('target_audience')}
                stageId="stage_5"
                courseId={courseId}
                locale={locale}
              />
            ) : target_audience ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold">{te.targetAudience}</h4>
                <p className="text-muted-foreground text-sm">{target_audience}</p>
              </div>
            ) : null)}

          {/* Learning Outcomes - real data has objects with 'text' field */}
          {learning_outcomes && learning_outcomes.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t?.learningOutcomes?.[locale] ?? 'Learning Outcomes'}
              </h4>
              <ul className="space-y-1.5">
                {learning_outcomes.map((outcome, idx) => (
                  <li key={idx} className="text-muted-foreground flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                    <span>{typeof outcome === 'string' ? outcome : outcome.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prerequisites */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="text-muted-foreground h-4 w-4" />
              {t?.prerequisites?.[locale] ?? 'Prerequisites'}
            </h4>
            {prerequisites && prerequisites.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {prerequisites.map((prereq, idx) => (
                  <Badge key={idx} variant="secondary" className="px-2 py-0.5 text-xs">
                    {prereq}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                {t?.noPrerequisites?.[locale] ?? 'No prerequisites'}
              </p>
            )}
          </div>

          {/* Stats Row: Difficulty, Duration, Tags */}
          <div className="border-border flex flex-wrap items-center gap-4 border-t pt-2">
            {/* Difficulty */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {t?.difficulty?.[locale] ?? 'Difficulty'}:
              </span>
              <Badge className={cn('text-xs font-medium', difficultyColor)}>
                {difficultyLabel}
              </Badge>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-2">
              <Clock className="text-muted-foreground h-3.5 w-3.5" />
              <span className="text-sm font-medium">
                {estimated_duration_hours}
                {t?.hoursShort?.[locale] ?? 'h'}
              </span>
            </div>

            {/* Tags */}
            {course_tags && course_tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="text-muted-foreground h-3.5 w-3.5" />
                <div className="flex flex-wrap gap-1.5">
                  {course_tags.slice(0, 3).map((tag, idx) => (
                    <Badge key={idx} variant="secondary" className="px-2 py-0 text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {course_tags.length > 3 && (
                    <span className="text-muted-foreground text-xs">+{course_tags.length - 3}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Structure Tree Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <GitBranch className="h-4 w-4 text-orange-500" />
            {t?.structure?.[locale] ?? 'Course Structure'}
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {t?.structureDesc?.[locale] ?? 'Modules and lessons'}
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <StructureTree
              sections={sections}
              expandedSections={expandedSections}
              onToggleSection={handleToggleSection}
              locale={locale}
            />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Course Card Preview */}
      <AutoCardPreview cardType="course" courseId={courseId} />
    </div>
  )
})

export default Stage5OutputTab
