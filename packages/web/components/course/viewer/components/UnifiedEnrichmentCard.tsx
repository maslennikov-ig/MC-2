'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video,
  Headphones,
  Presentation,
  HelpCircle,
  Image as ImageIcon,
  ChevronDown,
  Loader2,
  Expand,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Database } from '@/types/database.generated'
import type { CoverEnrichmentContent, CardEnrichmentContent } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']
type EnrichmentType = 'quiz' | 'audio' | 'presentation' | 'video' | 'cover' | 'card'

interface UnifiedEnrichmentCardProps {
  type: EnrichmentType
  onGenerate: (settings: Record<string, unknown>) => void
  disabled?: boolean
  isGenerating?: boolean
  /** For image types (cover/card) - existing enrichment to show preview */
  existingEnrichment?: EnrichmentRow | null
}

const PLACEHOLDER_CONFIG: Record<
  EnrichmentType,
  {
    image: string
    color: string
    badgeText: string
    icon: React.ElementType
  }
> = {
  quiz: {
    image: '/placeholders/Quiz.webp',
    color: 'text-green-500 dark:text-green-400',
    badgeText: '~45 сек',
    icon: HelpCircle,
  },
  audio: {
    image: '/placeholders/Audio.webp',
    color: 'text-purple-500 dark:text-purple-400',
    badgeText: '~30 сек',
    icon: Headphones,
  },
  presentation: {
    image: '/placeholders/Presentation.webp',
    color: 'text-orange-500 dark:text-orange-400',
    badgeText: '~90 сек',
    icon: Presentation,
  },
  video: {
    image: '/placeholders/Video.webp',
    color: 'text-red-500 dark:text-red-400',
    badgeText: 'Скоро',
    icon: Video,
  },
  cover: {
    image: '/placeholders/Cover.webp',
    color: 'text-cyan-500 dark:text-cyan-400',
    badgeText: '16:9',
    icon: ImageIcon,
  },
  card: {
    image: '/placeholders/Card.webp',
    color: 'text-indigo-500 dark:text-indigo-400',
    badgeText: '1:1',
    icon: ImageIcon,
  },
}

