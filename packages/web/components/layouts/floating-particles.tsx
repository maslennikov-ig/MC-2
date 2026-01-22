'use client'

import { useMemo } from 'react'
import * as React from 'react'
import { motion } from 'framer-motion'
import { useTabVisibility } from '@/lib/hooks/use-tab-visibility'
import { useIntersectionObserver } from '@/lib/hooks/use-intersection-observer'

interface ParticleData {
  id: number
  initialX: number
  initialY: number
  size: number
  duration: number
  delay: number
  opacity: number
  xOffset: number
}

interface ParticleItemProps {
  particle: ParticleData
  shouldAnimate: boolean
}

const ParticleItem = React.memo(function ParticleItem({
  particle,
  shouldAnimate,
}: ParticleItemProps) {
  return (
    <motion.div
      className="absolute rounded-full bg-white/20"
      style={{
        width: particle.size,
        height: particle.size,
        left: `${particle.initialX}%`,
        top: `${particle.initialY}%`,
      }}
      animate={
        shouldAnimate
          ? {
              y: [0, -100, 0],
              x: [0, particle.xOffset, 0],
              opacity: [particle.opacity, particle.opacity * 0.3, particle.opacity],
              scale: [1, 1.2, 1],
            }
          : {
              // Static state when paused
              y: 0,
              x: 0,
              opacity: particle.opacity,
              scale: 1,
            }
      }
      transition={{
        duration: particle.duration,
        delay: particle.delay,
        repeat: shouldAnimate ? Infinity : 0,
        ease: 'easeInOut',
      }}
    />
  )
})

interface FloatingParticlesProps {
  count?: number
  className?: string
}

export default function FloatingParticles({ count = 8, className = '' }: FloatingParticlesProps) {
  const isTabVisible = useTabVisibility()
  const [containerRef, isInViewport] = useIntersectionObserver<HTMLDivElement>()

  // Only animate when tab is visible AND element is in viewport
  const shouldAnimate = isTabVisible && isInViewport

  // Memoize particles to prevent re-creation on every render
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        initialX: Math.random() * 100,
        initialY: Math.random() * 100,
        size: Math.random() * 6 + 2,
        duration: Math.random() * 20 + 15,
        delay: Math.random() * 10,
        opacity: Math.random() * 0.4 + 0.1,
        xOffset: Math.random() * 50 - 25,
      })) as ParticleData[],
    [count]
  )

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {particles.map((particle) => (
        <ParticleItem key={particle.id} particle={particle} shouldAnimate={shouldAnimate} />
      ))}
    </div>
  )
}
