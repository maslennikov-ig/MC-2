'use client'

import React, { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BackToTopProps {
  threshold?: number
  className?: string
}

export function BackToTop({ threshold = 300, className }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      setIsVisible(scrollTop > threshold)
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll() // Check initial state

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [threshold])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  if (!isVisible) return null

  return (
    <button
      onClick={scrollToTop}
      className={cn(
        'fixed right-5 bottom-5 z-50',
        'bg-purple-600 text-white hover:bg-purple-700',
        'h-12 min-h-[44px] w-12 min-w-[44px]', // Mobile touch target size
        'rounded-full shadow-lg',
        'flex items-center justify-center',
        'transition-all duration-300 ease-in-out',
        'pointer-events-none translate-y-2 opacity-0',
        'hover:scale-110 active:scale-95',
        'md:h-14 md:w-14', // Larger on desktop
        isVisible && 'pointer-events-auto translate-y-0 opacity-100',
        className
      )}
      aria-label="Вернуться наверх"
      title="Вернуться наверх"
    >
      <ArrowUp className="h-5 w-5 md:h-6 md:w-6" />
    </button>
  )
}
