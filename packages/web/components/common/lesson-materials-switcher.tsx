'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  BookOpen,
  Film,
  Headphones,
  HelpCircle,
  Presentation,
  FileText,
  Download,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import PersistentVideoPlayer from './persistent-video-player'
import { AudioPlayer } from '@/components/course/viewer/enrichments/AudioPlayer'
import { QuizPlayer } from '@/components/course/viewer/enrichments/QuizPlayer'
import { getEnrichmentPlaybackUrl } from '@/lib/helpers/storage-helpers'
import { Button } from '@/components/ui/button'
import type { Database } from '@/types/database.generated'
import type { Asset, Lesson } from '@/types/database'
import type { QuizEnrichmentContent } from '@megacampus/shared-types'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface LessonMaterialEnrichment {
  id?: string
  enrichment_type: string
  status: string
  content: unknown
}

interface LessonMaterialsSwitcherProps {
  lesson: Lesson
  assets?: Asset[]
  enrichments?: LessonMaterialEnrichment[]
}

type MaterialType = 'video' | 'audio' | 'quiz' | 'presentation' | 'document'

export function LessonMaterialsSwitcher({
  lesson,
  assets = [],
  enrichments = [],
}: LessonMaterialsSwitcherProps) {
  const t = useTranslations('enrichments.switcher')

  // States for dynamic URLs
  const [videoPlaybackUrl, setVideoPlaybackUrl] = useState<string | null>(null)
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState<string | null>(null)
  const [videoMode, setVideoMode] = useState<'hidden' | 'normal' | 'floating'>('normal')

  // Filter completed enrichments
  const completedEnrichments = enrichments.filter((e) => e.status === 'completed')

  const isType = (e: LessonMaterialEnrichment, typeStr: string) => e.enrichment_type === typeStr

  // 1. Video
  const videoEnrichment = completedEnrichments.find(
    (e) => isType(e, 'video') || isType(e, 'nlm_video')
  )
  const legacyVideoAsset = assets.find((a) => {
    if (a.filename) {
      const exts = ['.mp4', '.webm', '.ogg', '.avi', '.mov']
      if (exts.some((ext) => a.filename!.toLowerCase().endsWith(ext))) return true
    }
    if ((a.metadata as Record<string, unknown>)?.type === 'video') return true
    if (a.url) {
      if (a.url.includes('.mp4') || a.url.includes('.webm') || a.url.includes('.ogg')) return true
      if (
        a.url.includes('youtube.com') ||
        a.url.includes('youtu.be') ||
        a.url.includes('vimeo.com')
      )
        return true
    }
    return false
  })
  const hasVideo = !!videoEnrichment || !!legacyVideoAsset

  // 2. Audio
  const audioEnrichment = completedEnrichments.find(
    (e) => isType(e, 'audio') || isType(e, 'nlm_audio')
  )
  const hasAudio = !!audioEnrichment

  // 3. Quiz
  const quizEnrichment = completedEnrichments.find((e) => isType(e, 'quiz') && !!e.content)
  const hasQuiz = !!quizEnrichment

  // 4. Presentation
  const presentationEnrichment = completedEnrichments.find(
    (e) => isType(e, 'presentation') && !!e.content
  )
  const hasPresentation = !!presentationEnrichment

  // 5. Document
  const documentEnrichment = completedEnrichments.find((e) => isType(e, 'document') && !!e.content)
  const hasDocument = !!documentEnrichment

  // Determine available tabs
  const availableTypes: MaterialType[] = []
  if (hasVideo) availableTypes.push('video')
  if (hasAudio) availableTypes.push('audio')
  if (hasQuiz) availableTypes.push('quiz')
  if (hasPresentation) availableTypes.push('presentation')
  if (hasDocument) availableTypes.push('document')

  // Set default active tab to the first available
  const [activeTab, setActiveTab] = useState<MaterialType | ''>('')

  // Reset when lesson changes or available types change
  useEffect(() => {
    if (availableTypes.length > 0 && !availableTypes.includes(activeTab as MaterialType)) {
      setActiveTab(availableTypes[0])
    } else if (availableTypes.length === 0) {
      setActiveTab('')
    }
  }, [lesson.id, availableTypes.join(',')])

  // Fetch URLs for media
  useEffect(() => {
    let isMounted = true

    async function fetchUrls() {
      if (videoEnrichment?.id) {
        const url = await getEnrichmentPlaybackUrl({
          id: videoEnrichment.id,
          status: videoEnrichment.status,
        })
        if (isMounted) setVideoPlaybackUrl(url)
      } else {
        if (isMounted) setVideoPlaybackUrl(null)
      }

      if (audioEnrichment?.id) {
        const url = await getEnrichmentPlaybackUrl({
          id: audioEnrichment.id,
          status: audioEnrichment.status,
        })
        if (isMounted) setAudioPlaybackUrl(url)
      } else {
        if (isMounted) setAudioPlaybackUrl(null)
      }
    }
    void fetchUrls()

    return () => {
      isMounted = false
    }
  }, [videoEnrichment?.id, audioEnrichment?.id])

  if (availableTypes.length === 0) return null

  const renderVideo = () => {
    // Defensive: restore banner if video was somehow hidden
    if (videoMode === 'hidden') {
      return (
        <button
          onClick={() => setVideoMode('normal')}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-800/30 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/30"
        >
          Показать видео
        </button>
      )
    }

    // Priority 1: Enrichment
    if (videoEnrichment && videoPlaybackUrl) {
      return (
        <PersistentVideoPlayer
          src={videoPlaybackUrl}
          title={lesson.title}
          className="mb-4 aspect-video w-full"
          mode={videoMode}
          onModeChange={setVideoMode}
          onClose={() => setVideoMode('normal')}
        />
      )
    }

    // Priority 2: Legacy Asset
    if (legacyVideoAsset) {
      let videoUrl = legacyVideoAsset.url || ''
      let isYoutube = false

      if (!videoUrl && legacyVideoAsset.file_path) {
        // Use unified storage path — works for both local dev (Next.js rewrite)
        // and server (nginx serves /storage/enrichments/)
        videoUrl = `/storage/enrichments/${legacyVideoAsset.file_path}`
      } else if (!videoUrl && legacyVideoAsset.filename) {
        videoUrl = `/api/assets/filename/${encodeURIComponent(legacyVideoAsset.filename)}`
      } else if (videoUrl) {
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) isYoutube = true
      }

      if (isYoutube) {
        let videoId = ''
        if (videoUrl.includes('youtube.com/watch?v=')) {
          videoId = videoUrl.split('watch?v=')[1].split('&')[0]
        } else if (videoUrl.includes('youtu.be/')) {
          videoId = videoUrl.split('youtu.be/')[1].split('?')[0]
        }
        const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : videoUrl

        return (
          <div className="aspect-video overflow-hidden rounded-xl bg-black">
            <iframe
              src={embedUrl}
              className="h-full w-full"
              allow="autoplay; fullscreen"
              allowFullScreen
              title={lesson.title}
            />
          </div>
        )
      }

      if (videoUrl) {
        return (
          <PersistentVideoPlayer
            src={videoUrl}
            title={lesson.title}
            className="mb-4 aspect-video w-full"
            mode={videoMode}
            onModeChange={setVideoMode}
            onClose={() => setVideoMode('normal')}
          />
        )
      }
    }

    return <div className="text-sm text-gray-500">{t('fallback.video')}</div>
  }

  const renderAudio = () => {
    if (!audioEnrichment) return null
    return (
      <AudioPlayer
        enrichment={audioEnrichment as unknown as EnrichmentRow}
        playbackUrl={audioPlaybackUrl || undefined}
      />
    )
  }

  const renderQuiz = () => {
    if (!quizEnrichment?.content) return null
    return (
      <QuizPlayer
        content={quizEnrichment.content as QuizEnrichmentContent}
        enrichmentId={quizEnrichment.id!}
      />
    )
  }

  const renderPresentation = () => {
    if (!presentationEnrichment?.content) return null
    const content = presentationEnrichment.content as {
      slides?: Array<{ title?: string; content?: string; text?: string; speaker_notes?: string }>
    }
    const slides = Array.isArray(content.slides) ? content.slides : []

    if (slides.length === 0) {
      return (
        <div className="rounded-md border p-4 text-sm text-gray-500">
          {t('fallback.presentationEmpty')}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {slides.map((slide, idx: number) => (
          <div key={idx} className="rounded-lg border bg-white p-4 shadow-sm dark:bg-gray-800">
            <h3 className="mb-2 text-lg font-semibold">{slide.title || `Слайд ${idx + 1}`}</h3>
            <div className="prose dark:prose-invert text-sm">{slide.content || slide.text}</div>
            {slide.speaker_notes && (
              <div className="mt-4 rounded border-l-4 border-purple-500 bg-gray-50 p-3 text-xs italic dark:bg-gray-900">
                {slide.speaker_notes}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderDocument = () => {
    if (!documentEnrichment?.content) return null
    const content = documentEnrichment.content as {
      file_url?: string
      url?: string
      title?: string
      description?: string
    }
    const fileUrl = content.file_url || content.url

    return (
      <div className="flex flex-col items-center space-y-4 rounded-lg border bg-gray-50 p-6 text-center dark:bg-gray-800/50">
        <FileText className="h-12 w-12 text-blue-500" />
        <h3 className="text-lg font-medium">{content.title || t('fallback.documentTitle')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {content.description || t('fallback.documentDescription')}
        </p>
        {fileUrl ? (
          <Button asChild>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {t('fallback.download')}
            </a>
          </Button>
        ) : (
          <p className="text-sm text-gray-500 italic">{t('fallback.documentAvailableInPanel')}</p>
        )}
      </div>
    )
  }

  const tabIcons: Record<MaterialType, React.ReactNode> = {
    video: <Film className="h-4 w-4" />,
    audio: <Headphones className="h-4 w-4" />,
    quiz: <HelpCircle className="h-4 w-4" />,
    presentation: <Presentation className="h-4 w-4" />,
    document: <FileText className="h-4 w-4" />,
  }

  // If only 1 type available, render it directly without tabs
  if (availableTypes.length === 1) {
    const type = availableTypes[0]
    return (
      <div className="mb-8 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/50 via-blue-50/30 to-indigo-50/50 p-6 shadow-sm dark:border-purple-800/30 dark:from-purple-900/20 dark:via-blue-900/10 dark:to-indigo-900/20">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('title')}</h2>
        </div>
        <div className="pt-2" data-testid={`material-content-${type}`}>
          {type === 'video' && renderVideo()}
          {type === 'audio' && renderAudio()}
          {type === 'quiz' && renderQuiz()}
          {type === 'presentation' && renderPresentation()}
          {type === 'document' && renderDocument()}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/50 via-blue-50/30 to-indigo-50/50 p-6 shadow-sm dark:border-purple-800/30 dark:from-purple-900/20 dark:via-blue-900/10 dark:to-indigo-900/20">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('title')}</h2>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as MaterialType)}
        className="w-full"
      >
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-2 overflow-x-auto">
          {availableTypes.map((type) => (
            <TabsTrigger key={type} value={type} className="flex gap-2" data-testid={`tab-${type}`}>
              {tabIcons[type]}
              {t(`tabs.${type}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {availableTypes.includes('video') && (
          <TabsContent value="video" className="mt-0" data-testid="material-content-video">
            {renderVideo()}
          </TabsContent>
        )}

        {availableTypes.includes('audio') && (
          <TabsContent value="audio" className="mt-0" data-testid="material-content-audio">
            {renderAudio()}
          </TabsContent>
        )}

        {availableTypes.includes('quiz') && (
          <TabsContent value="quiz" className="mt-0" data-testid="material-content-quiz">
            {renderQuiz()}
          </TabsContent>
        )}

        {availableTypes.includes('presentation') && (
          <TabsContent
            value="presentation"
            className="mt-0"
            data-testid="material-content-presentation"
          >
            {renderPresentation()}
          </TabsContent>
        )}

        {availableTypes.includes('document') && (
          <TabsContent value="document" className="mt-0" data-testid="material-content-document">
            {renderDocument()}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
