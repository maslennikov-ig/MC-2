'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import NextImage from 'next/image'
import { ImageIcon, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Props for the LessonCoverHero component
 */
interface LessonCoverHeroProps {
  /** URL of the cover image from Supabase Storage */
  imageUrl?: string | null
  /** Lesson title used for accessibility (aria-label) and optional overlay text */
  lessonTitle: string
  /** Section/module title displayed above lesson title in overlay */
  sectionTitle?: string
  /** Section/module number for display in overlay */
  sectionNumber?: number
  /** Reading time in minutes */
  readingTime?: number
  /** Whether to show gradient overlay with lesson and section titles */
  showOverlay?: boolean
  /** Callback fired when image loads successfully */
  onImageLoad?: () => void
  /** Callback fired when image fails to load */
  onImageError?: () => void
  /** Additional CSS classes for the container element */
  className?: string
}

/**
 * LessonCoverHero - Hero banner component for lesson cover images
 *
 * Displays a 21:9 cinematic aspect ratio hero image at the top of lesson content.
 *
 * Features:
 * - 21:9 cinematic ratio with max-h-[400px] limit on desktop
 * - Fade-in animation with skeleton loader during image load
 * - GPU-optimized animations with willChange hints
 * - Memory-safe state updates (prevents setState on unmounted)
 * - Dark/light theme support
 * - Priority loading for above-the-fold content
 * - Optional gradient overlay with lesson/section titles
 *
 * @param props - Component props
 * @param props.imageUrl - URL of the cover image from Supabase Storage
 * @param props.lessonTitle - Lesson title for accessibility (aria-label) and optional overlay
 * @param props.sectionTitle - Section/module title for optional overlay
 * @param props.showOverlay - Whether to display gradient overlay with titles
 * @param props.className - Additional CSS classes for container
 * @param props.onImageLoad - Callback when image loads successfully
 * @param props.onImageError - Callback when image fails to load
 *
 * @returns JSX element or null if no image URL or error occurred
 *
 * @example
 * ```tsx
 * <LessonCoverHero
 *   imageUrl="https://supabase.co/storage/..."
 *   lessonTitle="Introduction to React"
 *   sectionTitle="Module 1: Basics"
 *   showOverlay={true}
 *   onImageLoad={() => console.log('loaded')}
 * />
 * ```
 */
export function LessonCoverHero({
  imageUrl,
  lessonTitle,
  sectionTitle,
  sectionNumber,
  readingTime,
  showOverlay = false,
  onImageLoad,
  onImageError,
  className,
}: LessonCoverHeroProps) {
  // Track loaded/error URLs to handle URL changes without race conditions
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set())
  const [errorUrls, setErrorUrls] = useState<Set<string>>(new Set())
  const isMountedRef = useRef(true)
  const imageRef = useRef<HTMLImageElement>(null)

  // Derive state from URL tracking
  const isLoaded = imageUrl ? loadedUrls.has(imageUrl) : false
  const hasError = imageUrl ? errorUrls.has(imageUrl) : false

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Check if image is already loaded from cache on mount/URL change
  useEffect(() => {
    if (!imageUrl) return

    const checkComplete = () => {
      if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
        if (isMountedRef.current && !loadedUrls.has(imageUrl)) {
          setLoadedUrls((prev) => new Set(prev).add(imageUrl))
          onImageLoad?.()
        }
      }
    }

    checkComplete()
    const timeoutId = setTimeout(checkComplete, 100)

    return () => clearTimeout(timeoutId)
  }, [imageUrl, loadedUrls, onImageLoad])

  const handleLoad = useCallback(() => {
    if (!isMountedRef.current || !imageUrl) return
    setLoadedUrls((prev) => new Set(prev).add(imageUrl))
    onImageLoad?.()
  }, [imageUrl, onImageLoad])

  const handleError = useCallback(() => {
    if (!isMountedRef.current || !imageUrl) return
    setErrorUrls((prev) => new Set(prev).add(imageUrl))
    onImageError?.()
  }, [imageUrl, onImageError])

  // Don't render if no URL or error occurred
  if (!imageUrl || hasError) {
    return null
  }

  return (
    <div
      className={cn(
        // Base styles - 21:9 cinematic aspect ratio, limited height on desktop
        'relative aspect-[21/9] max-h-[400px] w-full overflow-hidden rounded-xl',
        // Skeleton background while loading
        !isLoaded &&
          'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900',
        className
      )}
    >
      {/* Skeleton loader with animated icon */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-2">
              <ImageIcon className="h-12 w-12 animate-pulse text-gray-400 dark:text-gray-600" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main image with fade-in animation */}
      {/*
        GPU optimization: willChange='opacity' during load hints browser to prepare,
        then resets to 'auto' after animation to free GPU memory
      */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="absolute inset-0"
        style={{ willChange: isLoaded ? 'auto' : 'opacity' }}
      >
        <NextImage
          ref={imageRef}
          src={imageUrl}
          alt={`Cover image for lesson: ${lessonTitle}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px"
          className="object-cover"
          onLoad={handleLoad}
          onError={handleError}
          priority // Hero image should load immediately
          unoptimized // External Supabase Storage URLs, skip Next.js image optimization
        />
      </motion.div>

      {/* Optional gradient overlay with lesson info */}
      {showOverlay && isLoaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
        >
          <div className="absolute right-0 bottom-0 left-0 p-4 sm:p-6 md:p-8">
            {/* Module info */}
            {sectionTitle && (
              <p className="mb-1 text-sm font-medium text-white/90 drop-shadow-md">
                {sectionNumber ? `Модуль ${sectionNumber}: ${sectionTitle}` : sectionTitle}
              </p>
            )}
            {/* Lesson title */}
            <h2 className="mb-2 line-clamp-2 text-xl font-bold text-white drop-shadow-lg sm:text-2xl md:text-3xl">
              {lessonTitle}
            </h2>
            {/* Reading time */}
            {readingTime && (
              <div className="flex items-center gap-1.5 text-sm text-white/80 drop-shadow-md">
                <Clock className="h-4 w-4" />
                <span>{readingTime} мин</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default LessonCoverHero
