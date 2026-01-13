'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Video, Headphones, Presentation, HelpCircle, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type EnrichmentType = 'quiz' | 'audio' | 'presentation' | 'video'

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
}

interface EnrichmentPlaceholderCardProps {
  type: EnrichmentType
  onGenerate: (settings: Record<string, unknown>) => void
  estimatedTime: string
  disabled?: boolean
  isGenerating?: boolean
}

export function EnrichmentPlaceholderCard({
  type,
  onGenerate,
  estimatedTime,
  disabled = false,
  isGenerating = false,
}: EnrichmentPlaceholderCardProps) {
  const t = useTranslations('enrichments')
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)

  // Options state for generation settings
  const [quizQuestions, setQuizQuestions] = useState('10')
  const [quizDifficulty, setQuizDifficulty] = useState('medium')
  const [audioVoice, setAudioVoice] = useState('default')
  const [audioSpeed, setAudioSpeed] = useState('normal')
  const [presentationSlides, setPresentationSlides] = useState('8')
  const [presentationTheme, setPresentationTheme] = useState('light')

  /**
   * Collect current settings based on enrichment type
   */
  const getSettings = (): Record<string, unknown> => {
    switch (type) {
      case 'quiz':
        return {
          questionCount: parseInt(quizQuestions, 10),
          difficulty: quizDifficulty,
        }
      case 'audio':
        return {
          voice: audioVoice,
          speed: audioSpeed,
        }
      case 'presentation':
        return {
          slideCount: parseInt(presentationSlides, 10),
          theme: presentationTheme,
        }
      default:
        return {}
    }
  }

  const handleGenerate = () => {
    onGenerate(getSettings())
  }

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
    }
  }

  const getDescription = () => {
    switch (type) {
      case 'quiz':
        return t('placeholder.quiz.description')
      case 'audio':
        return t('placeholder.audio.description')
      case 'presentation':
        return t('placeholder.presentation.description')
      case 'video':
        return t('placeholder.video.description')
    }
  }

  const renderOptions = () => {
    switch (type) {
      case 'quiz':
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('forms.quiz.questionCount')}</label>
              <Select value={quizQuestions} onValueChange={setQuizQuestions}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('forms.quiz.difficulty')}</label>
              <Select value={quizDifficulty} onValueChange={setQuizDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">{t('forms.quiz.difficultyEasy')}</SelectItem>
                  <SelectItem value="medium">{t('forms.quiz.difficultyMedium')}</SelectItem>
                  <SelectItem value="hard">{t('forms.quiz.difficultyHard')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'audio':
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('forms.audio.voice')}</label>
              <Select value={audioVoice} onValueChange={setAudioVoice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('forms.audio.speed')}</label>
              <Select value={audioSpeed} onValueChange={setAudioSpeed}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">{t('forms.audio.speedSlow')}</SelectItem>
                  <SelectItem value="normal">{t('forms.audio.speedNormal')}</SelectItem>
                  <SelectItem value="fast">{t('forms.audio.speedFast')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'presentation':
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('forms.presentation.slideCount')}</label>
              <Select value={presentationSlides} onValueChange={setPresentationSlides}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="8">8</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('forms.presentation.theme')}</label>
              <Select value={presentationTheme} onValueChange={setPresentationTheme}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t('forms.presentation.themeLight')}</SelectItem>
                  <SelectItem value="dark">{t('forms.presentation.themeDark')}</SelectItem>
                  <SelectItem value="colorful">{t('forms.presentation.themeColorful')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'video':
        return null
    }
  }

  return (
    <Card className="overflow-hidden border-2 border-dashed bg-gray-50 transition-shadow hover:shadow-md dark:bg-gray-900/20">
      <CardHeader className={`${config.bgColor} py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <CardTitle className="text-base font-medium">{getTitle()}</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {estimatedTime}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 py-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{getDescription()}</p>

        {type !== 'video' && (
          <Collapsible open={isOptionsOpen} onOpenChange={setIsOptionsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between px-2">
                <span className="text-sm font-medium">{t('options')}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOptionsOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">{renderOptions()}</CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex justify-end pt-2">
          {disabled ? (
            <Badge variant="secondary">{t('placeholder.video.comingSoon')}</Badge>
          ) : (
            <Button onClick={handleGenerate} size="sm" disabled={isGenerating}>
              {isGenerating ? t('generating') : t('generate')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
