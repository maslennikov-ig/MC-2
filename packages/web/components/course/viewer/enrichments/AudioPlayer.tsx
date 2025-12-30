"use client"

import React, { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { Database } from "@/types/database.generated"

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface AudioPlayerProps {
  enrichment: EnrichmentRow
  playbackUrl?: string
}

export function AudioPlayer({ enrichment, playbackUrl }: AudioPlayerProps) {
  const t = useTranslations('enrichments')
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showScript, setShowScript] = useState(false)

  const content = enrichment.content as {
    type: 'audio'
    script: string
    duration_seconds: number
    voice_id: string
    format?: string
  } | null

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration || content?.duration_seconds || 0)
    const handleEnded = () => setIsPlaying(false)
    const handleLoadStart = () => setIsLoading(true)
    const handleCanPlay = () => setIsLoading(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      // Remove event listeners
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)

      // CRITICAL: Stop and cleanup audio element
      audio.pause()
      audio.currentTime = 0
      audio.src = '' // Release media resources
    }
  }, [content?.duration_seconds])

  // Handle playbackUrl changes - reset state and cleanup
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !playbackUrl) return

    // Reset state when URL changes
    setIsPlaying(false)
    setCurrentTime(0)

    return () => {
      audio.pause()
    }
  }, [playbackUrl])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = (value[0] / 100) * duration
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
    audio.muted = !isMuted
    setIsMuted(!isMuted)
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
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds))
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (!playbackUrl) {
    return (
      <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/30">
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-purple-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-400">{t('viewer.loadingAudio')}</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border-purple-200 dark:border-purple-800/30">
      <CardContent className="p-6">
        <audio ref={audioRef} src={playbackUrl} preload="metadata" />

        {/* Main Player Controls */}
        <div className="flex items-center gap-4 mb-4">
          {/* Play/Pause Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? t('viewer.pause') : t('viewer.play')}
            aria-pressed={isPlaying}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-1" />
            )}
          </motion.button>

          {/* Progress Bar */}
          <div className="flex-1 space-y-1">
            <Slider
              value={[progress]}
              onValueChange={handleSeek}
              max={100}
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

        {/* Secondary Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Skip Buttons */}
            <Button size="sm" variant="ghost" onClick={() => skip(-10)} aria-label={t('viewer.skipBack')}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => skip(10)} aria-label={t('viewer.skipForward')}>
              <SkipForward className="w-4 h-4" />
            </Button>

            {/* Volume */}
            <Button size="sm" variant="ghost" onClick={toggleMute} aria-label={isMuted ? t('viewer.unmute') : t('viewer.mute')}>
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
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
            {/* Playback Rate */}
            <Button size="sm" variant="outline" onClick={changePlaybackRate} aria-label={t('viewer.playbackSpeed', { rate: playbackRate })}>
              {playbackRate}x
            </Button>

            {/* Script Toggle */}
            {content?.script && (
              <Collapsible open={showScript} onOpenChange={setShowScript}>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1" aria-label={showScript ? t('viewer.hideTranscript') : t('viewer.showTranscript')}>
                    <FileText className="w-4 h-4" />
                    {t('viewer.transcript')}
                    {showScript ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            )}
          </div>
        </div>

        {/* Script Content */}
        {content?.script && (
          <Collapsible open={showScript} onOpenChange={setShowScript}>
            <CollapsibleContent>
              <div className="mt-4 p-4 bg-white/50 dark:bg-gray-900/50 rounded-lg max-h-60 overflow-y-auto">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {content.script}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}
