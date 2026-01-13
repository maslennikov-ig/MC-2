'use client'

import React, { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Video,
  Headphones,
  Presentation,
  HelpCircle,
  FileText,
  Play,
  Download,
  ExternalLink,
  X,
  AlertTriangle,
} from 'lucide-react'
import { AudioPlayer } from '../enrichments/AudioPlayer'
import { QuizPlayer } from '../enrichments/QuizPlayer'
import { EnrichmentErrorBoundary } from '../enrichments/EnrichmentErrorBoundary'
import { EnrichmentPlaceholderCard } from './EnrichmentPlaceholderCard'
import { EnrichmentGeneratingCard } from './EnrichmentGeneratingCard'
import { useEnrichmentGeneration } from '@/lib/hooks/useEnrichmentGeneration'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/types/database.generated'
import type {
  QuizEnrichmentContent,
  PresentationEnrichmentContent,
  AudioEnrichmentContent,
} from '@megacampus/shared-types/enrichment-content'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

// Type guards for safe content parsing
function isQuizContent(content: unknown): content is QuizEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'quiz' &&
    'questions' in content &&
    Array.isArray((content as Record<string, unknown>).questions)
  )
}

function isAudioContent(content: unknown): content is AudioEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'audio'
  )
}

function isPresentationContent(content: unknown): content is PresentationEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'presentation' &&
    'slides' in content &&
    Array.isArray((content as Record<string, unknown>).slides)
  )
}

function isVideoContent(content: unknown): content is { type: 'video'; duration_seconds?: number } {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'video'
  )
}

type EnrichmentType = 'video' | 'audio' | 'presentation' | 'quiz' | 'document'

const PLACEHOLDER_TYPES: ('quiz' | 'audio' | 'presentation' | 'video')[] = [
  'quiz',
  'audio',
  'presentation',
  'video',
]

const ENRICHMENT_CONFIG: Record<
  EnrichmentType,
  {
    icon: React.ElementType
    color: string
    bgColor: string
    labelKey: string
  }
> = {
  video: {
    icon: Video,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    labelKey: 'viewer.videoLesson',
  },
  audio: {
    icon: Headphones,
    color: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    labelKey: 'viewer.audioLesson',
  },
  presentation: {
    icon: Presentation,
    color: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    labelKey: 'viewer.presentationLabel',
  },
  quiz: {
    icon: HelpCircle,
    color: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    labelKey: 'viewer.quizLabel',
  },
  document: {
    icon: FileText,
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    labelKey: 'viewer.documentLabel',
  },
}

interface EnrichmentsPanelProps {
  enrichments: EnrichmentRow[]
  /** Error message if enrichments failed to load */
  enrichmentsLoadError?: string
  /** Lesson UUID for generating new enrichments */
  lessonId?: string
  /** Course UUID for generating new enrichments */
  courseId?: string
  /** Callback when enrichments should be refreshed (after generation completes) */
  onRefreshEnrichments?: () => void
}

