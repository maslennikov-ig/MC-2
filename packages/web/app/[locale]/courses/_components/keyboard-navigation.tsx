'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface KeyboardNavigationProps {
  onSearch?: () => void
  onFilter?: () => void
  onViewToggle?: () => void
  onEscape?: () => void
  enabled?: boolean
}

export function useKeyboardNavigation({
  onSearch,
  onFilter,
  onViewToggle,
  onEscape,
  enabled = true
}: KeyboardNavigationProps = {}) {
  const router = useRouter()
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return
    
    // Skip if user is typing in an input or textarea
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      // Allow Escape key even in inputs
      if (event.key === 'Escape') {
        (event.target as HTMLElement).blur()
        onEscape?.()
      }
      return
    }
    
    // Global keyboard shortcuts
    switch (event.key) {
      case '/':
      case 'k':
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          onSearch?.()
        }
        break
        
      case 'f':
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          onFilter?.()
        }
        break
        
      case 'g':
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
          event.preventDefault()
          onViewToggle?.()
        }
        break
        
      case 'Escape':
        event.preventDefault()
        onEscape?.()
        break
        
      case 'h':
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
          event.preventDefault()
          router.push('/')
        }
        break
        
      case 'c':
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
          event.preventDefault()
          router.push('/create')
        }
        break
        
      case 'ArrowLeft':
        if (event.altKey) {
          event.preventDefault()
          // Previous page logic
          const searchParams = new URLSearchParams(window.location.search)
          const currentPage = parseInt(searchParams.get('page') || '1')
          if (currentPage > 1) {
            searchParams.set('page', (currentPage - 1).toString())
            router.push(`/courses?${searchParams.toString()}`)
          }
        }
        break
        
      case 'ArrowRight':
        if (event.altKey) {
          event.preventDefault()
          // Next page logic
          const searchParams = new URLSearchParams(window.location.search)
          const currentPage = parseInt(searchParams.get('page') || '1')
          searchParams.set('page', (currentPage + 1).toString())
          router.push(`/courses?${searchParams.toString()}`)
        }
        break
        
      case '?':
        if (event.shiftKey) {
          event.preventDefault()
          // Show keyboard shortcuts help
          showKeyboardShortcuts()
        }
        break
    }
  }, [enabled, onSearch, onFilter, onViewToggle, onEscape, router])
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

function showKeyboardShortcuts() {
  // Create a modal or toast to show keyboard shortcuts
  const shortcuts = [
    { key: 'Cmd/Ctrl + K', action: 'Открыть поиск' },
    { key: 'Cmd/Ctrl + F', action: 'Открыть фильтры' },
    { key: 'G', action: 'Переключить вид (сетка/список)' },
    { key: 'H', action: 'На главную' },
    { key: 'C', action: 'Создать курс' },
    { key: 'Alt + ←', action: 'Предыдущая страница' },
    { key: 'Alt + →', action: 'Следующая страница' },
    { key: 'Esc', action: 'Закрыть/Отменить' },
    { key: '?', action: 'Показать эту справку' },
  ]
  
  // For now, log to console. In production, show a modal
  console.table(shortcuts)
}

// Accessibility component for screen readers
export function ScreenReaderAnnouncements({ message }: { message?: string }) {
  if (!message) return null
  
  return (
    <div 
      role="status" 
      aria-live="polite" 
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}

// Skip to content link for keyboard navigation
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-purple-600 focus:text-white focus:rounded-md focus:outline-none focus:ring-2 focus:ring-purple-400"
    >
      Перейти к основному содержимому
    </a>
  )
}

// Focus trap for modals and dialogs
export function useFocusTrap(ref: React.RefObject<HTMLElement>, enabled = true) {
  useEffect(() => {
    if (!enabled || !ref.current) return
    
    const element = ref.current
    const focusableElements = element.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }
    
    element.addEventListener('keydown', handleTabKey)
    firstElement?.focus()
    
    return () => {
      element.removeEventListener('keydown', handleTabKey)
    }
  }, [ref, enabled])
}

// Announce page changes for screen readers
export function usePageAnnouncement(pageTitle: string) {
  useEffect(() => {
    const announcement = document.createElement('div')
    announcement.setAttribute('role', 'status')
    announcement.setAttribute('aria-live', 'polite')
    announcement.setAttribute('aria-atomic', 'true')
    announcement.className = 'sr-only'
    announcement.textContent = `Страница загружена: ${pageTitle}`

    document.body.appendChild(announcement)

    let timeoutId: NodeJS.Timeout | undefined

    return () => {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      // Remove the element immediately if it exists
      if (announcement && document.body.contains(announcement)) {
        document.body.removeChild(announcement)
      }
    }
  }, [pageTitle])
}