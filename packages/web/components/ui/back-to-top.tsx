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
      behavior: 'smooth'
    })
  }

  if (!isVisible) return null

  return (
    <button
      onClick={scrollToTop}
      className={cn(
        'fixed bottom-5 right-5 z-50',
        'bg-purple-600 hover:bg-purple-700 text-white',
        'w-12 h-12 min-w-[44px] min-h-[44px]', // Mobile touch target size
        'rounded-full shadow-lg',
        'flex items-center justify-center',
        'transition-all duration-300 ease-in-out',
        'opacity-0 translate-y-2 pointer-events-none',
        'hover:scale-110 active:scale-95',
        'md:w-14 md:h-14', // Larger on desktop
        isVisible && 'opacity-100 translate-y-0 pointer-events-auto',
        className
      )}
      aria-label="Вернуться наверх"
      title="Вернуться наверх"
    >
      <ArrowUp className="w-5 h-5 md:w-6 md:h-6" />
    </button>
  )
}