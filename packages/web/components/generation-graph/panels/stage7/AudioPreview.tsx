'use client'

/**
 * AudioPreview Component
 *
 * Read-only preview component for instructors to view generated audio narrations
 * in the admin panel (Stage 7 enrichment inspector).
 *
 * Status handling:
 * - generating → Loading skeleton
 * - completed → Show audio player
 * - failed → Error state with retry button
 *
 * @module components/generation-graph/panels/stage7/AudioPreview
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useLocale } from 'next-intl'
import {
  Volume2,
  Play,
  Pause,
  RotateCcw,
  AlertCircle,
  Loader2,
  VolumeX,
  Volume1,
  SkipBack,
  SkipForward,
  FileText,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { JsonViewer } from '../shared/JsonViewer'
import { EnrichmentStatusBadge } from './EnrichmentStatusBadge'
import { useRotatingStatusMessage } from '@/lib/hooks/useRotatingStatusMessage'
import { type EnrichmentStatus } from '@/lib/generation-graph/enrichment-config'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

/**
 * Audio enrichment content structure from shared-types
 */
interface AudioEnrichmentContent {
  type: 'audio'
  voice_id: string
  script: string
  duration_seconds: number
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav'
}

/**
 * Props for AudioPreview component
 */
export interface AudioPreviewProps {
  /** The enrichment record with content and status */
  enrichment: {
    id: string
    status: EnrichmentStatus
    content: AudioEnrichmentContent | null
    metadata: Record<string, unknown> | null
    error_message?: string | null
    asset_url?: string | null // Signed URL for audio playback
  }

  /** Called when user wants to regenerate */
  onRegenerate?: () => void

  /** Loading state for regenerate action */
  isRegenerating?: boolean

  /** Optional className */
  className?: string
}

// ============================================================================
// Translations
// ============================================================================

const TRANSLATIONS = {
  ru: {
    // Header
    audioTitle: 'Аудио',
    duration: 'Длительность',
    voiceId: 'Голос',
    format: 'Формат',

    // Tabs
    tabPlayer: 'Плеер',
    tabScript: 'Скрипт',
    tabMetadata: 'Метаданные',

    // Player controls
    play: 'Воспроизвести',
    pause: 'Пауза',
    skipBack: 'Назад 10 сек',
    skipForward: 'Вперед 10 сек',
    volume: 'Громкость',
    mute: 'Выключить звук',
    unmute: 'Включить звук',
    loading: 'Загрузка аудио...',

    // Actions
    regenerate: 'Переделать',
    regenerating: 'Переделка...',
    retry: 'Повторить',

    // States
    generating: 'Генерация аудио...',
    errorTitle: 'Ошибка генерации',
    errorDetails: 'Технические детали',
    noContent: 'Контент недоступен',
    noMetadata: 'Метаданные недоступны',
    noAudioUrl: 'URL аудио недоступен',
    scriptContent: 'Текст для озвучки',
  },
  en: {
    // Header
    audioTitle: 'Audio',
    duration: 'Duration',
    voiceId: 'Voice',
    format: 'Format',

    // Tabs
    tabPlayer: 'Player',
    tabScript: 'Script',
    tabMetadata: 'Metadata',

    // Player controls
    play: 'Play',
    pause: 'Pause',
    skipBack: 'Back 10s',
    skipForward: 'Forward 10s',
    volume: 'Volume',
    mute: 'Mute',
    unmute: 'Unmute',
    loading: 'Loading audio...',

    // Actions
    regenerate: 'Regenerate',
    regenerating: 'Regenerating...',
    retry: 'Retry',

    // States
    generating: 'Generating audio...',
    errorTitle: 'Generation Error',
    errorDetails: 'Technical Details',
    noContent: 'Content unavailable',
    noMetadata: 'Metadata unavailable',
    noAudioUrl: 'Audio URL unavailable',
    scriptContent: 'Narration Script',
  },
}

type Translations = typeof TRANSLATIONS.ru

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if status indicates loading state
 */
function isLoadingStatus(status: EnrichmentStatus): boolean {
  return status === 'generating' || status === 'draft_generating'
}

/**
 * Check if content is AudioEnrichmentContent
 */
