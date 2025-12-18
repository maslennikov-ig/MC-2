"use client"

import { useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { Rnd } from "react-rnd"
import { 
  X, 
  Minimize2, 
  Maximize2, 
  Play, 
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  PictureInPicture2
} from "lucide-react"

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
  className = "",
  isFloating = false,
  isHidden = false,
  onToggleFloat,
  videoState,
  onVideoStateChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
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
        y: window.innerHeight - 270
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

  // Update time and notify parent
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateTime = () => {
      const newTime = video.currentTime
      setCurrentTime(newTime)
      setDuration(video.duration)
      
      if (onVideoStateChange) {
        onVideoStateChange({
          currentTime: newTime,
          isPlaying: !video.paused,
          isMuted: video.muted
        })
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
      if (onVideoStateChange) {
        onVideoStateChange({
          currentTime: video.currentTime,
          isPlaying: true,
          isMuted: video.muted
        })
      }
    }
    
    const handlePause = () => {
      setIsPlaying(false)
      if (onVideoStateChange) {
        onVideoStateChange({
          currentTime: video.currentTime,
          isPlaying: false,
          isMuted: video.muted
        })
      }
    }
    
    const handleLoadedMetadata = () => setDuration(video.duration)

    video.addEventListener("timeupdate", updateTime)
    video.addEventListener("play", handlePlay)
    video.addEventListener("pause", handlePause)
    video.addEventListener("loadedmetadata", handleLoadedMetadata)

    return () => {
      video.removeEventListener("timeupdate", updateTime)
      video.removeEventListener("play", handlePlay)
      video.removeEventListener("pause", handlePause)
      video.removeEventListener("loadedmetadata", handleLoadedMetadata)
    }
  }, [onVideoStateChange])

  // Handle Picture-in-Picture
  const togglePiP = async () => {
    if (!videoRef.current) return
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        setIsPiPActive(false)
      } else {
        await videoRef.current.requestPictureInPicture()
        setIsPiPActive(true)
      }
    } catch {
      // Error handled silently
    }
  }

  // Play/Pause toggle
  const togglePlay = () => {
    if (!videoRef.current) return
    
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
  }

  // Mute toggle
  const toggleMute = () => {
    if (!videoRef.current) return
    
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
    
    if (onVideoStateChange) {
      onVideoStateChange({
        currentTime: videoRef.current.currentTime,
        isPlaying: !videoRef.current.paused,
        isMuted: !isMuted
      })
    }
  }

  // Fullscreen
  const toggleFullscreen = () => {
    if (!videoRef.current) return
    
    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
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
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      playsInline
      controls
      className="w-full h-full object-contain"
      style={{ display: isHidden ? 'none' : 'block' }}
    />
  )

  // Normal mode content
  const normalContent = (
    <div 
      ref={containerRef}
      className={`relative rounded-xl overflow-hidden bg-black group ${className}`}
      style={{ display: (isFloating || isHidden) ? 'none' : 'block' }}
    >
      {videoElement}
      
      {/* Custom Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Progress Bar */}
        <div className="mb-3">
          <div className="bg-white/30 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-purple-500 h-full transition-all"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/80 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="text-white hover:text-purple-400 transition-colors p-1"
              aria-label={isPlaying ? "Приостановить видео" : "Воспроизвести видео"}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleMute}
              className="text-white hover:text-purple-400 transition-colors p-1"
              aria-label={isMuted ? "Включить звук" : "Отключить звук"}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            <span className="text-white text-sm ml-2">
              {title || "Видео урока"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {document.pictureInPictureEnabled && (
              <button
                onClick={togglePiP}
                className={`text-white hover:text-purple-400 transition-colors p-1 ${isPiPActive ? 'text-purple-400' : ''}`}
                aria-label="Картинка в картинке"
              >
                <PictureInPicture2 className="w-5 h-5" />
              </button>
            )}

            {onToggleFloat && (
              <button
                onClick={onToggleFloat}
                className="text-white hover:text-purple-400 transition-colors p-1"
                aria-label="Открыть в плавающем окне"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-purple-400 transition-colors p-1"
              aria-label="Полноэкранный режим"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // Floating mode content
  const floatingContent = isFloating && typeof window !== 'undefined' ? (
    <Rnd
      size={{ width: windowSize.width, height: windowSize.height }}
      position={{ x: windowPosition.x, y: windowPosition.y }}
      onDragStop={(_e, d) => {
        setWindowPosition({ x: d.x, y: d.y })
      }}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        setWindowSize({
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height)
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
        topLeft: false
      }}
      className="fixed z-50"
      style={{
        position: 'fixed',
        zIndex: 9999,
        display: isFloating ? 'block' : 'none'
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="w-full h-full shadow-2xl rounded-lg overflow-hidden bg-black relative group"
      >
        {/* Minimalist floating controls - only on hover */}
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {onToggleFloat && (
            <button
              onClick={onToggleFloat}
              className="bg-black/50 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/70 rounded-full p-1.5 transition-all"
              aria-label="Вернуть видео в основной вид"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="bg-black/50 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/70 rounded-full p-1.5 transition-all"
              aria-label="Закрыть видео"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Video Container - full area is draggable */}
        <div className="drag-handle w-full h-full relative bg-black cursor-move">
          {!isHidden && videoElement}
          
          {/* Subtle resize handle */}
          <div className="absolute bottom-1 right-1 w-3 h-3 opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none">
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/50 rounded-br" />
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