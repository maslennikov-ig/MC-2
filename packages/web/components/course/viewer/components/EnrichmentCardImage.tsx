'use client'

import React, { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { Expand } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
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
}: EnrichmentCardImageProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

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

  return (
    <>
      {/* Image Area */}
      <div className="relative min-h-[280px] flex-1 overflow-hidden">
        {/* Show actual image if exists, otherwise placeholder */}
        {hasImage && imageUrl ? (
          <>
            <Image
              src={imageUrl}
              alt={altText}
              fill
              className={cn(
                'object-cover transition-all duration-500',
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
        ) : (
          /* Placeholder image - grayscale with hover effect to reveal colors */
          <Image
            src={placeholderImage}
            alt={altText}
            fill
            className={cn(
              'object-cover transition-all duration-500',
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
