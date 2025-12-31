"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import NextImage from "next/image"
import { ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

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
 * Displays a 16:9 aspect ratio hero image at the top of lesson content.
 *
 * Features:
 * - Responsive height (200px mobile, 250px tablet, 300px desktop)
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
  showOverlay = false,
  onImageLoad,
  onImageError,
  className,
}: LessonCoverHeroProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleLoad = useCallback(() => {
    if (!isMountedRef.current) return  // Prevent state update on unmounted
    setIsLoaded(true)
    onImageLoad?.()
  }, [onImageLoad])

  const handleError = useCallback(() => {
    if (!isMountedRef.current) return  // Prevent state update on unmounted
    setHasError(true)
    onImageError?.()
  }, [onImageError])

  // Don't render if no URL or error occurred
  if (!imageUrl || hasError) {
    return null
  }

  return (
    <div
      className={cn(
        // Base styles - 16:9 aspect ratio container
        "relative w-full overflow-hidden rounded-xl",
        // Responsive heights: 200px mobile, 250px tablet, 300px desktop
        "h-[200px] sm:h-[250px] md:h-[300px]",
        // Skeleton background while loading
        !isLoaded && "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900",
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
              <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-600 animate-pulse" />
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
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="absolute inset-0"
        style={{ willChange: isLoaded ? 'auto' : 'opacity' }}
      >
        <NextImage
          src={imageUrl}
          alt={`Cover image for lesson: ${lessonTitle}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px"
          className="object-cover"
          onLoad={handleLoad}
          onError={handleError}
          priority // Hero image should load immediately
        />
      </motion.div>

      {/* Optional gradient overlay with title */}
      {showOverlay && isLoaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
        >
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
            {sectionTitle && (
              <p className="text-white/80 text-sm font-medium mb-1">
                {sectionTitle}
              </p>
            )}
            <h2 className="text-white text-lg sm:text-xl md:text-2xl font-bold line-clamp-2">
              {lessonTitle}
            </h2>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default LessonCoverHero
