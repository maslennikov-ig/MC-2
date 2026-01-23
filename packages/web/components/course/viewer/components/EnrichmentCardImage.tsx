'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Expand } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ImageSkeleton, ImageErrorFallback } from '@/components/ui/image-skeleton'
import { cn } from '@/lib/utils'

interface EnrichmentCardImageProps {
  /** Placeholder image URL from config */
  placeholderImage: string
  /** Actual image URL if exists */
  imageUrl?: string
  /** Alt text for the image */
  altText: string
  /** Whether there's an existing image to show */
  hasImage: boolean
  /** Whether the hover panel is shown */
  shouldShowPanel: boolean
  /** Badge text (e.g., "~45 сек" or "16:9") */
  badgeText: string
  /** Badge icon */
  BadgeIcon: React.ElementType
  /** Badge color class */
  badgeColor: string
  /** Image aspect ratio for lightbox */
  aspectRatio: 'video' | 'square'
  /** Whether generation just completed (show skeleton instead of placeholder) */
  isRecentlyCompleted?: boolean
  /** Callback when image loads (to clear recently completed state) */
  onImageLoaded?: () => void
}

/**
 * Image area of the enrichment card with placeholder/preview and lightbox support.
 * Handles both placeholder images and actual generated content.
 */
export function EnrichmentCardImage({
  placeholderImage,
  imageUrl,
  altText,
  hasImage,
  shouldShowPanel,
  badgeText,
  BadgeIcon,
  badgeColor,
  aspectRatio,
  isRecentlyCompleted = false,
  onImageLoaded,
}: EnrichmentCardImageProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  // Track which URLs have been loaded to avoid flickering on re-renders
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set())
  const [errorUrls, setErrorUrls] = useState<Set<string>>(new Set())
  const isMountedRef = useRef(true)
  const imageRef = useRef<HTMLImageElement>(null)

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Check if image is already loaded from cache on mount/URL change
  // This handles cases where onLoad doesn't fire (cached images, SSR hydration)
  useEffect(() => {
    if (!imageUrl || !hasImage) return

    // Small delay to let the Image component mount and set the ref
    const checkComplete = () => {
      if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
        if (isMountedRef.current && !loadedUrls.has(imageUrl)) {
          setLoadedUrls((prev) => new Set(prev).add(imageUrl))
        }
      }
    }

    // Check immediately and after a short delay (for SSR hydration)
    checkComplete()
    const timeoutId = setTimeout(checkComplete, 100)

    return () => clearTimeout(timeoutId)
  }, [imageUrl, hasImage, loadedUrls])

  // Determine current state based on URL
  const isPlaceholder = !hasImage || !imageUrl
  const isImageLoaded = isPlaceholder || (imageUrl ? loadedUrls.has(imageUrl) : false)
  const hasError = imageUrl ? errorUrls.has(imageUrl) : false

  // Handle keyboard navigation for lightbox
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLightboxOpen) {
        setIsLightboxOpen(false)
      }
    },
    [isLightboxOpen]
  )

  useEffect(() => {
    if (!isLightboxOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isLightboxOpen, handleKeyDown])

  const handleLightboxOpen = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setIsLightboxOpen(true)
  }, [])

  // Safe state updates to prevent memory leaks
  // Track specific URL that was loaded to handle race conditions
  const handleImageLoad = useCallback(() => {
    if (isMountedRef.current && imageUrl) {
      setLoadedUrls((prev) => new Set(prev).add(imageUrl))
      // Notify parent that image loaded (clears "recently completed" state)
      onImageLoaded?.()
    }
  }, [imageUrl, onImageLoaded])

  const handleImageError = useCallback(() => {
    if (isMountedRef.current && imageUrl) {
      setErrorUrls((prev) => new Set(prev).add(imageUrl))
      setLoadedUrls((prev) => new Set(prev).add(imageUrl)) // Also mark as "loaded" to hide skeleton
    }
  }, [imageUrl])

  return (
    <>
      {/* Image Area */}
      <div
        className="relative min-h-[280px] flex-1 overflow-hidden"
        aria-busy={!isImageLoaded && !hasError && !isPlaceholder}
      >
        {/* Skeleton while loading - only for real images, not placeholders */}
        {!isImageLoaded && !hasError && !isPlaceholder && <ImageSkeleton withIcon />}
        {/* Error fallback */}
        {hasError && <ImageErrorFallback />}
        {/* Show actual image if exists, otherwise placeholder */}
        {hasImage && imageUrl ? (
          <>
            <Image
              ref={imageRef}
              key={imageUrl} // Force remount when URL changes to ensure onLoad fires
              src={imageUrl}
              alt={altText}
              fill
              loading="eager"
              unoptimized // Skip Next.js optimization for external URLs - fixes onLoad reliability
              onLoad={handleImageLoad}
              onError={handleImageError}
              className={cn(
                'object-cover transition-all duration-500 motion-reduce:transition-none',
                isImageLoaded && !hasError ? 'opacity-100' : 'opacity-0',
                shouldShowPanel && 'scale-105 brightness-90 dark:brightness-75'
              )}
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            />
            {/* Lightbox button overlay */}
            <button
              type="button"
              onClick={handleLightboxOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleLightboxOpen(e)
                }
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              aria-label="View full image"
            >
              <Expand className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </>
        ) : isRecentlyCompleted ? (
          /* Show skeleton while waiting for data to refetch after generation completes */
          <ImageSkeleton withIcon />
        ) : (
          /* Placeholder image - show immediately, no loading state needed */
          <Image
            src={placeholderImage}
            alt={altText}
            fill
            priority
            className={cn(
              'object-cover transition-all duration-300 motion-reduce:transition-none',
              'grayscale group-hover:grayscale-0',
              shouldShowPanel && 'scale-105 brightness-90 dark:brightness-75'
            )}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
          />
        )}

        {/* Gradient at bottom of image for dark theme */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent dark:from-black/60" />

        {/* Badge over image */}
        <div className="absolute top-4 left-4">
          <Badge
            className={cn(
              'border backdrop-blur-sm',
              'bg-white/90 dark:bg-slate-900/90',
              badgeColor
            )}
          >
            <BadgeIcon className="mr-1 h-3 w-3" aria-hidden="true" />
            {badgeText}
          </Badge>
        </div>
      </div>

      {/* Lightbox Dialog */}
      {hasImage && imageUrl && (
        <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
          <DialogContent className="max-w-4xl p-2">
            <DialogTitle className="sr-only">{altText}</DialogTitle>
            <div
              className={cn(
                'relative w-full',
                aspectRatio === 'video' ? 'aspect-video' : 'aspect-square'
              )}
            >
              <Image
                src={imageUrl}
                alt={altText}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 900px"
                priority
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
