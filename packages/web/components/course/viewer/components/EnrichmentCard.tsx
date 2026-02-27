'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Pause,
  X,
  RefreshCw,
  Trash2,
  Loader2,
  ExternalLink,
  Download,
  BookOpen,
  Layers,
  Network,
  ZoomIn,
} from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { AudioPlayer } from '../enrichments/AudioPlayer'
import { QuizPlayer } from '../enrichments/QuizPlayer'
import { StudyGuideViewer } from '../enrichments/StudyGuideViewer'
import { FlashcardViewer } from '../enrichments/FlashcardViewer'
import { MindMapViewer } from '../enrichments/MindMapViewer'
import { InfographicViewer } from '../enrichments/InfographicViewer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Database } from '@/types/database.generated'
import { ENRICHMENT_CONFIG, type EnrichmentType } from './enrichment-config'
import {
  isQuizContent,
  isAudioContent,
  isPresentationContent,
  isVideoContent,
  isStudyGuideContent,
  isFlashcardsContent,
  isMindMapContent,
  isInfographicContent,
} from './enrichment-type-guards'
import { getEnrichmentPlaybackUrl } from '@/lib/helpers/storage-helpers'
import { deleteEnrichment, regenerateEnrichment } from '@/app/actions/enrichment-actions'
import { cn } from '@/lib/utils'

const EnrichmentVideoPlayer = dynamic(() => import('./EnrichmentVideoPlayer'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-200 dark:bg-slate-700" />,
})

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

// Placeholder images per type (same as UnifiedEnrichmentCard)
const PLACEHOLDER_IMAGES: Record<string, string> = {
  quiz: '/placeholders/Quiz.webp',
  audio: '/placeholders/Audio.webp',
  nlm_audio: '/placeholders/Audio.webp',
  presentation: '/placeholders/Presentation.webp',
  video: '/placeholders/Video.webp',
  nlm_video: '/placeholders/Video.webp',
  document: '/placeholders/Presentation.webp',
  nlm_study_guide: '/placeholders/Quiz.webp',
  nlm_flashcards: '/placeholders/Quiz.webp',
  nlm_mind_map: '/placeholders/Presentation.webp',
  nlm_infographic: '/placeholders/Cover.webp',
}

interface EnrichmentCardProps {
  enrichment: EnrichmentRow
  /** Whether the enrichment content is expanded (used by quiz to show inline player) */
  isActive: boolean
  /** Toggle enrichment content visibility (used by quiz start/close button) */
  onToggle: () => void
  courseId?: string
  onRefreshEnrichments?: () => void
}

