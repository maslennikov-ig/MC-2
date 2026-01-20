'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Video, Headphones, Presentation, HelpCircle, Image } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

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
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className={`${config.bgColor} py-3`}>
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${config.color} animate-pulse`} />
          <CardTitle className="text-base font-medium">
            {getTitle()} - {t('generating')}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 py-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{currentStep}</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress
            value={progress}
            className="w-full"
            aria-label={`${getTitle()} generation progress: ${Math.round(progress)}%`}
          />
        </div>

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
  )
}
