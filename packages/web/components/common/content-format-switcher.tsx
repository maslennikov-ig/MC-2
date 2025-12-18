"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import dynamic from "next/dynamic"

// Define ReactPlayer types locally since react-player doesn't export them properly
interface ReactPlayerProps {
  url?: string
  playing?: boolean
  volume?: number
  onPlay?: () => void
  onPause?: () => void
  onProgress?: (state: { played: number; playedSeconds: number }) => void
  onDuration?: (duration: number) => void
  playbackRate?: number
  width?: string | number
  height?: string | number
  controls?: boolean
}

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false }) as React.ComponentType<ReactPlayerProps>
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
  Minimize2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import LessonContent from "@/components/common/lesson-content"
import type { Lesson, Section, Asset } from "@/types/database"

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
  availableFormats?: {
    video?: string
    audio?: string
    presentation?: string
  }
  onFormatChange?: (format: string) => void
}

export default function ContentFormatSwitcher({
  lesson,
  section,
  assets,
  availableFormats = {},
  onFormatChange
}: ContentFormatSwitcherProps) {
  const [currentFormat, setCurrentFormat] = useState<'text' | 'video' | 'audio' | 'presentation'>('text')
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  // Use actual formats from props, no mock data
  const mockFormats = {
    video: availableFormats.video || null,
    audio: availableFormats.audio || null,
    presentation: availableFormats.presentation || null
  }

  const formats: ContentFormat[] = useMemo(() => [
    {
      type: 'text',
      label: 'Текст',
      icon: <FileText className="w-4 h-4" />,
      available: true
    },
    {
      type: 'video',
      label: 'Видео',
      icon: <Play className="w-4 h-4" />,
      available: !!mockFormats.video,
      url: mockFormats.video || undefined
    },
    {
      type: 'audio',
      label: 'Аудио',
      icon: <Headphones className="w-4 h-4" />,
      available: !!mockFormats.audio,
      url: mockFormats.audio || undefined
    },
    {
      type: 'presentation',
      label: 'Презентация',
      icon: <Presentation className="w-4 h-4" />,
      available: !!mockFormats.presentation,
      url: mockFormats.presentation || undefined
    }
  ], [mockFormats.video, mockFormats.audio, mockFormats.presentation])

  const availableFormatsCount = formats.filter(f => f.available).length

  useEffect(() => {
    // Save user preference to localStorage
    localStorage.setItem(`lesson-${lesson.id}-format`, currentFormat)
    onFormatChange?.(currentFormat)
  }, [currentFormat, lesson.id, onFormatChange])

  useEffect(() => {
    // Handle keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch(e.key) {
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
    // Restore user preference
    const savedFormat = localStorage.getItem(`lesson-${lesson.id}-format`) as 'text' | 'video' | 'audio' | 'presentation' | null
    if (savedFormat && formats.find(f => f.type === savedFormat && f.available)) {
      setCurrentFormat(savedFormat)
    }
  }, [lesson.id, formats])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSeek = (value: number[]) => {
    setProgress(value[0])
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // Only show switcher if there are alternative formats
  if (availableFormatsCount <= 1) {
    return <LessonContent lesson={lesson} section={section} assets={assets} />
  }

  return (
    <div className="w-full">
      {/* Format Switcher Bar */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                Формат:
              </span>
              <div className="flex items-center gap-2">
                {formats.map((format) => (
                  <Button
                    key={format.type}
                    onClick={() => format.available && setCurrentFormat(format.type)}
                    disabled={!format.available}
                    variant={currentFormat === format.type ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "gap-2 transition-all",
                      currentFormat === format.type
                        ? "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500/30 dark:text-purple-300 border border-purple-600 dark:border-purple-500/50"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800",
                      !format.available && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {format.icon}
                    <span className="hidden sm:inline">{format.label}</span>
                  </Button>
                ))}
              </div>
            </div>
            
            {/* Quick info badges */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                {availableFormatsCount} формата
              </Badge>
              {currentFormat !== 'text' && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                  {lesson.duration_minutes} мин
                </Badge>
              )}
            </div>
          </div>
          
          {/* Keyboard shortcuts hint */}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Быстрый доступ: <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">1</kbd> Текст
            {formats[1].available && <> • <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">2</kbd> Видео</>}
            {formats[2].available && <> • <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">3</kbd> Аудио</>}
          </div>
        </div>
      </div>

      {/* Content Area */}
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
            <LessonContent lesson={lesson} section={section} assets={assets} />
          )}

          {currentFormat === 'video' && mockFormats.video && (
            <div className="relative bg-black">
              <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden shadow-2xl">
                  <ReactPlayer
                    url={mockFormats.video}
                    playing={isPlaying}
                    volume={isMuted ? 0 : volume}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onProgress={({ played }: { played: number; playedSeconds: number }) => {
                      setProgress(played * 100)
                    }}
                    onDuration={(d: number) => setDuration(d)}
                    playbackRate={playbackRate}
                    width="100%"
                    height="100%"
                    controls={false}
                  />
                  
                  {/* Custom Video Controls */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <div className="space-y-2">
                      {/* Progress Bar */}
                      <Slider
                        value={[progress]}
                        onValueChange={handleSeek}
                        max={100}
                        step={0.1}
                        className="w-full"
                      />
                      
                      {/* Controls */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => setIsPlaying(!isPlaying)}
                            size="sm"
                            variant="ghost"
                            className="text-white hover:bg-white/20"
                          >
                            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                          
                          <Button
                            onClick={() => setIsMuted(!isMuted)}
                            size="sm"
                            variant="ghost"
                            className="text-white hover:bg-white/20"
                          >
                            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </Button>
                          
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[volume * 100]}
                              onValueChange={(v) => setVolume(v[0] / 100)}
                              max={100}
                              step={1}
                              className="w-24"
                            />
                          </div>
                          
                          <span className="text-white text-sm ml-4">
                            {formatTime(progress * duration / 100)} / {formatTime(duration)}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <select
                            value={playbackRate}
                            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                            className="bg-transparent text-white text-sm border border-white/30 rounded px-2 py-1"
                          >
                            <option value="0.5">0.5x</option>
                            <option value="0.75">0.75x</option>
                            <option value="1">1x</option>
                            <option value="1.25">1.25x</option>
                            <option value="1.5">1.5x</option>
                            <option value="2">2x</option>
                          </select>
                          
                          <Button
                            onClick={toggleFullscreen}
                            size="sm"
                            variant="ghost"
                            className="text-white hover:bg-white/20"
                          >
                            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Video Description */}
                <div className="mt-6 p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">Видео урок: {lesson.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Продолжительность: {lesson.duration_minutes} минут
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentFormat === 'audio' && mockFormats.audio && (
            <div className="max-w-4xl mx-auto px-6 py-8">
              <div className="bg-gradient-to-br from-purple-100 to-blue-100 dark:from-gray-800 dark:to-gray-900 rounded-lg p-8 shadow-lg">
                <div className="flex items-center justify-center mb-6">
                  <div className="relative">
                    <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-xl">
                      <Headphones className="w-16 h-16 text-white" />
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
                
                <h3 className="text-xl font-semibold text-center mb-4">{lesson.title}</h3>
                
                <ReactPlayer
                  url={mockFormats.audio}
                  playing={isPlaying}
                  volume={isMuted ? 0 : volume}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onProgress={({ played }: { played: number; playedSeconds: number }) => setProgress(played * 100)}
                  onDuration={(d: number) => setDuration(d)}
                  playbackRate={playbackRate}
                  width="0"
                  height="0"
                />
                
                {/* Audio Controls */}
                <div className="space-y-4">
                  <Slider
                    value={[progress]}
                    onValueChange={handleSeek}
                    max={100}
                    step={0.1}
                    className="w-full"
                  />
                  
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{formatTime(progress * duration / 100)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      onClick={() => setProgress(Math.max(0, progress - 10))}
                      size="sm"
                      variant="ghost"
                    >
                      <SkipBack className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      onClick={() => setIsPlaying(!isPlaying)}
                      size="lg"
                      className="bg-purple-600 hover:bg-purple-700 text-white rounded-full w-16 h-16"
                    >
                      {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                    </Button>
                    
                    <Button
                      onClick={() => setProgress(Math.min(100, progress + 10))}
                      size="sm"
                      variant="ghost"
                    >
                      <SkipForward className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      onClick={() => setIsMuted(!isMuted)}
                      size="sm"
                      variant="ghost"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </Button>
                    
                    <Slider
                      value={[volume * 100]}
                      onValueChange={(v) => setVolume(v[0] / 100)}
                      max={100}
                      step={1}
                      className="w-32"
                    />
                    
                    <select
                      value={playbackRate}
                      onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                      className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-sm"
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
                
                {/* Transcript Link */}
                <div className="mt-6 text-center">
                  <Button
                    onClick={() => setCurrentFormat('text')}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Читать текстовую версию
                  </Button>
                </div>
              </div>
            </div>
          )}

          {currentFormat === 'presentation' && mockFormats.presentation && (
            <div className="max-w-6xl mx-auto px-6 py-8">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center">
                <Presentation className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Презентация к уроку</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  {lesson.title}
                </p>
                <Button className="gap-2">
                  <Download className="w-4 h-4" />
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