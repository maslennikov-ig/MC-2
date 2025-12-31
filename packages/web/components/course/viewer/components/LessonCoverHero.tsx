"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import NextImage from "next/image"
import { ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface LessonCoverHeroProps {
  /** URL of the cover image (from Supabase Storage) */
  imageUrl?: string | null
  /** Lesson title for alt text and optional overlay */
  lessonTitle: string
  /** Section/module title for optional overlay */
  sectionTitle?: string
  /** Show gradient overlay with title */
  showOverlay?: boolean
  /** Callback when image loads successfully */
  onImageLoad?: () => void
  /** Callback when image fails to load */
  onImageError?: () => void
  /** Additional CSS classes */
  className?: string
}

/**
 * LessonCoverHero - Hero banner component for lesson cover images
 *
 * Displays a 16:9 aspect ratio hero image at the top of lesson content.
 * Features:
 * - Responsive height (200px mobile, 250px tablet, 300px desktop)
 * - Fade-in animation with skeleton loader
 * - Optional gradient overlay with lesson title
 * - Dark/light theme support
 * - Priority loading for above-the-fold content
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
