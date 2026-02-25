'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent } from '@/components/ui/card'
import type { Database } from '@/types/database.generated'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface AudioPlayerProps {
  enrichment: EnrichmentRow
  playbackUrl?: string
  onPlayingChange?: (isPlaying: boolean) => void
  togglePlayRef?: React.MutableRefObject<(() => void) | null>
  compact?: boolean
}

export function AudioPlayer({
  enrichment,
  playbackUrl,
  onPlayingChange,
  togglePlayRef,
  compact,
}: AudioPlayerProps) {
  const t = useTranslations('enrichments')
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  // H4: Ref-based isPlaying to avoid stale closures in togglePlay
  const isPlayingRef = useRef(isPlaying)
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  // H1: Ref-based onPlayingChange so cleanup effects always call the latest version
  const onPlayingChangeRef = useRef(onPlayingChange)
  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange
  }, [onPlayingChange])

  const content = enrichment.content as {
    type: 'audio'
    script?: string
    duration_seconds: number
    voice_id: string
    format?: string
  } | null

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => {
      const audioDuration = audio.duration
      if (audioDuration && audioDuration !== Infinity && !isNaN(audioDuration)) {
        setDuration(audioDuration)
      } else if (content?.duration_seconds) {
        setDuration(content.duration_seconds)
      } else {
        setDuration(0)
      }
    }
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
      onPlayingChangeRef.current?.(false)
    }
    const handleLoadStart = () => setIsLoading(true)
    const handleCanPlay = () => setIsLoading(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('loadedmetadata', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('loadeddata', handleCanPlay)

    if (audio.readyState >= 1) {
      handleDurationChange()
    }
    if (audio.readyState >= 3) {
      handleCanPlay()
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('loadedmetadata', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('loadeddata', handleCanPlay)

      audio.pause()
      audio.currentTime = 0
      audio.src = ''
      // H1: Notify parent that audio stopped during cleanup
      onPlayingChangeRef.current?.(false)
    }
  }, [content?.duration_seconds, playbackUrl])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !playbackUrl) {
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      setIsMuted(false)
      setVolume(0.8)
      setPlaybackRate(1)
      return
    }

    setIsPlaying(false)
    setCurrentTime(0)
    audio.src = playbackUrl
    audio.load()

    return () => {
      audio.pause()
      audio.currentTime = 0
      audio.src = ''
      // H1: Notify parent that audio stopped during cleanup
      onPlayingChangeRef.current?.(false)
    }
  }, [playbackUrl])

  // H4: Stable togglePlay — uses isPlayingRef instead of isPlaying in closure
  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || audio.readyState < 2) return

    const newState = !isPlayingRef.current
    if (newState) {
      audio.play().catch((e) => console.error('Error playing audio:', e))
    } else {
      audio.pause()
    }
    setIsPlaying(newState)
    onPlayingChangeRef.current?.(newState)
  }, [])

  // Expose togglePlay to parent via ref
  useEffect(() => {
    if (togglePlayRef) {
      togglePlayRef.current = togglePlay
    }
    return () => {
      if (togglePlayRef) {
        togglePlayRef.current = null
      }
    }
  }, [togglePlayRef, togglePlay])

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const seekTime = value[0]
    audio.currentTime = seekTime
    setCurrentTime(seekTime)
  }

  const handleVolumeChange = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return
    const newVolume = value[0] / 100
    audio.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    const newMutedState = !isMuted
    audio.muted = newMutedState
    setIsMuted(newMutedState)
    if (!newMutedState && volume === 0) {
      const restoredVolume = 0.5
      audio.volume = restoredVolume
      setVolume(restoredVolume)
    } else if (newMutedState) {
      audio.volume = 0
    }
  }

  const changePlaybackRate = () => {
    const audio = audioRef.current
    if (!audio) return
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]
    const currentIndex = rates.indexOf(playbackRate)
    const nextRate = rates[(currentIndex + 1) % rates.length]
    audio.playbackRate = nextRate
    setPlaybackRate(nextRate)
  }

  const skip = (seconds: number) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds))
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!playbackUrl) {
    if (compact) {
      return (
        <div className="flex items-center justify-center px-3 py-2">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-white/80" />
          <span className="text-xs text-white/80">{t('viewer.loadingAudio')}</span>
        </div>
      )
    }
    return (
      <Card className="border-purple-200 bg-purple-50 dark:border-purple-800/30 dark:bg-purple-900/20">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="mr-2 h-6 w-6 animate-spin text-purple-500" />
          <span className="text-gray-600 dark:text-gray-400">{t('viewer.loadingAudio')}</span>
        </CardContent>
      </Card>
    )
  }

  // Compact mode: slim controls overlay for image area
  if (compact) {
    return (
      <div className="space-y-2 px-3 pt-1 pb-3" onClick={(e) => e.stopPropagation()}>
        <audio ref={audioRef} preload="metadata" />

        {/* Progress bar + time */}
        <div className="space-y-1">
          <Slider
            value={[currentTime]}
            onValueChange={handleSeek}
            max={duration > 0 ? duration : 100}
            step={0.1}
            className="w-full [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            aria-label={t('viewer.audioProgress')}
            aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
          />
          <div className="flex justify-between text-[10px] text-white/70">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => skip(-10)}
              aria-label={t('viewer.skipBack')}
              className="h-7 w-7 p-0 text-white/80 hover:bg-white/20 hover:text-white"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => skip(10)}
              aria-label={t('viewer.skipForward')}
              className="h-7 w-7 p-0 text-white/80 hover:bg-white/20 hover:text-white"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleMute}
              aria-label={isMuted ? t('viewer.unmute') : t('viewer.mute')}
              className="h-7 w-7 p-0 text-white/80 hover:bg-white/20 hover:text-white"
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={changePlaybackRate}
            aria-label={t('viewer.playbackSpeed', { rate: playbackRate })}
            className="h-7 px-2 text-xs text-white/80 hover:bg-white/20 hover:text-white"
          >
            {playbackRate}x
          </Button>
        </div>
      </div>
    )
  }

  // Full mode: standalone Card
  return (
    <Card className="overflow-hidden border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 dark:border-purple-800/30 dark:from-purple-900/20 dark:to-indigo-900/20">
      <CardContent className="p-6">
        <audio ref={audioRef} preload="metadata" />

        <div className="mb-4 flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={togglePlay}
            disabled={isLoading || !playbackUrl}
            aria-label={isPlaying ? t('viewer.pause') : t('viewer.play')}
            aria-pressed={isPlaying}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg transition-shadow hover:shadow-xl disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="ml-1 h-6 w-6" />
            )}
          </motion.button>

          <div className="flex-1 space-y-1">
            <Slider
              value={[currentTime]}
              onValueChange={handleSeek}
              max={duration > 0 ? duration : 100}
              step={0.1}
              className="w-full"
              aria-label={t('viewer.audioProgress')}
              aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => skip(-10)}
              aria-label={t('viewer.skipBack')}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => skip(10)}
              aria-label={t('viewer.skipForward')}
            >
              <SkipForward className="h-4 w-4" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={toggleMute}
              aria-label={isMuted ? t('viewer.unmute') : t('viewer.mute')}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume * 100]}
              onValueChange={handleVolumeChange}
              max={100}
              step={1}
              className="w-20"
              aria-label={t('viewer.volume')}
              aria-valuetext={`${Math.round(volume * 100)}%`}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={changePlaybackRate}
              aria-label={t('viewer.playbackSpeed', { rate: playbackRate })}
            >
              {playbackRate}x
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