function isAudioContent(content: AudioEnrichmentContent | null): content is AudioEnrichmentContent {
  if (!content) return false
  return (
    'type' in content && content.type === 'audio' && 'script' in content && 'voice_id' in content
  )
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Custom Audio Player Component
 */
function AudioPlayer({ audioUrl, t }: { audioUrl: string; t: Translations }): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Audio element event handlers
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
      setIsLoading(false)
    }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const handlePlay = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  // Playback controls
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
  }, [isPlaying])

  const handleSeek = useCallback((value: number[]) => {
    if (!audioRef.current) return
    const newTime = value[0]
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }, [])

  const handleVolumeChange = useCallback((value: number[]) => {
    if (!audioRef.current) return
    const newVolume = value[0]
    audioRef.current.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }, [])

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return

    if (isMuted) {
      audioRef.current.volume = volume || 0.5
      setIsMuted(false)
      setVolume(volume || 0.5)
    } else {
      audioRef.current.volume = 0
      setIsMuted(true)
    }
  }, [isMuted, volume])

  const skipBackward = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, currentTime - 10)
  }, [currentTime])

  const skipForward = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.min(duration, currentTime + 10)
  }, [currentTime, duration])

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  // Progress percentage for visual feedback
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onPause={handlePause}
        preload="metadata"
      />

      {/* Loading state */}
      {isLoading && (
        <div className="text-muted-foreground flex items-center justify-center py-8">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span className="text-sm">{t.loading}</span>
        </div>
      )}

      {/* Player UI */}
      {!isLoading && (
        <>
          {/* Waveform visualization placeholder */}
          <div className="relative h-24 w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            {/* Progress overlay */}
            <div
              className="absolute inset-y-0 left-0 bg-blue-500/20 transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            {/* Placeholder waveform bars */}
            <div className="absolute inset-0 flex items-center justify-center gap-1 px-4">
              {Array.from({ length: 60 }).map((_, i) => {
                const height = Math.random() * 60 + 20
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-full bg-slate-300 transition-colors dark:bg-slate-600"
                    style={{
                      height: `${height}%`,
                      backgroundColor: i / 60 <= progress / 100 ? 'rgb(59, 130, 246)' : undefined,
                    }}
                  />
                )
              })}
            </div>
          </div>

          {/* Time display */}
          <div className="text-muted-foreground flex items-center justify-between text-sm">
            <span className="font-mono">{formatTime(currentTime)}</span>
            <span className="font-mono">{formatTime(duration)}</span>
          </div>

          {/* Seek slider */}
          <div className="px-1">
            <Slider
              value={[currentTime]}
              min={0}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-center gap-4">
            {/* Skip back */}
            <Button
              variant="ghost"
              size="sm"
              onClick={skipBackward}
              title={t.skipBack}
              className="h-9 w-9 p-0"
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            {/* Play/Pause */}
            <Button
              variant="default"
              size="lg"
              onClick={togglePlayPause}
              title={isPlaying ? t.pause : t.play}
              className="h-14 w-14 rounded-full p-0"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" fill="currentColor" />
              ) : (
                <Play className="ml-0.5 h-6 w-6" fill="currentColor" />
              )}
            </Button>

            {/* Skip forward */}
            <Button
              variant="ghost"
              size="sm"
              onClick={skipForward}
              title={t.skipForward}
              className="h-9 w-9 p-0"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-3 px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              title={isMuted ? t.unmute : t.mute}
              className="h-9 w-9 flex-shrink-0 p-0"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : volume < 0.5 ? (
                <Volume1 className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <div className="flex-1">
              <Slider
                value={[isMuted ? 0 : volume]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="cursor-pointer"
              />
            </div>
            <span className="text-muted-foreground w-10 text-right font-mono text-xs">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * AudioPreview
 *
 * Read-only preview component for instructors to view generated audio narrations
 * in the Stage 7 enrichment inspector.
 *
 * @param props - Component props
 * @returns React element
 */
export function AudioPreview({
  enrichment,
  onRegenerate,
  isRegenerating = false,
  className,
}: AudioPreviewProps): React.JSX.Element {
  const locale = useLocale()
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.ru

  const [activeTab, setActiveTab] = useState<'player' | 'script' | 'metadata'>('player')

  // Rotating status message for loading state
  const { message: statusMessage } = useRotatingStatusMessage({
    status: 'audio_generating',
    interval: 5000,
    enabled: isLoadingStatus(enrichment.status),
  })

  // Determine mode based on status
  const isLoading = isLoadingStatus(enrichment.status)
  const isError = enrichment.status === 'failed'
  const isCompleted = enrichment.status === 'completed'

  // Get audio content
  const audioContent = useMemo(() => {
    if (isAudioContent(enrichment.content)) {
      return enrichment.content
    }
    return null
  }, [enrichment.content])

  // --------------------------------------------------------------------------
  // Render: Loading State
  // --------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-medium">
              <Volume2 className="h-4 w-4 text-blue-500" />
              {t.audioTitle}
            </h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Loading content */}
        <div className="flex-1 space-y-6 p-6">
          <div className="text-muted-foreground mb-6 flex items-center justify-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm transition-opacity duration-300">{statusMessage}</span>
          </div>

          {/* Skeleton loaders */}
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full" />
            <div className="flex justify-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Render: Error State
  // --------------------------------------------------------------------------
  if (isError) {
    return (
      <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-medium">
              <Volume2 className="h-4 w-4 text-blue-500" />
              {t.audioTitle}
            </h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Error content */}
        <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <div>
            <h3 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">
              {t.errorTitle}
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {enrichment.error_message || t.errorTitle}
            </p>
            {enrichment.error_message && (
              <details className="mx-auto max-w-md text-left">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                  {t.errorDetails}
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">
                  {enrichment.error_message}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* Action bar */}
        {onRegenerate && (
          <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={onRegenerate} disabled={isRegenerating}>
                {isRegenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.regenerating}
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t.retry}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Render: Preview Mode (completed)
  // --------------------------------------------------------------------------
  return (
    <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
      {/* Header with tabs */}
      <div className="border-b border-slate-200 px-4 pt-4 pb-0 dark:border-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-medium">
            <Volume2 className="h-4 w-4 text-blue-500" />
            {t.audioTitle}
          </h3>
          <EnrichmentStatusBadge status={enrichment.status} size="sm" />
        </div>

        {/* Audio metadata chips */}
        {audioContent && (
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
              <span className="text-muted-foreground">{t.duration}:</span>
              <span className="font-mono font-medium">
                {formatTime(audioContent.duration_seconds)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
              <span className="text-muted-foreground">{t.voiceId}:</span>
              <span className="font-medium">{audioContent.voice_id}</span>
            </div>
            {audioContent.format && (
              <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                <span className="text-muted-foreground">{t.format}:</span>
                <span className="font-medium uppercase">{audioContent.format}</span>
              </div>
            )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="player">{t.tabPlayer}</TabsTrigger>
            <TabsTrigger value="script">{t.tabScript}</TabsTrigger>
            <TabsTrigger value="metadata">{t.tabMetadata}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'player' && (
          <ScrollArea className="h-full">
            <div className="p-6">
              {enrichment.asset_url ? (
                <AudioPlayer audioUrl={enrichment.asset_url} t={t} />
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2 py-12 text-center">
                  <AlertCircle className="h-10 w-10 text-amber-500" />
                  <p className="text-muted-foreground text-sm">{t.noAudioUrl}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {activeTab === 'script' && (
          <ScrollArea className="h-full">
            <div className="p-6">
              {audioContent ? (
                <div className="space-y-3">
                  <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4" />
                    {t.scriptContent}
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-wrap dark:bg-slate-900">
                    {audioContent.script}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">{t.noContent}</p>
              )}
            </div>
          </ScrollArea>
        )}

        {activeTab === 'metadata' && (
          <ScrollArea className="h-full">
            <div className="p-6">
              {enrichment.metadata ? (
                <JsonViewer
                  data={enrichment.metadata}
                  title={t.tabMetadata}
                  defaultExpanded={false}
                />
              ) : audioContent ? (
                <JsonViewer
                  data={{
                    voice_id: audioContent.voice_id,
                    duration_seconds: audioContent.duration_seconds,
                    format: audioContent.format,
                  }}
                  title={t.tabMetadata}
                  defaultExpanded={false}
                />
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">{t.noMetadata}</p>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Action bar (only regenerate for completed) */}
      {isCompleted && onRegenerate && (
        <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={isRegenerating}>
              {isRegenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.regenerating}
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t.regenerate}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AudioPreview
