'use client'

import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
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

interface PersistentVideoPlayerProps {
  src: string
  title?: string
  poster?: string
  onClose?: () => void
  className?: string
  mode: 'normal' | 'floating' | 'hidden'
  onModeChange?: (mode: 'normal' | 'floating' | 'hidden') => void
}

export default function PersistentVideoPlayer({
  src,
  title,
  poster,
  onClose,
  className = '',
  mode = 'normal',
  onModeChange,
}: PersistentVideoPlayerProps) {
  const playerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPiPActive, setIsPiPActive] = useState(false)

  // Floating window position and size
  const [floatingPos, setFloatingPos] = useState({ x: 0, y: 0 })
  const [floatingSize, setFloatingSize] = useState({ width: 400, height: 250 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, startX: 0, startY: 0 })
  const [resizeStart, setResizeStart] = useState({ width: 0, height: 0, x: 0, y: 0 })
  const [dragThresholdMet, setDragThresholdMet] = useState(false)

  // Initialize floating position
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFloatingPos({
        x: window.innerWidth - 420,
        y: window.innerHeight - 270,
      })
    }
  }, [])

  // Callbacks for ReactPlayer
  const handleProgress = (state: { playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds)
  }

  const handleDuration = (d: number) => {
    setDuration(d)
  }

  const handlePlay = () => {
    setIsPlaying(true)
  }

  const handlePause = () => {
    setIsPlaying(false)
  }

  // Handle dragging with threshold to avoid conflicts with video controls
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'floating') return

    // Don't start drag if clicking on buttons or resize handle
    if ((e.target as HTMLElement).closest('button')) return
    if ((e.target as HTMLElement).closest('.resize-handle')) return

    // Allow dragging from anywhere including video, but with a threshold
    setIsDragging(true)
    setDragThresholdMet(false)
    setDragStart({
      x: e.clientX - floatingPos.x,
      y: e.clientY - floatingPos.y,
      startX: e.clientX,
      startY: e.clientY,
    })

    // Prevent default only if we're not on video controls area
    const videoElement = playerRef.current?.getInternalPlayer() as HTMLVideoElement | null
    if (videoElement) {
      const rect = videoElement.getBoundingClientRect()
      const relativeY = e.clientY - rect.top
      const controlsHeight = 50 // Approximate height of video controls

      // If clicking in the controls area at the bottom, don't prevent default
      if (relativeY < rect.height - controlsHeight) {
        e.preventDefault()
      }
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      // Check if we've moved enough to consider it a drag (5px threshold)
      if (!dragThresholdMet) {
        const distance = Math.sqrt(
          Math.pow(e.clientX - dragStart.startX, 2) + Math.pow(e.clientY - dragStart.startY, 2)
        )

        if (distance < 5) return

        setDragThresholdMet(true)

        // Add dragging class to prevent video interaction
        if (containerRef.current) {
          containerRef.current.style.pointerEvents = 'none'
          const videoElement = playerRef.current?.getInternalPlayer() as HTMLVideoElement | null
          if (videoElement) {
            videoElement.style.pointerEvents = 'none'
          }
        }
      }

      setFloatingPos({
        x: Math.max(0, Math.min(window.innerWidth - floatingSize.width, e.clientX - dragStart.x)),
        y: Math.max(0, Math.min(window.innerHeight - floatingSize.height, e.clientY - dragStart.y)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setDragThresholdMet(false)

      // Restore pointer events
      if (containerRef.current) {
        containerRef.current.style.pointerEvents = 'auto'
        const videoElement = playerRef.current?.getInternalPlayer() as HTMLVideoElement | null
        if (videoElement) {
          videoElement.style.pointerEvents = 'auto'
        }
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart, floatingSize, dragThresholdMet])

  // Handle resizing
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsResizing(true)
    setResizeStart({
      width: floatingSize.width,
      height: floatingSize.height,
      x: e.clientX,
      y: e.clientY,
    })
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      setFloatingSize({
        width: Math.max(320, Math.min(800, resizeStart.width + (e.clientX - resizeStart.x))),
        height: Math.max(200, Math.min(600, resizeStart.height + (e.clientY - resizeStart.y))),
      })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, resizeStart])

  // Video controls
  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

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
      // Silent error
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Determine container styles based on mode
  const getContainerStyles = (): React.CSSProperties => {
    if (mode === 'hidden') {
      return { display: 'none' }
    }

    if (mode === 'floating') {
      return {
        position: 'fixed',
        top: floatingPos.y,
        left: floatingPos.x,
        width: floatingSize.width,
        height: floatingSize.height,
        zIndex: 9999,
        cursor: dragThresholdMet ? 'grabbing' : 'default',
      }
    }

    return {} // Normal mode uses className styles
  }

  return (
    <motion.div
      ref={containerRef}
      className={
        mode === 'normal'
          ? `group relative overflow-hidden rounded-xl bg-black ${className}`
          : mode === 'floating'
            ? 'group overflow-hidden rounded-lg bg-black shadow-2xl'
            : ''
      }
      style={getContainerStyles()}
      onMouseDown={handleMouseDown}
      initial={false}
      animate={{
        opacity: mode === 'hidden' ? 0 : 1,
        scale: mode === 'floating' ? 1 : 1,
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Video element - always the same one */}
      <div
        className="relative flex h-full w-full items-center justify-center bg-black [&>div>video]:!object-contain"
        style={{
          cursor: mode === 'floating' && !dragThresholdMet ? 'move' : 'default',
        }}
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

      {/* Controls for floating mode */}
      {mode === 'floating' && (
        <>
          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {onModeChange && (
              <button
                onClick={() => onModeChange('normal')}
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

          {/* Resize handle */}
          <div
            className="resize-handle absolute right-0 bottom-0 h-4 w-4 cursor-se-resize opacity-0 transition-opacity group-hover:opacity-30"
            onMouseDown={handleResizeMouseDown}
          >
            <div className="pointer-events-none absolute right-0 bottom-0 h-2 w-2 rounded-br border-r border-b border-white/50" />
          </div>
        </>
      )}

      {/* Controls for normal mode */}
      {mode === 'normal' && (
        <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100">
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

              {onModeChange && (
                <button
                  onClick={() => onModeChange('floating')}
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
      )}
    </motion.div>
  )
}