/** Helper component for field label with tooltip */
function LabelWithTooltip({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3.5 w-3.5 cursor-help text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

export function UnifiedEnrichmentCard({
  type,
  onGenerate,
  disabled = false,
  isGenerating = false,
  existingEnrichment,
}: UnifiedEnrichmentCardProps) {
  const t = useTranslations('enrichments')
  const [isHovered, setIsHovered] = useState(false)
  const [isTouched, setIsTouched] = useState(false) // For mobile touch devices
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  // Options state for quiz, audio, presentation
  const [quizQuestions, setQuizQuestions] = useState('10')
  const [quizDifficulty, setQuizDifficulty] = useState('medium')
  const [audioVoice, setAudioVoice] = useState('default')
  const [audioSpeed, setAudioSpeed] = useState('normal')
  const [presentationSlides, setPresentationSlides] = useState('8')
  const [presentationTheme, setPresentationTheme] = useState('light')

  // Options state for cover, card images
  const [imageStyle, setImageStyle] = useState('realistic')
  const [colorScheme, setColorScheme] = useState('auto')
  const [customPrompt, setCustomPrompt] = useState('')

  const config = PLACEHOLDER_CONFIG[type]
  const Icon = config.icon

  // Memoize computed values for performance
  const isImageType = useMemo(() => type === 'cover' || type === 'card', [type])

  // Extract image URL from content if enrichment exists (for image types)
  const { imageUrl, hasImage, altText } = useMemo(() => {
    const content = existingEnrichment?.content as
      | CoverEnrichmentContent
      | CardEnrichmentContent
      | null
    const url = content?.imageUrl
    return {
      imageUrl: url,
      hasImage: existingEnrichment?.status === 'completed' && !!url,
      altText: content?.altText,
    }
  }, [existingEnrichment])

  // Show reveal panel on hover (desktop) or touch (mobile)
  const shouldShowPanel = isHovered || isTouched

  // Close touch panel when generating starts
  useEffect(() => {
    let isMounted = true
    if (isGenerating && isMounted) {
      setIsTouched(false)
    }
    return () => {
      isMounted = false
    }
  }, [isGenerating])

  /**
   * Collect current settings based on enrichment type
   */
  const getSettings = useCallback((): Record<string, unknown> => {
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
      case 'cover':
      case 'card':
        return {
          style: imageStyle,
          colorScheme,
          customPrompt: customPrompt.trim() || undefined,
        }
      default:
        return {}
    }
  }, [
    type,
    quizQuestions,
    quizDifficulty,
    audioVoice,
    audioSpeed,
    presentationSlides,
    presentationTheme,
    imageStyle,
    colorScheme,
    customPrompt,
  ])

  const handleGenerate = useCallback(() => {
    onGenerate(getSettings())
    setIsOptionsOpen(false)
  }, [onGenerate, getSettings])

  const handleRegenerate = useCallback(() => {
    onGenerate({
      style: imageStyle,
      colorScheme,
      customPrompt: customPrompt.trim() || undefined,
      regenerate: true,
    })
    setCustomPrompt('')
    setIsOptionsOpen(false)
  }, [onGenerate, imageStyle, colorScheme, customPrompt])

  const handleCardClick = useCallback(() => {
    // Check if device has no hover capability (truly mobile)
    const isMobile = window.matchMedia('(hover: none)').matches
    if (isMobile) {
      setIsTouched((prev) => !prev)
    }
  }, [])

  /**
   * Render options based on enrichment type
   */
  const renderOptions = () => {
    // For video, no options
    if (type === 'video') {
      return null
    }

    // For image types with existing image, show regenerate options
    if (isImageType && hasImage) {
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
    if (isImageType) {
      return (
        <div className="space-y-3 pt-3">
          <div className="space-y-1.5">
            <LabelWithTooltip label={t('images.style.label')} tooltip={t('images.style.tooltip')} />
            <Select value={imageStyle} onValueChange={setImageStyle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realistic">{t('images.style.realistic')}</SelectItem>
                <SelectItem value="abstract">{t('images.style.abstract')}</SelectItem>
                <SelectItem value="minimalist">{t('images.style.minimalist')}</SelectItem>
                {type === 'cover' && (
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
            <Select value={colorScheme} onValueChange={setColorScheme}>
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

    // For quiz, audio, presentation
    switch (type) {
      case 'quiz':
        return (
          <div className="space-y-3 pt-3">
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
          <div className="space-y-3 pt-3">
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
          <div className="space-y-3 pt-3">
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

      default:
        return null
    }
  }

  const getTitle = () => {
    // Type assertion needed for dynamic i18n keys
    if (isImageType) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return t(`images.${type}.title` as any)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return t(`placeholder.${type}.title` as any)
  }

  const getDescription = () => {
    // Type assertion needed for dynamic i18n keys
    if (isImageType) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return t(`images.${type}.description` as any)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return t(`placeholder.${type}.description` as any)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleCardClick}
        className={cn(
          'group relative cursor-pointer overflow-hidden rounded-2xl',
          'flex min-h-[480px] flex-col transition-shadow duration-300',
          'border border-gray-200 bg-white shadow-md hover:shadow-xl',
          'dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg dark:hover:shadow-2xl'
        )}
      >
        {/* Image Area - Placeholder or Preview */}
        <div className="relative min-h-[280px] flex-1 overflow-hidden">
          {/* For image types with existing image, show preview */}
          {isImageType && hasImage && imageUrl ? (
            <>
              <Image
                src={imageUrl}
                alt={altText || getTitle()}
                fill
                className={cn(
                  'object-cover transition-all duration-500',
                  shouldShowPanel && 'scale-105 brightness-90 dark:brightness-75'
                )}
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              />
              {/* Lightbox button overlay */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsLightboxOpen(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsLightboxOpen(true)
                  }
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                aria-label="View full image"
              >
                <Expand className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </>
          ) : (
            /* Placeholder image */
            <Image
              src={config.image}
              alt={getTitle()}
              fill
              className={cn(
                'object-cover transition-all duration-500',
                shouldShowPanel && 'scale-105 brightness-90 dark:brightness-75'
              )}
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            />
          )}

          {/* Gradient at bottom of image for dark theme */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent dark:from-black/60" />

          {/* Badge over image */}
          <div className="absolute top-4 left-4">
            <Badge
              className={cn(
                'border backdrop-blur-sm',
                'bg-white/90 dark:bg-slate-900/90',
                config.color
              )}
            >
              <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
              {config.badgeText}
            </Badge>
          </div>
        </div>

        {/* Base Content - always visible */}
        <div className="p-4">
          <h3
            className={cn(
              'line-clamp-2 text-base font-semibold transition-colors',
              'text-gray-900 group-hover:text-purple-600',
              'dark:text-white dark:group-hover:text-purple-400'
            )}
          >
            {getTitle()}
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <Icon className={cn('h-4 w-4', config.color)} />
            <p className="line-clamp-1 text-sm text-gray-500 dark:text-slate-400">
              {getDescription()}
            </p>
          </div>
        </div>

        {/* Hover Reveal Panel */}
        <AnimatePresence>
          {shouldShowPanel && !isGenerating && (
            <motion.div
              key="hover-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className={cn(
                'absolute inset-x-0 bottom-0 flex flex-col',
                'rounded-t-2xl border-t p-4 pt-5 backdrop-blur-md',
                'border-gray-200 bg-gradient-to-t from-white via-white to-white/95 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)]',
                'dark:border-slate-700/50 dark:bg-gradient-to-t dark:from-slate-900 dark:via-slate-900 dark:to-slate-900/95 dark:shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.3)]'
              )}
            >
              {/* Title */}
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="line-clamp-2 text-base font-semibold text-gray-900 dark:text-white"
              >
                {getTitle()}
              </motion.h3>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-slate-300"
              >
                {getDescription()}
              </motion.p>

              {/* Options Collapsible */}
              {type !== 'video' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mt-3"
                >
                  <Collapsible open={isOptionsOpen} onOpenChange={setIsOptionsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between px-2">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {isImageType && hasImage ? (
                            <>
                              <RefreshCw
                                className={cn('h-4 w-4', isOptionsOpen && 'text-purple-500')}
                              />
                              {t('images.regenerateSection')}
                            </>
                          ) : (
                            t('options')
                          )}
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 transition-transform',
                            isOptionsOpen && 'rotate-180'
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>{renderOptions()}</CollapsibleContent>
                  </Collapsible>
                </motion.div>
              )}

              {/* CTA Button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {disabled || type === 'video' ? (
                  <Badge
                    variant="secondary"
                    className="mt-4 flex h-10 w-full items-center justify-center text-sm"
                  >
                    {t('placeholder.video.comingSoon')}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="default"
                    className={cn(
                      'mt-4 h-10 w-full rounded-full',
                      'bg-gradient-to-r from-purple-600 to-purple-700 font-medium text-white',
                      'hover:from-purple-700 hover:to-purple-800',
                      'transition-all hover:scale-[1.02]'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isImageType && hasImage) {
                        handleRegenerate()
                      } else {
                        handleGenerate()
                      }
                    }}
                    disabled={isGenerating}
                    aria-label={`Generate ${type} enrichment`}
                    aria-busy={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('generating')}
                      </>
                    ) : isImageType && hasImage ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t('images.regenerateButton')}
                      </>
                    ) : (
                      t('generate')
                    )}
                  </Button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generating Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
              <p className="text-sm font-medium text-white">{t('generating')}</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Lightbox Dialog for image preview */}
      {isImageType && hasImage && imageUrl && (
        <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
          <DialogContent className="max-w-4xl p-2">
            <DialogTitle className="sr-only">{getTitle()}</DialogTitle>
            <div
              className={cn('relative w-full', type === 'cover' ? 'aspect-video' : 'aspect-square')}
            >
              <Image
                src={imageUrl}
                alt={altText || getTitle()}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 900px"
                priority
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
