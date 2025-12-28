'use client';

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

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocale } from 'next-intl';
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
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { JsonViewer } from '../shared/JsonViewer';
import { EnrichmentStatusBadge } from './EnrichmentStatusBadge';
import { type EnrichmentStatus } from '@/lib/generation-graph/enrichment-config';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

/**
 * Audio enrichment content structure from shared-types
 */
interface AudioEnrichmentContent {
  type: 'audio';
  voice_id: string;
  script: string;
  duration_seconds: number;
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
}

/**
 * Props for AudioPreview component
 */
export interface AudioPreviewProps {
  /** The enrichment record with content and status */
  enrichment: {
    id: string;
    status: EnrichmentStatus;
    content: AudioEnrichmentContent | null;
    metadata: Record<string, unknown> | null;
    error_message?: string | null;
    asset_url?: string | null; // Signed URL for audio playback
  };

  /** Called when user wants to regenerate */
  onRegenerate?: () => void;

  /** Loading state for regenerate action */
  isRegenerating?: boolean;

  /** Optional className */
  className?: string;
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
};

type Translations = typeof TRANSLATIONS.ru;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if status indicates loading state
 */
function isLoadingStatus(status: EnrichmentStatus): boolean {
  return status === 'generating' || status === 'draft_generating';
}

/**
 * Check if content is AudioEnrichmentContent
 */
function isAudioContent(
  content: AudioEnrichmentContent | null
): content is AudioEnrichmentContent {
  if (!content) return false;
  return (
    'type' in content &&
    content.type === 'audio' &&
    'script' in content &&
    'voice_id' in content
  );
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Custom Audio Player Component
 */
function AudioPlayer({
  audioUrl,
  t,
}: {
  audioUrl: string;
  t: Translations;
}): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Audio element event handlers
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoading(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Playback controls
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  const handleSeek = useCallback((value: number[]) => {
    if (!audioRef.current) return;
    const newTime = value[0];
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    if (!audioRef.current) return;
    const newVolume = value[0];
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;

    if (isMuted) {
      audioRef.current.volume = volume || 0.5;
      setIsMuted(false);
      setVolume(volume || 0.5);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const skipBackward = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, currentTime - 10);
  }, [currentTime]);

  const skipForward = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(duration, currentTime + 10);
  }, [currentTime, duration]);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Progress percentage for visual feedback
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">{t.loading}</span>
        </div>
      )}

      {/* Player UI */}
      {!isLoading && (
        <>
          {/* Waveform visualization placeholder */}
          <div className="relative w-full h-24 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
            {/* Progress overlay */}
            <div
              className="absolute inset-y-0 left-0 bg-blue-500/20 transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            {/* Placeholder waveform bars */}
            <div className="absolute inset-0 flex items-center justify-center gap-1 px-4">
              {Array.from({ length: 60 }).map((_, i) => {
                const height = Math.random() * 60 + 20;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-slate-300 dark:bg-slate-600 rounded-full transition-colors"
                    style={{
                      height: `${height}%`,
                      backgroundColor:
                        i / 60 <= progress / 100
                          ? 'rgb(59, 130, 246)'
                          : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Time display */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
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
              className="w-9 h-9 p-0"
            >
              <SkipBack className="w-5 h-5" />
            </Button>

            {/* Play/Pause */}
            <Button
              variant="default"
              size="lg"
              onClick={togglePlayPause}
              title={isPlaying ? t.pause : t.play}
              className="w-14 h-14 rounded-full p-0"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" fill="currentColor" />
              ) : (
                <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
              )}
            </Button>

            {/* Skip forward */}
            <Button
              variant="ghost"
              size="sm"
              onClick={skipForward}
              title={t.skipForward}
              className="w-9 h-9 p-0"
            >
              <SkipForward className="w-5 h-5" />
            </Button>
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-3 px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              title={isMuted ? t.unmute : t.mute}
              className="w-9 h-9 p-0 flex-shrink-0"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
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
            <span className="text-xs text-muted-foreground font-mono w-10 text-right">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>
        </>
      )}
    </div>
  );
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
  const locale = useLocale() as 'ru' | 'en';
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.ru;

  const [activeTab, setActiveTab] = useState<'player' | 'script' | 'metadata'>('player');

  // Determine mode based on status
  const isLoading = isLoadingStatus(enrichment.status);
  const isError = enrichment.status === 'failed';
  const isCompleted = enrichment.status === 'completed';

  // Get audio content
  const audioContent = useMemo(() => {
    if (isAudioContent(enrichment.content)) {
      return enrichment.content;
    }
    return null;
  }, [enrichment.content]);

  // --------------------------------------------------------------------------
  // Render: Loading State
  // --------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-blue-500" />
              {t.audioTitle}
            </h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Loading content */}
        <div className="flex-1 p-6 space-y-6">
          <div className="flex items-center justify-center space-x-2 text-muted-foreground mb-6">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t.generating}</span>
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
    );
  }

  // --------------------------------------------------------------------------
  // Render: Error State
  // --------------------------------------------------------------------------
  if (isError) {
    return (
      <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-blue-500" />
              {t.audioTitle}
            </h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Error content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <div>
            <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
              {t.errorTitle}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {enrichment.error_message || t.errorTitle}
            </p>
            {enrichment.error_message && (
              <details className="text-left max-w-md mx-auto">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {t.errorDetails}
                </summary>
                <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-auto max-h-40">
                  {enrichment.error_message}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* Action bar */}
        {onRegenerate && (
          <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.regenerating}
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {t.retry}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Preview Mode (completed)
  // --------------------------------------------------------------------------
  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
      {/* Header with tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-blue-500" />
            {t.audioTitle}
          </h3>
          <EnrichmentStatusBadge status={enrichment.status} size="sm" />
        </div>

        {/* Audio metadata chips */}
        {audioContent && (
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              <span className="text-muted-foreground">{t.duration}:</span>
              <span className="font-medium font-mono">
                {formatTime(audioContent.duration_seconds)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              <span className="text-muted-foreground">{t.voiceId}:</span>
              <span className="font-medium">{audioContent.voice_id}</span>
            </div>
            {audioContent.format && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
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
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                  <AlertCircle className="w-10 h-10 text-amber-500" />
                  <p className="text-sm text-muted-foreground">{t.noAudioUrl}</p>
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
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                    <FileText className="w-4 h-4" />
                    {t.scriptContent}
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
                    {audioContent.script}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">{t.noContent}</p>
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
                <p className="text-sm text-muted-foreground text-center py-8">{t.noMetadata}</p>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Action bar (only regenerate for completed) */}
      {isCompleted && onRegenerate && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.regenerating}
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {t.regenerate}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AudioPreview;
