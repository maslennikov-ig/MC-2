'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Video, Headphones, Presentation, HelpCircle, Image } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSmoothProgress } from '@/lib/hooks/useSmoothProgress'
import { useRotatingStatusMessage } from '@/lib/hooks/useRotatingStatusMessage'
import { getNextMilestone } from '@megacampus/shared-types'
import { StagedProgress } from '@/components/ui/staged-progress'
import { cn } from '@/lib/utils'

type EnrichmentType = 'quiz' | 'audio' | 'presentation' | 'video' | 'cover' | 'card'

const ENRICHMENT_CONFIG: Record<
  EnrichmentType,
  {
    icon: React.ElementType
    color: string
    bgColor: string
  }
> = {
  video: {
    icon: Video,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  audio: {
    icon: Headphones,
    color: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  presentation: {
    icon: Presentation,
    color: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  quiz: {
    icon: HelpCircle,
    color: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  cover: {
    icon: Image,
    color: 'text-cyan-500 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
  },
  card: {
    icon: Image,
    color: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
}

const GENERATION_STAGES = [
  { id: 'prepare', label: 'Подготовка' },
  { id: 'generate', label: 'Генерация' },
  { id: 'save', label: 'Сохранение' },
]

interface EnrichmentGeneratingCardProps {
  type: EnrichmentType
  progress: number
  currentStep: string
  onCancel: () => void
}

export function EnrichmentGeneratingCard({
  type,
  progress,
  currentStep,
  onCancel,
}: EnrichmentGeneratingCardProps) {
  const t = useTranslations('enrichments')
  const config = ENRICHMENT_CONFIG[type]
  const Icon = config.icon

  // Map backend step to stage index
  const stageIndex =
    currentStep === 'queued'
      ? 0
      : currentStep === 'generating'
        ? 1
        : currentStep === 'finalizing'
          ? 2
          : 1

  // Smooth interpolation within stage with asymptotic crawl
  const { progress: smoothProgress, isCrawling } = useSmoothProgress({
    targetProgress: progress,
    isComplete: progress >= 100,
    enableAsymptoticCrawl: true,
    nextMilestone: getNextMilestone(progress),
    crawlDelay: 3000,
    crawlIncrement: 0.15,
  })

  // Map type to specific status for rotating messages
  const getRotatingStatus = () => {
    // For generating state, use type-specific messages
    if (currentStep === 'generating') {
      switch (type) {
        case 'cover':
          return 'cover_generating'
        case 'card':
          return 'cover_generating' // Cards use same messages as covers
        case 'quiz':
          return 'quiz_generating'
        case 'audio':
          return 'audio_generating'
        case 'presentation':
          return 'presentation_generating'
        case 'video':
          return 'video_generating'
        default:
          return 'generating'
      }
    }
    // For other states (queued, finalizing, etc.) use as-is
    return currentStep
  }

  // Rotating status messages
  const { message: statusMessage } = useRotatingStatusMessage({
    status: getRotatingStatus(),
    interval: 5000,
  })

  const getTitle = () => {
    switch (type) {
      case 'quiz':
        return t('placeholder.quiz.title')
      case 'audio':
        return t('placeholder.audio.title')
      case 'presentation':
        return t('placeholder.presentation.title')
      case 'video':
        return t('placeholder.video.title')
      case 'cover':
        return t('images.cover.title')
      case 'card':
        return t('images.card.title')
    }
  }

  return (
    <>
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <CardHeader className={`${config.bgColor} py-3`}>
          <div className="flex items-center gap-2">
            <Icon
              className={cn(
                `h-5 w-5 ${config.color}`,
                isCrawling ? 'animate-pulse' : 'animate-pulse'
              )}
            />
            <CardTitle className="text-base font-medium">
              {getTitle()} - {t('generating')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          {/* Progress bar with shimmer effect */}
          <div className="relative">
            <StagedProgress
              stages={GENERATION_STAGES}
              currentStageIndex={stageIndex}
              stageProgress={smoothProgress}
              isComplete={progress >= 100}
            />

            {/* Shimmer overlay when crawling */}
            {isCrawling && (
              <div
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                style={{ width: `${smoothProgress}%` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    animation: 'shimmer 2s infinite',
                  }}
                />
              </div>
            )}
          </div>

          {/* Rotating status message */}
          <p className="text-muted-foreground text-sm transition-opacity duration-300">
            {statusMessage}
          </p>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              aria-label={`Cancel ${type} generation`}
            >
              {t('cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
