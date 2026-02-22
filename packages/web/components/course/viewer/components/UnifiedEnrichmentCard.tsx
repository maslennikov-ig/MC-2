'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video,
  Headphones,
  Presentation,
  HelpCircle,
  Image as ImageIcon,
  ChevronDown,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Database } from '@/types/database.generated'
import {
  isEnrichmentContentType,
  type AudioEnrichmentContent,
  type PresentationEnrichmentContent,
  type VideoEnrichmentContent,
} from '@megacampus/shared-types'
import { cn } from '@/lib/utils'
import { EnrichmentCardImage } from './EnrichmentCardImage'
import { EnrichmentCardOptions, getOptionsSectionTitle } from './EnrichmentCardOptions'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']
type EnrichmentType =
  | 'quiz'
  | 'audio'
  | 'nlm_audio'
  | 'presentation'
  | 'video'
  | 'nlm_video'
  | 'cover'
  | 'card'
type AudioDraftContent = AudioEnrichmentContent
type VideoDraftContent = VideoEnrichmentContent

// Draft preview configuration
const PREVIEW_SLIDE_COUNT = 3
const PREVIEW_SCRIPT_LENGTH = 200

interface UnifiedEnrichmentCardProps {
  type: EnrichmentType
  onGenerate: (settings: Record<string, unknown>) => void
  disabled?: boolean
  isGenerating?: boolean
  /** For image types (cover/card) - existing enrichment to show preview */
  existingEnrichment?: EnrichmentRow | null
  /** Whether generation just completed (show skeleton instead of placeholder) */
  isRecentlyCompleted?: boolean
  /** Callback when image loads (to clear recently completed state) */
  onImageLoaded?: () => void
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
  nlm_audio: {
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
  nlm_video: {
    image: '/placeholders/Video.webp',
    color: 'text-red-500 dark:text-red-400',
    badgeText: '~120 сек',
    icon: Video,
  },
  cover: {
    image: '/placeholders/Cover.webp',
    color: 'text-cyan-500 dark:text-cyan-400',
    badgeText: '21:9',
    icon: ImageIcon,
  },
  card: {
    image: '/placeholders/Card.webp',
    color: 'text-indigo-500 dark:text-indigo-400',
    badgeText: '1:1',
    icon: ImageIcon,
  },
}

const NO_OPTIONS_TYPES: ReadonlySet<EnrichmentType> = new Set(['video', 'nlm_video'])

function isAudioDraftContent(content: unknown): content is AudioDraftContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    (content as Record<string, unknown>).type === 'audio' &&
    typeof (content as Record<string, unknown>).script === 'string'
  )
}

function isVideoDraftContent(content: unknown): content is VideoDraftContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    (content as Record<string, unknown>).type === 'video' &&
    typeof (content as Record<string, unknown>).script === 'string'
  )
}

