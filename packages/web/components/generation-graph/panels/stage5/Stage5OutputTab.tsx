'use client'

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Clock,
  Tag,
  GitBranch,
  ShieldCheck,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { StructureTree } from './components/StructureTree'
import { AutoCardPreview } from '../shared/AutoCardPreview'
import { EditableField } from '../output/EditableField'
import { SaveStatusIndicator } from '../output/SaveStatusIndicator'
import { CascadeStageDeleteModal } from '../output/CascadeStageDeleteModal'
import { useAutoSave } from '../../hooks/useAutoSave'
import { useFieldStatusTracking } from '../../hooks/useFieldStatusTracking'
import { useCascadeStageDelete } from '../../hooks/useCascadeStageDelete'
import { updateFieldAction } from '@/app/actions/admin-generation'
import type {
  Stage5OutputTabProps,
  CourseStructure,
  StructuralQualityResult,
  StructuralQualityIssue,
} from './types'
import { createClient } from '@/lib/supabase/client'

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

function getStructuralQuality(data: unknown): StructuralQualityResult | null {
  if (!data || typeof data !== 'object') return null
  const metadata = data as {
    quality_scores?: {
      structure?: Partial<StructuralQualityResult>
    }
  }
  const structure = metadata.quality_scores?.structure
  if (!structure || typeof structure !== 'object') return null
  if (typeof structure.passed !== 'boolean') return null

  return {
    passed: structure.passed,
    hasCriticalIssues: structure.hasCriticalIssues === true,
    profileId: typeof structure.profileId === 'string' ? structure.profileId : 'unknown',
    totalLessons: typeof structure.totalLessons === 'number' ? structure.totalLessons : 0,
    computedDurationHours:
      typeof structure.computedDurationHours === 'number' ? structure.computedDurationHours : 0,
    criticalIssues: Array.isArray(structure.criticalIssues) ? structure.criticalIssues : [],
    warnings: Array.isArray(structure.warnings) ? structure.warnings : [],
  }
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
  const t = useTranslations('generation.stage5')
  const tCourse = useTranslations('generation.courseStructure')
  const te = editableTranslations[locale]

  // Expanded sections state for StructureTree
  const [expandedSections, setExpandedSections] = useState<string[]>([])

  // Pull-fallback: fetch course_structure directly if not available via props
  // Retries every 3s until data is found (handles case when tab is opened before Stage 5 completes)
  const [directFetchResult, setDirectFetchResult] = useState<unknown>(null)
  const [directGenerationMetadata, setDirectGenerationMetadata] = useState<unknown>(undefined)
  const hasFetchedStructure = useRef(false)

  useEffect(() => {
    if (!courseId) return
    const needsStructure = !outputData && !hasFetchedStructure.current
    const needsMetadata = directGenerationMetadata === undefined
    if (!needsStructure && !needsMetadata) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const fetchData = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('courses')
          .select('course_structure, generation_metadata')
          .eq('id', courseId)
          .single()

        if (cancelled) return

        if (data?.course_structure) {
          hasFetchedStructure.current = true
          setDirectFetchResult(data.course_structure)
        }

        setDirectGenerationMetadata(data?.generation_metadata ?? null)

        if (data?.course_structure && data?.generation_metadata) {
          return
        }

        // Data not yet available — retry after 3s
        retryTimer = setTimeout(() => {
          if (!cancelled) void fetchData()
        }, 3000)
      } catch {
        // Best-effort fallback — retry after 5s
        retryTimer = setTimeout(() => {
          if (!cancelled) void fetchData()
        }, 5000)
      }
    }

    void fetchData()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [outputData, courseId, directGenerationMetadata])

  // Parse output data - real data IS the CourseStructure directly
  const parsedData = useMemo((): CourseStructure | null => {
    if (isCourseStructure(outputData)) return outputData
    if (isCourseStructure(directFetchResult)) return directFetchResult
    return null
  }, [outputData, directFetchResult])

  const structureQuality = useMemo(
    () => getStructuralQuality(directGenerationMetadata),
    [directGenerationMetadata]
  )

  const formatQualityIssue = useCallback(
    (issue: StructuralQualityIssue) => {
      switch (issue.code) {
        case 'hard_max_lessons_exceeded':
          return t('structureQualityIssueHardMax')
        case 'soft_max_lessons_exceeded':
          return t('structureQualityIssueSoftMax')
        case 'duration_mismatch':
          return t('structureQualityIssueDuration')
        case 'duplicate_lesson_titles':
          return t('structureQualityIssueDuplicates')
        case 'lesson_objective_overload':
          return t('structureQualityIssueObjectives')
        case 'invalid_section_lesson_budget':
          return t('structureQualityIssueEmptySection')
        case 'senior_role_beginner_level':
          return t('structureQualityIssueSeniorBeginner')
        default:
          return issue.message
      }
    },
    [t]
  )

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

  // Per-field save status tracking (fixes race condition with rapid edits)
  const { performSave, getFieldStatus } = useFieldStatusTracking(save, status)

  // Cascade delete modal state and handlers
  const {
    cascadeModalOpen,
    downstreamInfo,
    isDeleting,
    fieldResetKey,
    handleFieldSave,
    handleCascadeConfirm,
    handleCascadeCancel,
  } = useCascadeStageDelete(courseId, 5, performSave, locale)

  const canEdit = editable && courseId

  // Empty state - no data yet
  if (!parsedData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitBranch className="text-muted-foreground/50 mb-4 h-12 w-12" />
        <p className="text-muted-foreground text-sm">{t('emptyOutput')}</p>
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
  const difficultyLabel = t(difficultyLower)

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
          isDeleting={isDeleting}
        />
      )}

      {/* Show save status indicator at the top when editing */}
      {canEdit && status !== 'idle' && (
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <SaveStatusIndicator status={status} error={error} />
        </div>
      )}

      {structureQuality && (
        <Card
          className={cn(
            'border-l-4',
            structureQuality.hasCriticalIssues
              ? 'border-l-red-500 bg-red-50/70 dark:bg-red-950/20'
              : structureQuality.warnings.length > 0
                ? 'border-l-amber-500 bg-amber-50/70 dark:bg-amber-950/20'
                : 'border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/20'
          )}
        >
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              {structureQuality.hasCriticalIssues ? (
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              ) : structureQuality.warnings.length > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold">
                  {structureQuality.hasCriticalIssues
                    ? t('structureQualityCriticalTitle')
                    : structureQuality.warnings.length > 0
                      ? t('structureQualityWarningTitle')
                      : t('structureQualityPassedTitle')}
                </h4>
                <p className="text-muted-foreground text-sm">
                  {structureQuality.hasCriticalIssues
                    ? t('structureQualityCriticalDescription')
                    : structureQuality.warnings.length > 0
                      ? t('structureQualityWarningDescription')
                      : t('structureQualityPassedDescription')}
                </p>
              </div>
              <Badge
                className={cn(
                  'text-xs font-medium',
                  structureQuality.hasCriticalIssues
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    : structureQuality.warnings.length > 0
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                )}
              >
                {structureQuality.hasCriticalIssues
                  ? t('structureQualityNeedsFix')
                  : structureQuality.warnings.length > 0
                    ? t('structureQualityWarning')
                    : t('structureQualityCanContinue')}
              </Badge>
            </div>

            {(structureQuality.criticalIssues.length > 0 ||
              structureQuality.warnings.length > 0) && (
              <ul className="space-y-1.5">
                {(structureQuality.hasCriticalIssues
                  ? structureQuality.criticalIssues
                  : structureQuality.warnings
                )
                  .slice(0, 4)
                  .map((issue, index) => (
                    <li key={`${issue.code}-${index}`} className="text-muted-foreground text-sm">
                      {formatQualityIssue(issue)}
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
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
                {t('learningOutcomes')}
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
              {t('prerequisites')}
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
              <p className="text-muted-foreground text-sm italic">{tCourse('noPrerequisites')}</p>
            )}
          </div>

          {/* Stats Row: Difficulty, Duration, Tags */}
          <div className="border-border flex flex-wrap items-center gap-4 border-t pt-2">
            {/* Difficulty */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">{t('difficulty')}:</span>
              <Badge className={cn('text-xs font-medium', difficultyColor)}>
                {difficultyLabel}
              </Badge>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-2">
              <Clock className="text-muted-foreground h-3.5 w-3.5" />
              <span className="text-sm font-medium">
                {estimated_duration_hours}
                {t('hoursShort')}
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
            {t('structurePreview')}
          </CardTitle>
          <p className="text-muted-foreground text-sm">{t('structureDesc')}</p>
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
