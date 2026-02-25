'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip'

type EnrichmentType =
  | 'quiz'
  | 'audio'
  | 'nlm_audio'
  | 'presentation'
  | 'video'
  | 'nlm_video'
  | 'cover'
  | 'card'

interface QuizOptionsProps {
  type: 'quiz'
  quizQuestions: string
  setQuizQuestions: (value: string) => void
  quizDifficulty: string
  setQuizDifficulty: (value: string) => void
}

interface AudioOptionsProps {
  type: 'audio'
  audioVoice: string
  setAudioVoice: (value: string) => void
  audioSpeed: string
  setAudioSpeed: (value: string) => void
}

interface PresentationOptionsProps {
  type: 'presentation'
  presentationSlides: string
  setPresentationSlides: (value: string) => void
  presentationTheme: string
  setPresentationTheme: (value: string) => void
}

interface ImageOptionsProps {
  type: 'cover' | 'card'
  hasImage: boolean
  imageStyle: string
  setImageStyle: (value: string) => void
  colorScheme: string
  setColorScheme: (value: string) => void
  customPrompt: string
  setCustomPrompt: (value: string) => void
  disabled?: boolean
  isGenerating?: boolean
}

interface VideoOptionsProps {
  type: 'video'
}

interface NlmAudioOptionsProps {
  type: 'nlm_audio'
  nlmAudioFormat: 'deep_dive' | 'debate'
  setNlmAudioFormat: (value: 'deep_dive' | 'debate') => void
}

interface NlmVideoOptionsProps {
  type: 'nlm_video'
}

type BaseOptionsProps = {
  onSelectOpenChange?: (open: boolean) => void
}

export type EnrichmentOptionsProps = (
  | QuizOptionsProps
  | AudioOptionsProps
  | PresentationOptionsProps
  | ImageOptionsProps
  | VideoOptionsProps
  | NlmAudioOptionsProps
  | NlmVideoOptionsProps
) &
  BaseOptionsProps

/**
 * Renders type-specific options for enrichment generation.
 * Each enrichment type has its own set of configurable options.
 */
export function EnrichmentCardOptions(props: EnrichmentOptionsProps) {
  const t = useTranslations('enrichments')
  const { onSelectOpenChange } = props

  // Video has no options
  if (props.type === 'video' || props.type === 'nlm_video') {
    return null
  }

  // NLM audio options
  if (props.type === 'nlm_audio') {
    const { nlmAudioFormat, setNlmAudioFormat } = props
    return (
      <div className="space-y-3 pt-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('forms.nlmAudio.format')}</label>
          <Select
            value={nlmAudioFormat}
            onValueChange={(value) => setNlmAudioFormat(value as 'deep_dive' | 'debate')}
            onOpenChange={onSelectOpenChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deep_dive">{t('forms.nlmAudio.formatDeepDive')}</SelectItem>
              <SelectItem value="debate">{t('forms.nlmAudio.formatDebate')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  }

  // Image types (cover/card)
  if (props.type === 'cover' || props.type === 'card') {
    const {
      hasImage,
      imageStyle,
      setImageStyle,
      colorScheme,
      setColorScheme,
      customPrompt,
      setCustomPrompt,
      disabled,
      isGenerating,
    } = props

    // For image types with existing image, show regenerate options
    if (hasImage) {
      return (
        <div className="space-y-3 pt-3">
          <div className="space-y-1.5">
            <LabelWithTooltip
              label={t('images.regeneratePrompt.label')}
              tooltip={t('images.regeneratePrompt.tooltip')}
            />
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={t('images.regeneratePrompt.placeholder')}
              className="min-h-[80px] resize-none text-sm"
              disabled={disabled || isGenerating}
            />
          </div>
        </div>
      )
    }

    // For image types without existing image
    return (
      <div className="space-y-3 pt-3">
        <div className="space-y-1.5">
          <LabelWithTooltip label={t('images.style.label')} tooltip={t('images.style.tooltip')} />
          <Select
            value={imageStyle}
            onValueChange={setImageStyle}
            onOpenChange={onSelectOpenChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realistic">{t('images.style.realistic')}</SelectItem>
              <SelectItem value="abstract">{t('images.style.abstract')}</SelectItem>
              <SelectItem value="minimalist">{t('images.style.minimalist')}</SelectItem>
              {props.type === 'cover' && (
                <SelectItem value="dramatic">{t('images.style.dramatic')}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <LabelWithTooltip
            label={t('images.colorScheme.label')}
            tooltip={t('images.colorScheme.tooltip')}
          />
          <Select
            value={colorScheme}
            onValueChange={setColorScheme}
            onOpenChange={onSelectOpenChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('images.colorScheme.auto')}</SelectItem>
              <SelectItem value="warm">{t('images.colorScheme.warm')}</SelectItem>
              <SelectItem value="cool">{t('images.colorScheme.cool')}</SelectItem>
              <SelectItem value="monochrome">{t('images.colorScheme.monochrome')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <LabelWithTooltip
            label={t('images.customPrompt.label')}
            tooltip={t('images.customPrompt.tooltip')}
          />
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={t('images.customPrompt.placeholder')}
            className="min-h-[80px] resize-none text-sm"
            disabled={disabled || isGenerating}
          />
        </div>
      </div>
    )
  }

  // Quiz options
  if (props.type === 'quiz') {
    const { quizQuestions, setQuizQuestions, quizDifficulty, setQuizDifficulty } = props
    return (
      <div className="space-y-3 pt-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('forms.quiz.questionCount')}</label>
          <Select
            value={quizQuestions}
            onValueChange={setQuizQuestions}
            onOpenChange={onSelectOpenChange}
          >
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
          <Select
            value={quizDifficulty}
            onValueChange={setQuizDifficulty}
            onOpenChange={onSelectOpenChange}
          >
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
  }

  // Audio options
  if (props.type === 'audio') {
    const { audioVoice, setAudioVoice, audioSpeed, setAudioSpeed } = props
    return (
      <div className="space-y-3 pt-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('forms.audio.voice')}</label>
          <Select
            value={audioVoice}
            onValueChange={setAudioVoice}
            onOpenChange={onSelectOpenChange}
          >
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
          <Select
            value={audioSpeed}
            onValueChange={setAudioSpeed}
            onOpenChange={onSelectOpenChange}
          >
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
  }

  // Presentation options
  if (props.type === 'presentation') {
    const { presentationSlides, setPresentationSlides, presentationTheme, setPresentationTheme } =
      props
    return (
      <div className="space-y-3 pt-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('forms.presentation.slideCount')}</label>
          <Select
            value={presentationSlides}
            onValueChange={setPresentationSlides}
            onOpenChange={onSelectOpenChange}
          >
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
          <Select
            value={presentationTheme}
            onValueChange={setPresentationTheme}
            onOpenChange={onSelectOpenChange}
          >
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
  }

  return null
}

/**
 * Helper to get options section title based on type and state
 */
export function getOptionsSectionTitle(
  t: ReturnType<typeof useTranslations<'enrichments'>>,
  type: EnrichmentType,
  hasImage: boolean
): React.ReactNode {
  const isImageType = type === 'cover' || type === 'card'
  if (isImageType && hasImage) {
    return (
      <>
        <RefreshCw className="h-4 w-4" />
        {t('images.regenerateSection')}
      </>
    )
  }
  return t('options')
}