export function EnrichmentsPanel({
  enrichments,
  enrichmentsLoadError,
  lessonId,
  courseId,
  onRefreshEnrichments,
}: EnrichmentsPanelProps) {
  const t = useTranslations('enrichments')
  const [activeEnrichmentId, setActiveEnrichmentId] = useState<string | null>(null)

  // Handle generation completion
  const handleGenerationComplete = useCallback(
    (_enrichmentId: string) => {
      toast.success(t('viewer.generationComplete'))
      onRefreshEnrichments?.()
    },
    [t, onRefreshEnrichments]
  )

  // Handle generation error
  const handleGenerationError = useCallback(
    (error: string) => {
      toast.error(`${t('viewer.generationFailed')}: ${error}`)
    },
    [t]
  )

  // Use enrichment generation hook (only if lessonId and courseId are available)
  const { startGeneration, cancelGeneration, isGenerating, getProgress } = useEnrichmentGeneration({
    lessonId: lessonId || '',
    courseId: courseId || '',
    onComplete: handleGenerationComplete,
    onError: handleGenerationError,
  })

  // Filter out cover type - it's displayed as hero banner in lesson content
  const filteredEnrichments = enrichments.filter((e) => (e.enrichment_type as string) !== 'cover')

  // Show error banner if there was a load error
  if (enrichmentsLoadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800/30 dark:bg-orange-900/20">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-orange-500" />
          <p className="text-sm text-orange-800 dark:text-orange-200">{t('viewer.loadError')}</p>
        </div>
      </div>
    )
  }

  if (!filteredEnrichments || filteredEnrichments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
        <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400">
          {t('viewer.noMaterials')}
        </h3>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
          {t('viewer.noMaterialsDescription')}
        </p>
      </div>
    )
  }

  // Group enrichments by type
  const groupedEnrichments = filteredEnrichments.reduce(
    (acc, e) => {
      const type = e.enrichment_type as EnrichmentType
      if (!acc[type]) acc[type] = []
      acc[type].push(e)
      return acc
    },
    {} as Record<EnrichmentType, EnrichmentRow[]>
  )

  return (
    <div className="space-y-6">
      {/* Video Section */}
      {groupedEnrichments.video?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.video')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Audio Section */}
      {groupedEnrichments.audio?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.audio')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Presentation Section */}
      {groupedEnrichments.presentation?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.presentation')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Quiz Section */}
      {groupedEnrichments.quiz?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.quiz')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Document Section */}
      {groupedEnrichments.document?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.document')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Placeholder Cards for Missing Types and Generating Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {PLACEHOLDER_TYPES.filter((type) => !groupedEnrichments[type]).map((type) => {
          // Check if this type is currently generating
          const generatingProgress = getProgress(type)
          const typeIsGenerating = isGenerating(type)

          // Inline estimated time to avoid type inference issues
          const estimatedTime =
            type === 'quiz'
              ? t('placeholder.quiz.estimatedTime' as any)
              : type === 'audio'
                ? t('placeholder.audio.estimatedTime' as any)
                : type === 'presentation'
                  ? t('placeholder.presentation.estimatedTime' as any)
                  : t('placeholder.video.estimatedTime' as any)

          // Show generating card if generation is in progress
          if (typeIsGenerating && generatingProgress) {
            return (
              <EnrichmentGeneratingCard
                key={type}
                type={type}
                progress={generatingProgress.progress}
                currentStep={generatingProgress.currentStep || t('generating')}
                onCancel={() => void cancelGeneration(type)}
              />
            )
          }

          // Show placeholder card otherwise
          return (
            <EnrichmentPlaceholderCard
              key={type}
              type={type}
              onGenerate={(settings) => {
                // Only allow generation if lessonId is available
                if (!lessonId) {
                  toast.error(t('viewer.noMaterials'))
                  return
                }
                // Only generate on-demand types (quiz, audio, presentation)
                if (type === 'video') {
                  return
                }
                void startGeneration(type, settings)
              }}
              estimatedTime={estimatedTime}
              disabled={type === 'video' || !lessonId}
              isGenerating={typeIsGenerating}
            />
          )
        })}
      </div>
    </div>
  )
}

interface EnrichmentCardProps {
  enrichment: EnrichmentRow
  isActive: boolean
  onToggle: () => void
  t: ReturnType<typeof useTranslations<'enrichments'>>
}

function EnrichmentCard({ enrichment, isActive, onToggle, t }: EnrichmentCardProps) {
  const type = enrichment.enrichment_type as EnrichmentType
  const config = ENRICHMENT_CONFIG[type]
  const Icon = config.icon

  const getContentPreview = () => {
    const content = enrichment.content
    if (!content) return null

    try {
      switch (type) {
        case 'quiz': {
          if (isQuizContent(content)) {
            return content.questions?.length
              ? t('viewer.questionsCount', { count: content.questions.length })
              : null
          }
          return null
        }
        case 'presentation': {
          if (isPresentationContent(content)) {
            return content.slides?.length
              ? t('viewer.slidesCount', { count: content.slides.length })
              : null
          }
          return null
        }
        case 'audio': {
          if (isAudioContent(content)) {
            return content.duration_seconds
              ? t('viewer.minutesShort', { count: Math.ceil(content.duration_seconds / 60) })
              : null
          }
          return null
        }
        case 'video': {
          if (isVideoContent(content)) {
            return content.duration_seconds
              ? t('viewer.minutesShort', { count: Math.ceil(content.duration_seconds / 60) })
              : null
          }
          return null
        }
        default:
          return null
      }
    } catch (error) {
      console.error('Failed to parse enrichment content preview:', error)
      return null
    }
  }

  const getDescriptionKey = () => {
    switch (type) {
      case 'quiz':
        return 'viewer.checkKnowledge'
      case 'audio':
        return 'viewer.audioVersion'
      case 'video':
        return 'viewer.videoVersion'
      case 'presentation':
        return 'viewer.lessonPresentation'
      case 'document':
        return 'viewer.additionalMaterials'
      default:
        return 'viewer.additionalMaterials'
    }
  }

  const getLabel = () => {
    switch (type) {
      case 'video':
        return t('viewer.videoLesson')
      case 'audio':
        return t('viewer.audioLesson')
      case 'presentation':
        return t('viewer.presentationLabel')
      case 'quiz':
        return t('viewer.quizLabel')
      case 'document':
        return t('viewer.documentLabel')
      default:
        return t('viewer.additionalMaterials')
    }
  }

  const preview = getContentPreview()

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className={`${config.bgColor} py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <CardTitle className="text-base font-medium">
              {enrichment.title || getLabel()}
            </CardTitle>
          </div>
          {preview && (
            <Badge variant="secondary" className="text-xs">
              {preview}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-4">
        {/* Show QuizPlayer when active */}
        {isActive && type === 'quiz' && isQuizContent(enrichment.content) && (
          <div className="mb-4">
            <QuizPlayer
              content={enrichment.content}
              enrichmentId={enrichment.id}
              onComplete={(score, total, passed) => {
                console.log('Quiz completed:', { score, total, passed })
              }}
            />
          </div>
        )}

        {/* Show AudioPlayer when active */}
        {isActive && type === 'audio' && (
          <div className="mb-4">
            <AudioPlayer
              enrichment={enrichment}
              playbackUrl={undefined /* TODO: will be implemented with storage helper */}
            />
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t(getDescriptionKey())}</p>
          <div className="flex gap-2">
            {/* Audio/Video toggle */}
            {(type === 'audio' || type === 'video') && (
              <Button size="sm" className="gap-2" onClick={onToggle}>
                {isActive ? (
                  <>
                    <X className="h-4 w-4" />
                    {t('viewer.close')}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {t('viewer.play')}
                  </>
                )}
              </Button>
            )}
            {/* Quiz toggle */}
            {type === 'quiz' && (
              <Button size="sm" className="gap-2" onClick={onToggle}>
                {isActive ? (
                  <>
                    <X className="h-4 w-4" />
                    {t('viewer.close')}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {t('viewer.startQuiz')}
                  </>
                )}
              </Button>
            )}
            {type === 'presentation' && (
              <Button size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                {t('viewer.open')}
              </Button>
            )}
            {type === 'document' && (
              <Button size="sm" variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                {t('viewer.download')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
