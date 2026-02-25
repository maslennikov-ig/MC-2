'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { MediaPlayer, MediaProvider, type MediaPlayerInstance, Poster } from '@vidstack/react'
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'

import { Maximize2 } from 'lucide-react'
import { formatVideoSrc } from './video-utils'
import { useVidstackTranslations } from '@/hooks/useVidstackTranslations'

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
  className = '',
  mode = 'normal',
  onModeChange,
}: PersistentVideoPlayerProps) {
  const playerRef = useRef<MediaPlayerInstance>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasError, setHasError] = useState(false)

  const vidstackTranslations = useVidstackTranslations()

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

  // Handle dragging with threshold to avoid conflicts with video controls
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== 'floating') return

      // Don't start drag if clicking on buttons, controls, or resize handle
      const target = e.target as HTMLElement
      if (target.closest('button')) return
      if (target.closest('.resize-handle')) return
      if (target.closest('.floating-controls')) return
      // Don't drag from Vidstack's built-in controls
      if (target.closest('[data-media-controls]')) return
      if (target.closest('.vds-controls')) return

      setIsDragging(true)
      setDragThresholdMet(false)
      setDragStart({
        x: e.clientX - floatingPos.x,
        y: e.clientY - floatingPos.y,
        startX: e.clientX,
        startY: e.clientY,
      })
      e.preventDefault()
    },
    [mode, floatingPos]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragThresholdMet) {
        const distance = Math.sqrt(
          Math.pow(e.clientX - dragStart.startX, 2) + Math.pow(e.clientY - dragStart.startY, 2)
        )
        if (distance < 5) return
        setDragThresholdMet(true)
      }

      setFloatingPos({
        x: Math.max(0, Math.min(window.innerWidth - floatingSize.width, e.clientX - dragStart.x)),
        y: Math.max(0, Math.min(window.innerHeight - floatingSize.height, e.clientY - dragStart.y)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setDragThresholdMet(false)
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
      {/* Video element with built-in Vidstack controls */}
      <div className="relative h-full w-full bg-black">
        {hasError ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-gray-400">Видео недоступно</p>
            <button
              onClick={() => setHasError(false)}
              className="text-xs text-purple-400 transition-colors hover:text-purple-300"
            >
              Попробовать снова
            </button>
          </div>
        ) : (
          <MediaPlayer
            ref={playerRef}
            src={formatVideoSrc(src) as any}
            title={title}
            playsInline
            onError={() => setHasError(true)}
            className="h-full w-full"
          >
            <MediaProvider>
              {poster && <Poster src={poster} alt={title || 'Video poster'} />}
            </MediaProvider>
            {/* Built-in Vidstack layout: play/pause, progress, volume, speed, fullscreen, PiP, keyboard shortcuts, gestures */}
            <DefaultVideoLayout
              icons={defaultLayoutIcons}
              translations={vidstackTranslations}
              playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 2]}
              seekStep={10}
            />
          </MediaPlayer>
        )}
      </div>

      {/* Floating mode: restore button + minimize control */}
      {mode === 'floating' && (
        <>
          <div className="absolute top-2 right-2 z-50 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {onModeChange && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onModeChange('normal')
                }}
                className="rounded-full bg-black/60 p-1.5 text-white/80 backdrop-blur-sm transition-all hover:bg-black/80 hover:text-white"
                aria-label="Вернуть видео в основной вид"
              >
                <Maximize2 className="h-3.5 w-3.5" />
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

      {/* Normal mode: minimize button */}
      {mode === 'normal' && onModeChange && (
        <div className="absolute top-2 right-2 z-50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onModeChange('floating')
            }}
            className="rounded-full bg-black/60 p-1.5 text-white/80 backdrop-blur-sm transition-all hover:bg-black/80 hover:text-white"
            aria-label="Свернуть в плавающее окно"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      )}
    </motion.div>
  )
}
