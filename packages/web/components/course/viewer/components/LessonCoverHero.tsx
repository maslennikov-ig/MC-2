'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import NextImage from 'next/image'
import { ImageIcon, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface LessonCoverHeroProps {
  imageUrl?: string | null
  lessonTitle: string
  sectionTitle?: string
  sectionNumber?: number
  readingTime?: number
  showOverlay?: boolean
  onImageLoad?: () => void
  onImageError?: () => void
  className?: string
}

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
  const t = useTranslations('course.viewer')
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set())
  const [errorUrls, setErrorUrls] = useState<Set<string>>(new Set())
  const isMountedRef = useRef(true)
  const imageRef = useRef<HTMLImageElement>(null)
  const isLoaded = imageUrl ? loadedUrls.has(imageUrl) : false
  const hasError = imageUrl ? errorUrls.has(imageUrl) : false

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

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

  if (!imageUrl || hasError) return null

  return (
    <div
      className={cn(
        'relative aspect-[21/9] max-h-[400px] w-full overflow-hidden rounded-xl',
        !isLoaded &&
          'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900',
        className
      )}
    >
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
          priority
          unoptimized
        />
      </motion.div>
      {showOverlay && isLoaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
        >
          <div className="absolute right-0 bottom-0 left-0 p-4 sm:p-6 md:p-8">
            {sectionTitle && (
              <p className="mb-1 text-sm font-medium text-white/90 drop-shadow-md">
                {sectionNumber
                  ? t('module', { number: sectionNumber, title: sectionTitle })
                  : sectionTitle}
              </p>
            )}
            <h2 className="mb-2 line-clamp-2 text-xl font-bold text-white drop-shadow-lg sm:text-2xl md:text-3xl">
              {lessonTitle}
            </h2>
            {readingTime && (
              <div className="flex items-center gap-1.5 text-sm text-white/80 drop-shadow-md">
                <Clock className="h-4 w-4" />
                <span>{t('readingTime', { minutes: readingTime })}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default LessonCoverHero
