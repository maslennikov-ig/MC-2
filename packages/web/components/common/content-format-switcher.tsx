'use client'

// IMPORTANT: This file contains direct @vidstack/react imports (MediaPlayer, MediaProvider).
// It MUST only be loaded via next/dynamic with { ssr: false } to avoid the
// media-captions Turbopack chunk error. Do not statically import this file.
// See: packages/web/components/course/viewer/components/LessonView.tsx

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MediaPlayer,
  MediaProvider,
  type MediaPlayerInstance,
  type PlayerSrc,
} from '@vidstack/react'

import {
  FileText,
  Play,
  Headphones,
  Presentation,
  Download,
  Volume2,
  VolumeX,
  Pause,
  SkipForward,
  SkipBack,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import LessonContent from '@/components/common/lesson-content'
import type { Lesson, Section, Asset } from '@/types/database'
import type { Database } from '@/types/database.generated'
import { formatVideoSrc } from './video-utils'

type LessonContentRow = Database['public']['Tables']['lesson_contents']['Row']

interface ContentFormat {
  type: 'text' | 'video' | 'audio' | 'presentation'
  label: string
  icon: React.ReactNode
  available: boolean
  url?: string
}

interface ContentFormatSwitcherProps {
  lesson: Lesson
  section: Section | undefined
  assets?: Asset[]
  lessonContent?: LessonContentRow
  enrichments?: Array<{ enrichment_type: string; content: unknown; status: string }>
  availableFormats?: {
    video?: string
    audio?: string
    presentation?: string
  }
  onFormatChange?: (format: string) => void
  courseLanguage?: string
  nextLesson?: {
    title: string
    objectives?: string[] | null
  }
  onNextLesson?: () => void
}

export default function ContentFormatSwitcher({
  lesson,
  section,
  assets,
  lessonContent,
  enrichments,
  availableFormats = {},
  onFormatChange,
  courseLanguage,
  nextLesson,
  onNextLesson,
}: ContentFormatSwitcherProps) {
  const [currentFormat, setCurrentFormat] = useState<'text' | 'video' | 'audio' | 'presentation'>(
    'text'
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [playbackRate, setPlaybackRate] = useState(1)

  const videoPlayerRef = useRef<MediaPlayerInstance>(null)
  const audioPlayerRef = useRef<MediaPlayerInstance>(null)

  const mockFormats = {
    video: availableFormats.video || null,
    audio: availableFormats.audio || null,
    presentation: availableFormats.presentation || null,
  }

  const formats: ContentFormat[] = useMemo(
    () => [
      {
        type: 'text',
        label: 'Текст',
        icon: <FileText className="h-4 w-4" />,
        available: true,
      },
      {
        type: 'video',
        label: 'Видео',
        icon: <Play className="h-4 w-4" />,
        available: !!mockFormats.video,
        url: mockFormats.video || undefined,
      },
      {
        type: 'audio',
        label: 'Аудио',
        icon: <Headphones className="h-4 w-4" />,
        available: !!mockFormats.audio,
        url: mockFormats.audio || undefined,
      },
      {
        type: 'presentation',
        label: 'Презентация',
        icon: <Presentation className="h-4 w-4" />,
        available: !!mockFormats.presentation,
        url: mockFormats.presentation || undefined,
      },
    ],
    [mockFormats.video, mockFormats.audio, mockFormats.presentation]
  )

  const availableFormatsCount = formats.filter((f) => f.available).length

  useEffect(() => {
    localStorage.setItem(`lesson-${lesson.id}-format`, currentFormat)
    onFormatChange?.(currentFormat)
  }, [currentFormat, lesson.id, onFormatChange])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case '1':
          if (formats[0].available) setCurrentFormat('text')
          break
        case '2':
          if (formats[1].available) setCurrentFormat('video')
          break
        case '3':
          if (formats[2].available) setCurrentFormat('audio')
          break
        case '4':
          if (formats[3].available) setCurrentFormat('presentation')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [formats])

  useEffect(() => {
    const savedFormat = localStorage.getItem(`lesson-${lesson.id}-format`) as
      | 'text'
      | 'video'
      | 'audio'
      | 'presentation'
      | null
    if (savedFormat && formats.find((f) => f.type === savedFormat && f.available)) {
      setCurrentFormat(savedFormat)
    }
  }, [lesson.id, formats])

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSeek = (value: number[]) => {
    const newProgress = value[0]
    setProgress(newProgress)
    const activePlayer = currentFormat === 'video' ? videoPlayerRef.current : audioPlayerRef.current
    if (activePlayer && duration > 0) {
      activePlayer.currentTime = (newProgress / 100) * duration
    }
  }

  const toggleFullscreen = async () => {
    const activePlayer = currentFormat === 'video' ? videoPlayerRef.current : audioPlayerRef.current
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setIsFullscreen(false)
      } else if (activePlayer) {
        await activePlayer.enterFullscreen()
        setIsFullscreen(true)
      }
    } catch {
      // Fallback: silent catch for unsupported environments
    }
  }

  const handlePlayToggle = () => {
    const activePlayer = currentFormat === 'video' ? videoPlayerRef.current : audioPlayerRef.current
    if (activePlayer) {
      activePlayer.paused = isPlaying
    }
  }

  if (availableFormatsCount <= 1) {
    return (
      <LessonContent
        lesson={lesson}
        section={section}
        assets={assets}
        lessonContent={lessonContent}
        enrichments={enrichments}
        courseLanguage={courseLanguage}
        nextLesson={nextLesson}
        onNextLesson={onNextLesson}
      />
    )
  }

  return (
    <div className="w-full">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Формат:</span>
              <div className="flex items-center gap-2">
                {formats.map((format) => (
                  <Button
                    key={format.type}
                    onClick={() => format.available && setCurrentFormat(format.type)}
                    disabled={!format.available}
                    variant={currentFormat === format.type ? 'default' : 'ghost'}
                    size="sm"
                    className={cn(
                      'gap-2 transition-all',
                      currentFormat === format.type
                        ? 'border border-purple-600 bg-purple-600 text-white hover:bg-purple-700 dark:border-purple-500/50 dark:bg-purple-500/30 dark:text-purple-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                      !format.available && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    {format.icon}
                    <span className="hidden sm:inline">{format.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"
              >
                {availableFormatsCount} формата
              </Badge>
              {currentFormat !== 'text' && (
                <Badge
                  variant="secondary"
                  className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                >
                  {lesson.duration_minutes} мин
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Быстрый доступ:{' '}
            <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">1</kbd> Текст
            {formats[1].available && (
              <>
                {' '}
                • <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">2</kbd> Видео
              </>
            )}
            {formats[2].available && (
              <>
                {' '}
                • <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">3</kbd> Аудио
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentFormat}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="w-full"
        >
          {currentFormat === 'text' && (
            <LessonContent
              lesson={lesson}
              section={section}
              assets={assets}
              lessonContent={lessonContent}
              enrichments={enrichments}
              courseLanguage={courseLanguage}
              nextLesson={nextLesson}
              onNextLesson={onNextLesson}
            />
          )}

          {currentFormat === 'video' && mockFormats.video && (
            <div className="relative bg-black">
              <div className="mx-auto max-w-7xl px-6 py-8">
                <div className="aspect-video overflow-hidden rounded-lg bg-gray-900 shadow-2xl">
                  <div className="relative h-full w-full">
                    {mediaError ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                        <Play className="h-12 w-12 text-gray-500" />
                        <p className="text-sm text-gray-400">Видео недоступно</p>
                        <button
                          onClick={() => setMediaError(null)}
                          className="text-xs text-purple-400 transition-colors hover:text-purple-300"
                        >
                          Попробовать снова
                        </button>
                      </div>
                    ) : (
                      <MediaPlayer
                        ref={videoPlayerRef}
                        src={formatVideoSrc(mockFormats.video) as PlayerSrc}
                        paused={!isPlaying}
                        muted={isMuted}
                        volume={volume}
                        playbackRate={playbackRate}
                        controls={false}
                        onTimeUpdate={(detail: { currentTime: number }) => {
                          if (duration > 0) setProgress((detail.currentTime / duration) * 100)
                        }}
                        onDurationChange={(d: number) => setDuration(d)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onError={(detail: { message: string }) => {
                          console.warn('Video loading error:', detail.message)
                          setMediaError(detail.message)
                        }}
                        className="absolute inset-0 h-full w-full"
                      >
                        <MediaProvider />
                      </MediaPlayer>
                    )}
                  </div>

                  <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <div className="space-y-2">
                      <Slider
                        value={[progress]}
                        onValueChange={handleSeek}
                        max={100}
                        step={0.1}
                        className="w-full cursor-pointer"
                      />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={handlePlayToggle}
                            size="sm"
                            variant="ghost"
                            className="text-white hover:bg-white/20"
                          >
                            {isPlaying ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>

                          <Button
                            onClick={() => {
                              setIsMuted(!isMuted)
                              if (videoPlayerRef.current) videoPlayerRef.current.muted = !isMuted
                            }}
                            size="sm"
                            variant="ghost"
                            className="text-white hover:bg-white/20"
                          >
                            {isMuted ? (
                              <VolumeX className="h-4 w-4" />
                            ) : (
                              <Volume2 className="h-4 w-4" />
                            )}
                          </Button>

                          <div className="flex items-center gap-2">
                            <Slider
                              value={[volume * 100]}
                              onValueChange={(v) => {
                                const newVolume = v[0] / 100
                                setVolume(newVolume)
                                if (videoPlayerRef.current)
                                  videoPlayerRef.current.volume = newVolume
                              }}
                              max={100}
                              step={1}
                              className="w-24 cursor-pointer"
                            />
                          </div>

                          <span className="ml-4 text-sm text-white">
                            {formatTime((progress * duration) / 100)} / {formatTime(duration)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={playbackRate}
                            onChange={(e) => {
                              const newRate = parseFloat(e.target.value)
                              setPlaybackRate(newRate)
                              if (videoPlayerRef.current)
                                videoPlayerRef.current.playbackRate = newRate
                            }}
                            className="rounded border border-white/30 bg-transparent px-2 py-1 text-sm text-white"
                          >
                            <option value="0.5">0.5x</option>
                            <option value="0.75">0.75x</option>
                            <option value="1">1x</option>
                            <option value="1.25">1.25x</option>
                            <option value="1.5">1.5x</option>
                            <option value="2">2x</option>
                          </select>

                          <Button
                            onClick={() => void toggleFullscreen()}
                            size="sm"
                            variant="ghost"
                            className="text-white hover:bg-white/20"
                          >
                            {isFullscreen ? (
                              <Minimize2 className="h-4 w-4" />
                            ) : (
                              <Maximize2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-lg bg-gray-50 p-6 dark:bg-gray-900">
                  <h3 className="mb-2 text-lg font-semibold">Видео урок: {lesson.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Продолжительность: {lesson.duration_minutes} минут
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentFormat === 'audio' && mockFormats.audio && (
            <div className="mx-auto max-w-4xl px-6 py-8">
              <div className="rounded-lg bg-gradient-to-br from-purple-100 to-blue-100 p-8 shadow-lg dark:from-gray-800 dark:to-gray-900">
                <div className="mb-6 flex items-center justify-center">
                  <div className="relative">
                    <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500 shadow-xl">
                      <Headphones className="h-16 w-16 text-white" />
                    </div>
                    {isPlaying && (
                      <motion.div
                        className="absolute inset-0 rounded-full border-4 border-purple-400"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </div>
                </div>

                <h3 className="mb-4 text-center text-xl font-semibold">{lesson.title}</h3>

                <MediaPlayer
                  ref={audioPlayerRef}
                  src={mockFormats.audio}
                  paused={!isPlaying}
                  muted={isMuted}
                  volume={volume}
                  playbackRate={playbackRate}
                  onTimeUpdate={(detail: { currentTime: number }) => {
                    if (duration > 0) setProgress((detail.currentTime / duration) * 100)
                  }}
                  onDurationChange={(d: number) => setDuration(d)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="hidden"
                >
                  <MediaProvider />
                </MediaPlayer>

                <div className="space-y-4">
                  <Slider
                    value={[progress]}
                    onValueChange={handleSeek}
                    max={100}
                    step={0.1}
                    className="w-full cursor-pointer"
                  />

                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{formatTime((progress * duration) / 100)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <Button
                      onClick={() => handleSeek([Math.max(0, progress - 10)])}
                      size="sm"
                      variant="ghost"
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>

                    <Button
                      onClick={handlePlayToggle}
                      size="lg"
                      className="h-16 w-16 rounded-full bg-purple-600 text-white hover:bg-purple-700"
                    >
                      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                    </Button>

                    <Button
                      onClick={() => handleSeek([Math.min(100, progress + 10)])}
                      size="sm"
                      variant="ghost"
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <Button
                      onClick={() => {
                        setIsMuted(!isMuted)
                        if (audioPlayerRef.current) audioPlayerRef.current.muted = !isMuted
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>

                    <Slider
                      value={[volume * 100]}
                      onValueChange={(v) => {
                        const newVolume = v[0] / 100
                        setVolume(newVolume)
                        if (audioPlayerRef.current) audioPlayerRef.current.volume = newVolume
                      }}
                      max={100}
                      step={1}
                      className="w-32 cursor-pointer"
                    />

                    <select
                      value={playbackRate}
                      onChange={(e) => {
                        const newRate = parseFloat(e.target.value)
                        setPlaybackRate(newRate)
                        if (audioPlayerRef.current) audioPlayerRef.current.playbackRate = newRate
                      }}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                    >
                      <option value="0.5">0.5x</option>
                      <option value="0.75">0.75x</option>
                      <option value="1">1x</option>
                      <option value="1.25">1.25x</option>
                      <option value="1.5">1.5x</option>
                      <option value="2">2x</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <Button
                    onClick={() => setCurrentFormat('text')}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Читать текстовую версию
                  </Button>
                </div>
              </div>
            </div>
          )}

          {currentFormat === 'presentation' && mockFormats.presentation && (
            <div className="mx-auto max-w-6xl px-6 py-8">
              <div className="rounded-lg bg-gray-100 p-8 text-center dark:bg-gray-800">
                <Presentation className="mx-auto mb-4 h-16 w-16 text-gray-400" />
                <h3 className="mb-2 text-xl font-semibold">Презентация к уроку</h3>
                <p className="mb-6 text-gray-600 dark:text-gray-400">{lesson.title}</p>
                <Button className="gap-2">
                  <Download className="h-4 w-4" />
                  Скачать презентацию
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
