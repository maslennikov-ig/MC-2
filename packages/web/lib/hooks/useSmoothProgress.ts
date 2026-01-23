'use client'

import { useState, useEffect, useRef } from 'react'

interface UseSmoothProgressOptions {
  /** Actual progress from API (0-100) */
  targetProgress: number
  /** Interpolation speed (higher = faster). Default: 0.1 */
  speed?: number
  /** Minimum increment per tick. Default: 0.5 */
  minIncrement?: number
  /** Maximum value before completion (prevents 100% until done). Default: 95 */
  maxBeforeComplete?: number
  /** Is the operation complete? */
  isComplete?: boolean

  // Asymptotic crawl options
  /** Enable slow crawl toward next milestone when progress is stalled */
  enableAsymptoticCrawl?: boolean
  /** Next progress milestone to crawl toward (never exceed this - 5%) */
  nextMilestone?: number
  /** Delay before starting crawl after progress stalls (ms). Default: 3000 */
  crawlDelay?: number
  /** Crawl increment per tick (0.1-0.3%). Default: 0.15 */
  crawlIncrement?: number
}

interface UseSmoothProgressResult {
  /** Smoothed visual progress (0-100) */
  progress: number
  /** Is currently animating toward target */
  isAnimating: boolean
  /** Is currently in asymptotic crawl mode */
  isCrawling: boolean
}

export function useSmoothProgress({
  targetProgress,
  speed = 0.1,
  minIncrement = 0.5,
  maxBeforeComplete = 95,
  isComplete = false,
  enableAsymptoticCrawl = false,
  nextMilestone,
  crawlDelay = 3000,
  crawlIncrement = 0.15,
}: UseSmoothProgressOptions): UseSmoothProgressResult {
  const [progress, setProgress] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isCrawling, setIsCrawling] = useState(false)
  const frameRef = useRef<number>(undefined)
  const lastTimeRef = useRef<number>(0)
  const lastTargetChangeRef = useRef<number>(Date.now())
  const lastCrawlTickRef = useRef<number>(0)

  // Track when targetProgress changes
  useEffect(() => {
    lastTargetChangeRef.current = Date.now()
    setIsCrawling(false)
  }, [targetProgress])

  useEffect(() => {
    // Immediate completion
    if (isComplete) {
      setProgress(100)
      setIsAnimating(false)
      setIsCrawling(false)
      return
    }

    // Cap target at maxBeforeComplete until isComplete
    const cappedTarget = Math.min(targetProgress, maxBeforeComplete)

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const deltaTime = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      setProgress((current) => {
        // Check if we've reached the capped target
        if (current >= cappedTarget) {
          setIsAnimating(false)

          // Check if asymptotic crawl should activate
          if (
            enableAsymptoticCrawl &&
            nextMilestone !== undefined &&
            nextMilestone > cappedTarget
          ) {
            const timeSinceTargetChange = Date.now() - lastTargetChangeRef.current
            const timeSinceLastCrawlTick = timestamp - lastCrawlTickRef.current

            // Activate crawl after crawlDelay
            if (timeSinceTargetChange >= crawlDelay) {
              setIsCrawling(true)

              // Apply crawl increment every 500ms
              if (timeSinceLastCrawlTick >= 500) {
                lastCrawlTickRef.current = timestamp
                const crawlCap = nextMilestone - 5 // Leave 5% buffer
                if (current < crawlCap) {
                  return Math.min(current + crawlIncrement, crawlCap)
                }
              }
            }
          }

          return current
        }

        // Normal exponential easing toward target
        setIsCrawling(false)
        const diff = cappedTarget - current
        const increment = Math.max(diff * speed * (deltaTime / 16), minIncrement)
        const next = Math.min(current + increment, cappedTarget)

        return next
      })

      frameRef.current = requestAnimationFrame(animate)
    }

    setIsAnimating(true)
    lastTimeRef.current = 0
    lastCrawlTickRef.current = 0
    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [
    targetProgress,
    speed,
    minIncrement,
    maxBeforeComplete,
    isComplete,
    enableAsymptoticCrawl,
    nextMilestone,
    crawlDelay,
    crawlIncrement,
  ])

  return { progress, isAnimating, isCrawling }
}
