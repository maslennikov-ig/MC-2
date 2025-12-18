'use client'

import { useEffect, useRef, useState } from 'react'

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
}

interface SwipeOptions {
  threshold?: number
  preventDefaultTouchmoveEvent?: boolean
}

export function useSwipe(
  handlers: SwipeHandlers,
  options: SwipeOptions = {}
) {
  const { threshold = 50, preventDefaultTouchmoveEvent = false } = options
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!touchStart || !touchEnd) return

    const distanceX = touchStart.x - touchEnd.x
    const distanceY = touchStart.y - touchEnd.y
    const isLeftSwipe = distanceX > threshold
    const isRightSwipe = distanceX < -threshold
    const isUpSwipe = distanceY > threshold
    const isDownSwipe = distanceY < -threshold

    // Determine if it's a horizontal or vertical swipe
    const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY)

    if (isHorizontalSwipe) {
      if (isLeftSwipe && handlers.onSwipeLeft) {
        handlers.onSwipeLeft()
      } else if (isRightSwipe && handlers.onSwipeRight) {
        handlers.onSwipeRight()
      }
    } else {
      if (isUpSwipe && handlers.onSwipeUp) {
        handlers.onSwipeUp()
      } else if (isDownSwipe && handlers.onSwipeDown) {
        handlers.onSwipeDown()
      }
    }
  }, [touchEnd, touchStart, threshold, handlers])

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    })
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (preventDefaultTouchmoveEvent) {
      e.preventDefault()
    }
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    })
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    // Reset states after handling swipe
    setTouchStart(null)
    setTouchEnd(null)
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    elementRef
  }
}