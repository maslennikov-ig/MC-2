'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Play, Download, ExternalLink, X } from 'lucide-react'
import { AudioPlayer } from '../enrichments/AudioPlayer'
import { QuizPlayer } from '../enrichments/QuizPlayer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/types/database.generated'
import { ENRICHMENT_CONFIG, type EnrichmentType } from './enrichment-config'
import {
  isQuizContent,
  isAudioContent,
  isPresentationContent,
  isVideoContent,
} from './enrichment-type-guards'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface EnrichmentCardProps {
  enrichment: EnrichmentRow
  isActive: boolean
  onToggle: () => void
}

export function EnrichmentCard({ enrichment, isActive, onToggle }: EnrichmentCardProps) {
  const t = useTranslations('enrichments')
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
    } catch {
      // Error handling removed for production cleanup
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

  const preview = getContentPreview()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic key
  const label = t(config.labelKey as any)

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className={`${config.bgColor} py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <CardTitle className="text-base font-medium">{enrichment.title || label}</CardTitle>
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
              onComplete={() => {}}
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
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic key */}
            {t(getDescriptionKey() as any)}
          </p>
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