export function EnrichmentCard({
  enrichment,
  isActive,
  onToggle,
  courseId,
  onRefreshEnrichments,
}: EnrichmentCardProps) {
  const t = useTranslations('enrichments')
  const type = enrichment.enrichment_type as EnrichmentType
  const config = ENRICHMENT_CONFIG[type]
  const Icon = config.icon
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Audio overlay state
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const audioToggleRef = useRef<(() => void) | null>(null)

  const isVideoType = type === 'video' || type === 'nlm_video'
  const isAudioType = type === 'audio' || type === 'nlm_audio'

  const handleRetryUrl = () => {
    setUrlError(false)
    setUrlLoading(true)
    setPlaybackUrl(null)
    getEnrichmentPlaybackUrl(enrichment)
      .then((url) => {
        setPlaybackUrl(url)
        if (!url) setUrlError(true)
      })
      .catch(() => setUrlError(true))
      .finally(() => setUrlLoading(false))
  }

  // Pre-fetch playback URL eagerly on mount for video/audio enrichments
  useEffect(() => {
    if ((isAudioType || isVideoType) && enrichment.status === 'completed') {
      setUrlLoading(true)
      setUrlError(false)
      getEnrichmentPlaybackUrl(enrichment)
        .then((url) => {
          setPlaybackUrl(url)
          if (!url) setUrlError(true)
        })
        .catch(() => setUrlError(true))
        .finally(() => setUrlLoading(false))
    }
  }, [enrichment.id, enrichment.status])

  // Reset audio playing state when deactivated
  useEffect(() => {
    if (!isActive) setIsAudioPlaying(false)
  }, [isActive])

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
        case 'audio':
        case 'nlm_audio': {
          if (isAudioContent(content)) {
            return content.duration_seconds
              ? t('viewer.minutesShort', { count: Math.ceil(content.duration_seconds / 60) })
              : null
          }
          return null
        }
        case 'video':
        case 'nlm_video': {
          if (isVideoContent(content)) {
            return content.duration_seconds
              ? t('viewer.minutesShort', { count: Math.ceil(content.duration_seconds / 60) })
              : null
          }
          return null
        }
        case 'nlm_study_guide': {
          if (isStudyGuideContent(content)) {
            return content.word_count
              ? t('viewer.studyGuide.wordCount', { count: content.word_count })
              : null
          }
          return null
        }
        case 'nlm_flashcards': {
          if (isFlashcardsContent(content)) {
            return t('viewer.flashcards.cardCount', { count: content.total_cards })
          }
          return null
        }
        case 'nlm_mind_map': {
          if (isMindMapContent(content)) {
            return content.total_nodes
              ? t('viewer.mindMap.nodeCount', { count: content.total_nodes })
              : null
          }
          return null
        }
        case 'nlm_infographic': {
          return null
        }
        default:
          return null
      }
    } catch {
      return null
    }
  }

  const getDescriptionKey = () => {
    switch (type) {
      case 'quiz':
        return 'viewer.checkKnowledge'
      case 'audio':
        return 'viewer.audioVersion'
      case 'nlm_audio':
        return 'viewer.nlmAudioVersion'
      case 'video':
        return 'viewer.videoVersion'
      case 'nlm_video':
        return 'viewer.nlmVideoVersion'
      case 'presentation':
        return 'viewer.lessonPresentation'
      case 'document':
        return 'viewer.additionalMaterials'
      case 'nlm_study_guide':
        return 'viewer.studyGuide.description'
      case 'nlm_flashcards':
        return 'viewer.flashcards.description'
      case 'nlm_mind_map':
        return 'viewer.mindMap.description'
      case 'nlm_infographic':
        return 'viewer.infographic.description'
      default:
        return 'viewer.additionalMaterials'
    }
  }

  const handleRegenerate = async () => {
    if (!courseId) return
    setIsRegenerating(true)
    try {
      const result = await regenerateEnrichment({ enrichmentId: enrichment.id, courseId })
      if (result.success) {
        toast.success(t('viewer.regenerateSuccess'))
        onRefreshEnrichments?.()
      } else {
        toast.error(t('viewer.regenerateFailed'))
      }
    } catch {
      toast.error(t('viewer.regenerateFailed'))
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleDelete = async () => {
    if (!courseId) return
    setIsDeleting(true)
    try {
      const result = await deleteEnrichment({ enrichmentId: enrichment.id, courseId })
      if (result.success) {
        toast.success(t('viewer.deleteSuccess'))
        onRefreshEnrichments?.()
      } else {
        toast.error(t('viewer.deleteFailed'))
      }
    } catch {
      toast.error(t('viewer.deleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const preview = getContentPreview()
  // @ts-expect-error — config.labelKey is a string from ENRICHMENT_CONFIG, validated at runtime
  const label = t(config.labelKey)
  const placeholderImage = PLACEHOLDER_IMAGES[type] || '/placeholders/Quiz.webp'

  // Render the image/preview area content
  const renderImageArea = () => {
    // Video with URL ready: show Vidstack player with Poster (single-click play)
    if (isVideoType && playbackUrl) {
      return (
        <EnrichmentVideoPlayer
          src={playbackUrl}
          poster={placeholderImage}
          alt={enrichment.title || label}
          onError={() => setUrlError(true)}
        />
      )
    }

    // Video loading URL: placeholder with spinner
    if (isVideoType && urlLoading) {
      return (
        <>
          <img
            src={placeholderImage}
            alt={enrichment.title || label}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          </div>
        </>
      )
    }

    // Video URL fetch failed: dimmed placeholder
    if (isVideoType && urlError) {
      return (
        <>
          <img
            src={placeholderImage}
            alt={enrichment.title || label}
            className="h-full w-full object-cover opacity-50"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="text-sm text-white/80">{t('viewer.videoUnavailable')}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                handleRetryUrl()
              }}
              className="text-white/80 hover:bg-white/20 hover:text-white"
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              {t('retry')}
            </Button>
          </div>
        </>
      )
    }

    // Audio loading URL: placeholder with spinner
    if (isAudioType && urlLoading) {
      return (
        <>
          <img
            src={placeholderImage}
            alt={enrichment.title || label}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          </div>
        </>
      )
    }

    // Audio URL fetch failed: dimmed placeholder
    if (isAudioType && urlError) {
      return (
        <>
          <img
            src={placeholderImage}
            alt={enrichment.title || label}
            className="h-full w-full object-cover opacity-50"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="text-sm text-white/80">{t('viewer.audioUnavailable')}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                handleRetryUrl()
              }}
              className="text-white/80 hover:bg-white/20 hover:text-white"
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              {t('retry')}
            </Button>
          </div>
        </>
      )
    }

    // Audio with URL ready: overlay with play/pause + compact controls (single-click play)
    if (isAudioType && playbackUrl) {
      return (
        <>
          <img
            src={placeholderImage}
            alt={enrichment.title || label}
            className="h-full w-full object-cover"
          />
          {/* Darkened overlay — click toggles play/pause */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              audioToggleRef.current?.()
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/50"
            aria-label={isAudioPlaying ? t('viewer.pause') : t('viewer.play')}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={isAudioPlaying ? 'pause' : 'play'}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"
              >
                {isAudioPlaying ? (
                  <Pause className="h-7 w-7 text-white" />
                ) : (
                  <Play className="ml-0.5 h-7 w-7 text-white" />
                )}
              </motion.div>
            </AnimatePresence>
          </button>
          {/* Compact audio controls at bottom of image area */}
          <div className="absolute right-0 bottom-0 left-0 z-10 bg-gradient-to-t from-black/60 to-transparent">
            <AudioPlayer
              enrichment={enrichment}
              playbackUrl={playbackUrl ?? undefined}
              onPlayingChange={setIsAudioPlaying}
              togglePlayRef={audioToggleRef}
              compact
            />
          </div>
        </>
      )
    }

    // Default: placeholder image with gradient
    return (
      <>
        <img
          src={placeholderImage}
          alt={enrichment.title || label}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'group relative overflow-hidden rounded-2xl',
        'flex min-h-[480px] flex-col transition-shadow duration-300',
        'border border-gray-200 bg-white shadow-md hover:shadow-xl',
        'dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg dark:hover:shadow-2xl'
      )}
    >
      {/* Image/Preview Area */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-slate-800">
        {renderImageArea()}

        {/* Badge with content preview (top-right) — hide when video player is visible */}
        {preview && !(isVideoType && playbackUrl) && (
          <div className="absolute top-3 right-3 z-10">
            <Badge className="border-0 bg-black/60 text-white backdrop-blur-sm">
              <Icon className={cn('mr-1 h-3 w-3', config.color)} />
              {preview}
            </Badge>
          </div>
        )}

        {/* Type label badge (top-left) — hide when video player is visible */}
        {!(isVideoType && playbackUrl) && (
          <div className="absolute top-3 left-3 z-10">
            <Badge className={cn('border-0 backdrop-blur-sm', config.bgColor)}>
              <Icon className={cn('mr-1 h-3 w-3', config.color)} />
              {label}
            </Badge>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="flex flex-1 flex-col p-4">
        <h3
          className={cn(
            'line-clamp-2 text-base font-semibold transition-colors',
            'text-gray-900 group-hover:text-purple-600',
            'dark:text-white dark:group-hover:text-purple-400'
          )}
        >
          {enrichment.title || label}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-slate-400">
          {t(getDescriptionKey())}
        </p>

        {/* Quiz player when active */}
        {isActive && type === 'quiz' && isQuizContent(enrichment.content) && (
          <div className="mt-3">
            <QuizPlayer
              content={enrichment.content}
              enrichmentId={enrichment.id}
              onComplete={() => {}}
            />
          </div>
        )}

        {/* Study Guide viewer when active */}
        {isActive && type === 'nlm_study_guide' && isStudyGuideContent(enrichment.content) && (
          <div className="mt-3">
            <StudyGuideViewer content={enrichment.content} />
          </div>
        )}

        {/* Flashcard viewer when active */}
        {isActive && type === 'nlm_flashcards' && isFlashcardsContent(enrichment.content) && (
          <div className="mt-3">
            <FlashcardViewer content={enrichment.content} enrichmentId={enrichment.id} />
          </div>
        )}

        {/* Mind Map viewer when active */}
        {isActive && type === 'nlm_mind_map' && isMindMapContent(enrichment.content) && (
          <div className="mt-3">
            <MindMapViewer content={enrichment.content} />
          </div>
        )}

        {/* Infographic: show thumbnail always when content is available */}
        {type === 'nlm_infographic' && isInfographicContent(enrichment.content) && (
          <div className="mt-3">
            <InfographicViewer content={enrichment.content} />
          </div>
        )}

        {/* Action buttons — always visible at bottom */}
        <div className="mt-auto flex items-center gap-2 pt-3">
          {/* Start quiz button (video/audio use built-in player controls on the card) */}
          {type === 'quiz' && (
            <Button size="sm" className="flex-1 gap-2" onClick={onToggle}>
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

          {/* Open for presentation */}
          {type === 'presentation' && (
            <Button size="sm" className="flex-1 gap-2">
              <ExternalLink className="h-4 w-4" />
              {t('viewer.open')}
            </Button>
          )}

          {/* Download for document */}
          {type === 'document' && (
            <Button size="sm" variant="outline" className="flex-1 gap-2">
              <Download className="h-4 w-4" />
              {t('viewer.download')}
            </Button>
          )}

          {/* Study Guide: open/close toggle */}
          {type === 'nlm_study_guide' && (
            <Button size="sm" className="flex-1 gap-2" onClick={onToggle}>
              {isActive ? (
                <>
                  <X className="h-4 w-4" />
                  {t('viewer.close')}
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4" />
                  {t('viewer.studyGuide.open')}
                </>
              )}
            </Button>
          )}

          {/* Flashcards: start/close toggle */}
          {type === 'nlm_flashcards' && (
            <Button size="sm" className="flex-1 gap-2" onClick={onToggle}>
              {isActive ? (
                <>
                  <X className="h-4 w-4" />
                  {t('viewer.close')}
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4" />
                  {t('viewer.flashcards.start')}
                </>
              )}
            </Button>
          )}

          {/* Mind Map: view/close toggle */}
          {type === 'nlm_mind_map' && (
            <Button size="sm" className="flex-1 gap-2" onClick={onToggle}>
              {isActive ? (
                <>
                  <X className="h-4 w-4" />
                  {t('viewer.close')}
                </>
              ) : (
                <>
                  <Network className="h-4 w-4" />
                  {t('viewer.mindMap.view')}
                </>
              )}
            </Button>
          )}

          {/* Infographic: zoom toggle */}
          {type === 'nlm_infographic' && isInfographicContent(enrichment.content) && (
            <Button size="sm" variant="outline" className="flex-1 gap-2" onClick={onToggle}>
              <ZoomIn className="h-4 w-4" />
              {t('viewer.infographic.zoom')}
            </Button>
          )}

          {/* Regenerate button */}
          {courseId && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => void handleRegenerate()}
              disabled={isRegenerating}
              title={t('actions.regenerate')}
              className="h-8 w-8 shrink-0"
            >
              {isRegenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Delete button with confirmation */}
          {courseId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={isDeleting}
                  title={t('actions.delete')}
                  className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('viewer.confirmDeleteTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('viewer.confirmDeleteDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('viewer.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void handleDelete()}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {t('viewer.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </motion.div>
  )
}
