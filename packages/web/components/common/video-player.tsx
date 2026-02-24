'use client'

import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Rnd } from 'react-rnd'
import ReactPlayer from 'react-player'

const Player = ReactPlayer as any

import {
  X,
  Minimize2,
  Maximize2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  PictureInPicture2,
} from 'lucide-react'

interface VideoPlayerProps {
  src: string
  title?: string
  poster?: string
  onClose?: () => void
  className?: string
  isFloating?: boolean
  isHidden?: boolean
  onToggleFloat?: () => void
  videoState?: {
    currentTime: number
    isPlaying: boolean
    isMuted: boolean
  }
  onVideoStateChange?: (state: {
    currentTime: number
    isPlaying: boolean
    isMuted: boolean
  }) => void
}

export default function VideoPlayer({
  src,
  title,
  poster,
  onClose,
  className = '',
  isFloating = false,
  isHidden = false,
  onToggleFloat,
  videoState,
  onVideoStateChange,
}: VideoPlayerProps) {
  const playerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(videoState?.isPlaying || false)
  const [isMuted, setIsMuted] = useState(videoState?.isMuted || false)
  const [currentTime, setCurrentTime] = useState(videoState?.currentTime || 0)
  const [duration, setDuration] = useState(0)
  const [isPiPActive, setIsPiPActive] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 400, height: 250 })
  const [windowPosition, setWindowPosition] = useState(() => {
    if (typeof window !== 'undefined') {
      return {
        x: window.innerWidth - 420,
        y: window.innerHeight - 270,
      }
    }
    return { x: 20, y: 20 }
  })

  // Update position when floating mode is activated
  useEffect(() => {
    if (isFloating && typeof window !== 'undefined') {
      const x = Math.max(20, window.innerWidth - windowSize.width - 20)
      const y = Math.max(20, window.innerHeight - windowSize.height - 20)
      setWindowPosition({ x, y })
    }
  }, [isFloating, windowSize.width, windowSize.height])

  // Callbacks for ReactPlayer
  const handleProgress = (state: { playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds)
    if (onVideoStateChange) {
      onVideoStateChange({
        currentTime: state.playedSeconds,
        isPlaying,
        isMuted,
      })
    }
  }

  const handleDuration = (d: number) => {
    setDuration(d)
  }

  const handlePlay = () => {
    setIsPlaying(true)
    if (onVideoStateChange) {
      onVideoStateChange({
        currentTime,
        isPlaying: true,
        isMuted,
      })
    }
  }

  const handlePause = () => {
    setIsPlaying(false)
    if (onVideoStateChange) {
      onVideoStateChange({
        currentTime,
        isPlaying: false,
        isMuted,
      })
    }
  }

  // Handle Picture-in-Picture
  const togglePiP = async () => {
    const videoElement = playerRef.current?.getInternalPlayer() as HTMLVideoElement | null
    if (!videoElement) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        setIsPiPActive(false)
      } else {
        await videoElement.requestPictureInPicture()
        setIsPiPActive(true)
      }
    } catch {
      // Error handled silently
    }
  }

  // Play/Pause toggle
  const togglePlay = () => {
    // Relying on bounded state; component re-renders will reflect in ReactPlayer
    setIsPlaying(!isPlaying)
  }

  // Mute toggle
  const toggleMute = () => {
    const newMutedState = !isMuted
    setIsMuted(newMutedState)

    if (onVideoStateChange) {
      onVideoStateChange({
        currentTime,
        isPlaying,
        isMuted: newMutedState,
      })
    }
  }

  // Fullscreen
  const toggleFullscreen = () => {
    const videoElement = playerRef.current?.getInternalPlayer() as HTMLVideoElement | null
    let targetElement = containerRef.current as HTMLElement | null
    if (!targetElement) targetElement = videoElement
    if (!targetElement) return

    if (!document.fullscreenElement) {
      targetElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  // Format time display
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Create the video element once
  const videoElement = (
    <div
      className="relative flex h-full w-full items-center justify-center bg-black [&>div>video]:!object-contain"
      style={{ display: isHidden ? 'none' : 'flex' }}
    >
      <Player
        ref={playerRef}
        url={src}
        playing={isPlaying}
        muted={isMuted}
        controls={true}
        width="100%"
        height="100%"
        playsinline
        config={{
          file: {
            attributes: {
              poster: poster,
              controlsList: 'nodownload',
            },
          },
        }}
        onProgress={handleProgress}
        onDuration={handleDuration}
        onPlay={handlePlay}
        onPause={handlePause}
        onError={(e: any) => {
          console.error('Video loading error:', e)
        }}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
    </div>
  )

  // Normal mode content
  const normalContent = (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden rounded-xl bg-black ${className}`}
      style={{ display: isFloating || isHidden ? 'none' : 'block' }}
    >
      {videoElement}

      {/* Custom Controls Overlay */}
      <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100">
        {/* Progress Bar */}
        <div className="mb-3">
          <div className="h-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-white/80">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="p-1 text-white transition-colors hover:text-purple-400"
              aria-label={isPlaying ? 'Приостановить видео' : 'Воспроизвести видео'}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>

            <button
              onClick={toggleMute}
              className="p-1 text-white transition-colors hover:text-purple-400"
              aria-label={isMuted ? 'Включить звук' : 'Отключить звук'}
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>

            <span className="ml-2 text-sm text-white">{title || 'Видео урока'}</span>
          </div>

          <div className="flex items-center gap-2">
            {document.pictureInPictureEnabled && (
              <button
                onClick={() => void togglePiP()}
                className={`p-1 text-white transition-colors hover:text-purple-400 ${isPiPActive ? 'text-purple-400' : ''}`}
                aria-label="Картинка в картинке"
              >
                <PictureInPicture2 className="h-5 w-5" />
              </button>
            )}

            {onToggleFloat && (
              <button
                onClick={onToggleFloat}
                className="p-1 text-white transition-colors hover:text-purple-400"
                aria-label="Открыть в плавающем окне"
              >
                <Minimize2 className="h-5 w-5" />
              </button>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-1 text-white transition-colors hover:text-purple-400"
              aria-label="Полноэкранный режим"
            >
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // Floating mode content
  const floatingContent =
    isFloating && typeof window !== 'undefined' ? (
      <Rnd
        size={{ width: windowSize.width, height: windowSize.height }}
        position={{ x: windowPosition.x, y: windowPosition.y }}
        onDragStop={(_e, d) => {
          setWindowPosition({ x: d.x, y: d.y })
        }}
        onResizeStop={(_e, _direction, ref, _delta, position) => {
          setWindowSize({
            width: parseInt(ref.style.width),
            height: parseInt(ref.style.height),
          })
          setWindowPosition(position)
        }}
        minWidth={320}
        minHeight={200}
        maxWidth={800}
        maxHeight={600}
        bounds="window"
        dragHandleClassName="drag-handle"
        enableResizing={{
          top: false,
          right: true,
          bottom: true,
          left: true,
          topRight: false,
          bottomRight: true,
          bottomLeft: true,
          topLeft: false,
        }}
        className="fixed z-50"
        style={{
          position: 'fixed',
          zIndex: 9999,
          display: isFloating ? 'block' : 'none',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="group relative h-full w-full overflow-hidden rounded-lg bg-black shadow-2xl"
        >
          {/* Minimalist floating controls - only on hover */}
          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {onToggleFloat && (
              <button
                onClick={onToggleFloat}
                className="rounded-full bg-black/50 p-1.5 text-white/80 backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white"
                aria-label="Вернуть видео в основной вид"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="rounded-full bg-black/50 p-1.5 text-white/80 backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white"
                aria-label="Закрыть видео"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Video Container - full area is draggable */}
          <div className="drag-handle relative h-full w-full cursor-move bg-black">
            {!isHidden && videoElement}

            {/* Subtle resize handle */}
            <div className="pointer-events-none absolute right-1 bottom-1 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-30">
              <div className="absolute right-0 bottom-0 h-2 w-2 rounded-br border-r border-b border-white/50" />
            </div>
          </div>
        </motion.div>
      </Rnd>
    ) : null

  // Always render both containers, but only show one
  return (
    <>
      {normalContent}
      {typeof window !== 'undefined' && createPortal(floatingContent, document.body)}
    </>
  )
}