export function UnifiedEnrichmentCard({
  type,
  onGenerate,
  disabled = false,
  isGenerating = false,
  existingEnrichment,
  isRecentlyCompleted = false,
  onImageLoaded,
}: UnifiedEnrichmentCardProps) {
  const t = useTranslations('enrichments')
  const [isHovered, setIsHovered] = useState(false)
  const [isTouched, setIsTouched] = useState(false)
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)

  // Options state for quiz, audio, presentation
  const [quizQuestions, setQuizQuestions] = useState('10')
  const [quizDifficulty, setQuizDifficulty] = useState('medium')
  const [audioVoice, setAudioVoice] = useState('default')
  const [audioSpeed, setAudioSpeed] = useState('normal')
  const [presentationSlides, setPresentationSlides] = useState('8')
  const [presentationTheme, setPresentationTheme] = useState('light')
  const [nlmAudioFormat, setNlmAudioFormat] = useState<'deep_dive' | 'debate'>('deep_dive')

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
    const rawContent = existingEnrichment?.content
    let url: string | undefined
    let alt: string | undefined

    if (isEnrichmentContentType(rawContent, 'cover')) {
      url = rawContent.imageUrl
      alt = rawContent.altText
    } else if (isEnrichmentContentType(rawContent, 'card')) {
      url = rawContent.imageUrl
      alt = rawContent.altText
    }

    return {
      imageUrl: url,
      hasImage: existingEnrichment?.status === 'completed' && !!url,
      altText: alt,
    }
  }, [existingEnrichment])

  // Check if enrichment is in draft_ready status (two-stage generation)
  const isDraftReady = existingEnrichment?.status === 'draft_ready'

  // Extract draft content for display (presentation, audio script, or video script)
  const draftContent = useMemo(() => {
    if (!isDraftReady || !existingEnrichment?.content) return null

    const rawContent = existingEnrichment.content

    // For presentation: show slide titles/count
    if (isEnrichmentContentType(rawContent, 'presentation')) {
      const content = rawContent as PresentationEnrichmentContent
      return {
        type: 'presentation' as const,
        slideCount: content.total_slides || content.slides?.length || 0,
        slideTitles: content.slides?.slice(0, PREVIEW_SLIDE_COUNT).map((s) => s.title) || [],
        hasMore: (content.slides?.length || 0) > PREVIEW_SLIDE_COUNT,
      }
    }

    // For audio: show script preview
    if (isAudioDraftContent(rawContent)) {
      const content = rawContent
      const scriptPreview = content.script?.slice(0, PREVIEW_SCRIPT_LENGTH) || ''
      return {
        type: 'audio' as const,
        scriptPreview:
          scriptPreview +
          (content.script && content.script.length > PREVIEW_SCRIPT_LENGTH ? '...' : ''),
        estimatedDuration: content.duration_seconds,
      }
    }

    // For video: show script preview
    if (isVideoDraftContent(rawContent)) {
      const content = rawContent
      const scriptPreview = content.script?.slice(0, PREVIEW_SCRIPT_LENGTH) || ''
      return {
        type: 'video' as const,
        scriptPreview:
          scriptPreview +
          (content.script && content.script.length > PREVIEW_SCRIPT_LENGTH ? '...' : ''),
        estimatedDuration: content.estimated_duration_seconds,
      }
    }

    return null
  }, [isDraftReady, existingEnrichment])

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
      case 'nlm_audio':
        return {
          nlm_audio_format: nlmAudioFormat,
        }
      case 'nlm_video':
      case 'video':
        return {}
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
    nlmAudioFormat,
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
    const isMobile = window.matchMedia('(hover: none)').matches
    if (isMobile) {
      setIsTouched((prev) => !prev)
    }
  }, [])

  const getTitle = useCallback(() => {
    if (isImageType) {
      // @ts-expect-error — dynamic translation key with template literal, type verified at runtime
      return t(`images.${type}.title`)
    }
    // @ts-expect-error — dynamic translation key with template literal, type verified at runtime
    return t(`placeholder.${type}.title`)
  }, [t, type, isImageType])

  const getDescription = useCallback(() => {
    if (isImageType) {
      // @ts-expect-error — dynamic translation key with template literal, type verified at runtime
      return t(`images.${type}.description`)
    }
    // @ts-expect-error — dynamic translation key with template literal, type verified at runtime
    return t(`placeholder.${type}.description`)
  }, [t, type, isImageType])

  // Build options props based on type
  const getOptionsProps = useCallback(() => {
    switch (type) {
      case 'quiz':
        return {
          type: 'quiz' as const,
          quizQuestions,
          setQuizQuestions,
          quizDifficulty,
          setQuizDifficulty,
        }
      case 'audio':
        return {
          type: 'audio' as const,
          audioVoice,
          setAudioVoice,
          audioSpeed,
          setAudioSpeed,
        }
      case 'presentation':
        return {
          type: 'presentation' as const,
          presentationSlides,
          setPresentationSlides,
          presentationTheme,
          setPresentationTheme,
        }
      case 'cover':
      case 'card':
        return {
          type: type,
          hasImage,
          imageStyle,
          setImageStyle,
          colorScheme,
          setColorScheme,
          customPrompt,
          setCustomPrompt,
          disabled,
          isGenerating,
        }
      case 'nlm_audio':
        return {
          type: 'nlm_audio' as const,
          nlmAudioFormat,
          setNlmAudioFormat,
        }
      case 'video':
        return { type: 'video' as const }
      case 'nlm_video':
        return { type: 'nlm_video' as const }
      default:
        return { type: 'video' as const }
    }
  }, [
    type,
    quizQuestions,
    quizDifficulty,
    audioVoice,
    audioSpeed,
    nlmAudioFormat,
    presentationSlides,
    presentationTheme,
    hasImage,
    imageStyle,
    colorScheme,
    customPrompt,
    disabled,
    isGenerating,
  ])

  return (
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
      {/* Image Area - delegated to subcomponent */}
      <EnrichmentCardImage
        placeholderImage={config.image}
        imageUrl={imageUrl}
        altText={altText || getTitle()}
        hasImage={hasImage}
        shouldShowPanel={shouldShowPanel}
        badgeText={config.badgeText}
        BadgeIcon={Icon}
        badgeColor={config.color}
        aspectRatio={type === 'cover' ? 'cinematic' : 'square'}
        isRecentlyCompleted={isRecentlyCompleted}
        onImageLoaded={onImageLoaded}
      />

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

        {/* Draft Ready Preview - shown when draft content is available */}
        {isDraftReady && draftContent && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/30 dark:bg-amber-900/20">
            <div className="mb-2 flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
              >
                {t('draftReady')}
              </Badge>
            </div>

            {draftContent.type === 'presentation' && (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {t('draftPreview.slideCount', { count: draftContent.slideCount })}
                </p>
                {draftContent.slideTitles.length > 0 && (
                  <ul className="ml-4 list-disc space-y-0.5 text-amber-700 dark:text-amber-300">
                    {draftContent.slideTitles.map((title, i) => (
                      <li key={i} className="line-clamp-1">
                        {title}
                      </li>
                    ))}
                    {draftContent.hasMore && (
                      <li className="text-amber-600 dark:text-amber-400">...</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {draftContent.type === 'audio' && (
              <div className="space-y-1 text-sm">
                {draftContent.estimatedDuration && (
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {t('draftPreview.estimatedDuration', {
                      minutes: Math.ceil(draftContent.estimatedDuration / 60),
                    })}
                  </p>
                )}
                <p className="line-clamp-3 text-amber-700 dark:text-amber-300">
                  {draftContent.scriptPreview}
                </p>
              </div>
            )}

            {draftContent.type === 'video' && (
              <div className="space-y-1 text-sm">
                {draftContent.estimatedDuration && (
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {t('draftPreview.estimatedDuration', {
                      minutes: Math.ceil(draftContent.estimatedDuration / 60),
                    })}
                  </p>
                )}
                <p className="line-clamp-3 text-amber-700 dark:text-amber-300">
                  {draftContent.scriptPreview}
                </p>
              </div>
            )}
          </div>
        )}
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

            {/* Options Collapsible - delegated to subcomponent */}
            {!NO_OPTIONS_TYPES.has(type) && (
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
                        {getOptionsSectionTitle(t, type, hasImage)}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform',
                          isOptionsOpen && 'rotate-180'
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <EnrichmentCardOptions {...getOptionsProps()} />
                  </CollapsibleContent>
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
  )
}
