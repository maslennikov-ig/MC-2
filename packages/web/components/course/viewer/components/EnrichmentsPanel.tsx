"use client"

import React, { useState } from "react"
import { useTranslations } from "next-intl"
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
} from "lucide-react"
import { AudioPlayer } from "../enrichments/AudioPlayer"
import { QuizPlayer } from "../enrichments/QuizPlayer"
import { EnrichmentErrorBoundary } from "../enrichments/EnrichmentErrorBoundary"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Database } from "@/types/database.generated"
import type {
  QuizEnrichmentContent,
  PresentationEnrichmentContent,
  AudioEnrichmentContent,
} from "@megacampus/shared-types/enrichment-content"

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
  );
}

function isAudioContent(content: unknown): content is AudioEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'audio'
  );
}

function isPresentationContent(content: unknown): content is PresentationEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'presentation' &&
    'slides' in content &&
    Array.isArray((content as Record<string, unknown>).slides)
  );
}

function isVideoContent(content: unknown): content is { type: 'video'; duration_seconds?: number } {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'video'
  );
}

type EnrichmentType = 'video' | 'audio' | 'presentation' | 'quiz' | 'document'

const ENRICHMENT_CONFIG: Record<EnrichmentType, {
  icon: React.ElementType
  color: string
  bgColor: string
  labelKey: string
}> = {
  video: {
    icon: Video,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    labelKey: 'viewer.videoLesson'
  },
  audio: {
    icon: Headphones,
    color: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    labelKey: 'viewer.audioLesson'
  },
  presentation: {
    icon: Presentation,
    color: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    labelKey: 'viewer.presentationLabel'
  },
  quiz: {
    icon: HelpCircle,
    color: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    labelKey: 'viewer.quizLabel'
  },
  document: {
    icon: FileText,
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    labelKey: 'viewer.documentLabel'
  },
}

interface EnrichmentsPanelProps {
  enrichments: EnrichmentRow[]
  /** Error message if enrichments failed to load */
  enrichmentsLoadError?: string
}

export function EnrichmentsPanel({ enrichments, enrichmentsLoadError }: EnrichmentsPanelProps) {
  const t = useTranslations('enrichments')
  const [activeEnrichmentId, setActiveEnrichmentId] = useState<string | null>(null)

  // Show error banner if there was a load error
  if (enrichmentsLoadError) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-800 dark:text-orange-200">
            {t('viewer.loadError')}
          </p>
        </div>
      </div>
    )
  }

  if (!enrichments || enrichments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400">
          {t('viewer.noMaterials')}
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          {t('viewer.noMaterialsDescription')}
        </p>
      </div>
    )
  }

  // Group enrichments by type
  const groupedEnrichments = enrichments.reduce((acc, e) => {
    const type = e.enrichment_type as EnrichmentType
    if (!acc[type]) acc[type] = []
    acc[type].push(e)
    return acc
  }, {} as Record<EnrichmentType, EnrichmentRow[]>)

  return (
    <div className="space-y-6">
      {/* Video Section */}
      {groupedEnrichments.video?.map(enrichment => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.video')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() => setActiveEnrichmentId(
              activeEnrichmentId === enrichment.id ? null : enrichment.id
            )}
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Audio Section */}
      {groupedEnrichments.audio?.map(enrichment => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.audio')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() => setActiveEnrichmentId(
              activeEnrichmentId === enrichment.id ? null : enrichment.id
            )}
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Presentation Section */}
      {groupedEnrichments.presentation?.map(enrichment => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.presentation')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() => setActiveEnrichmentId(
              activeEnrichmentId === enrichment.id ? null : enrichment.id
            )}
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Quiz Section */}
      {groupedEnrichments.quiz?.map(enrichment => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.quiz')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() => setActiveEnrichmentId(
              activeEnrichmentId === enrichment.id ? null : enrichment.id
            )}
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Document Section */}
      {groupedEnrichments.document?.map(enrichment => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.document')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() => setActiveEnrichmentId(
              activeEnrichmentId === enrichment.id ? null : enrichment.id
            )}
            t={t}
          />
        </EnrichmentErrorBoundary>
      ))}
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
    const content = enrichment.content;
    if (!content) return null;

    try {
      switch (type) {
        case 'quiz': {
          if (isQuizContent(content)) {
            return content.questions?.length
              ? t('viewer.questionsCount', { count: content.questions.length })
              : null;
          }
          return null;
        }
        case 'presentation': {
          if (isPresentationContent(content)) {
            return content.slides?.length
              ? t('viewer.slidesCount', { count: content.slides.length })
              : null;
          }
          return null;
        }
        case 'audio': {
          if (isAudioContent(content)) {
            return content.duration_seconds
              ? t('viewer.minutesShort', { count: Math.ceil(content.duration_seconds / 60) })
              : null;
          }
          return null;
        }
        case 'video': {
          if (isVideoContent(content)) {
            return content.duration_seconds
              ? t('viewer.minutesShort', { count: Math.ceil(content.duration_seconds / 60) })
              : null;
          }
          return null;
        }
        default:
          return null;
      }
    } catch (error) {
      console.error('Failed to parse enrichment content preview:', error);
      return null;
    }
  }

  const getDescriptionKey = () => {
    switch (type) {
      case 'quiz': return 'viewer.checkKnowledge';
      case 'audio': return 'viewer.audioVersion';
      case 'video': return 'viewer.videoVersion';
      case 'presentation': return 'viewer.lessonPresentation';
      case 'document': return 'viewer.additionalMaterials';
      default: return 'viewer.additionalMaterials';
    }
  }

  const getLabel = () => {
    switch (type) {
      case 'video': return t('viewer.videoLesson');
      case 'audio': return t('viewer.audioLesson');
      case 'presentation': return t('viewer.presentationLabel');
      case 'quiz': return t('viewer.quizLabel');
      case 'document': return t('viewer.documentLabel');
      default: return t('viewer.additionalMaterials');
    }
  }

  const preview = getContentPreview()

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardHeader className={`${config.bgColor} py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.color}`} />
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
                console.log('Quiz completed:', { score, total, passed });
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t(getDescriptionKey())}
          </p>
          <div className="flex gap-2">
            {/* Audio/Video toggle */}
            {(type === 'audio' || type === 'video') && (
              <Button size="sm" className="gap-2" onClick={onToggle}>
                {isActive ? (
                  <>
                    <X className="w-4 h-4" />
                    {t('viewer.close')}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
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
                    <X className="w-4 h-4" />
                    {t('viewer.close')}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    {t('viewer.startQuiz')}
                  </>
                )}
              </Button>
            )}
            {type === 'presentation' && (
              <Button size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                {t('viewer.open')}
              </Button>
            )}
            {type === 'document' && (
              <Button size="sm" variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                {t('viewer.download')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
