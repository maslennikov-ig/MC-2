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
}

interface UseSmoothProgressResult {
  /** Smoothed visual progress (0-100) */
  progress: number
  /** Is currently animating toward target */
  isAnimating: boolean
}

export function useSmoothProgress({
  targetProgress,
  speed = 0.1,
  minIncrement = 0.5,
  maxBeforeComplete = 95,
  isComplete = false,
}: UseSmoothProgressOptions): UseSmoothProgressResult {
  const [progress, setProgress] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const frameRef = useRef<number>(undefined)
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    // Immediate completion
    if (isComplete) {
      setProgress(100)
      setIsAnimating(false)
      return
    }

    // Cap target at maxBeforeComplete until isComplete
    const cappedTarget = Math.min(targetProgress, maxBeforeComplete)

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const deltaTime = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      setProgress((current) => {
        if (current >= cappedTarget) {
          setIsAnimating(false)
          return current
        }

        // Exponential easing toward target
        const diff = cappedTarget - current
        const increment = Math.max(diff * speed * (deltaTime / 16), minIncrement)
        const next = Math.min(current + increment, cappedTarget)

        return next
      })

      frameRef.current = requestAnimationFrame(animate)
    }

    setIsAnimating(true)
    lastTimeRef.current = 0
    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [targetProgress, speed, minIncrement, maxBeforeComplete, isComplete])

  return { progress, isAnimating }
}
