import { useState, useEffect, useRef, RefObject } from 'react'

interface UseIntersectionObserverProps {
  threshold?: number | number[]
  root?: Element | null
  rootMargin?: string
  freezeOnceVisible?: boolean
}

export function useIntersectionObserver<T extends Element = HTMLDivElement>(
  options: UseIntersectionObserverProps = {}
): [RefObject<T | null>, boolean] {
  const {
    threshold = 0,
    root = null,
    rootMargin = '0%',
    freezeOnceVisible = false
  } = options

  const elementRef = useRef<T | null>(null)
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isElementIntersecting = entry.isIntersecting
        setIsIntersecting(isElementIntersecting)

        if (freezeOnceVisible && isElementIntersecting) {
          observer.unobserve(element)
        }
      },
      { threshold, root, rootMargin }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [threshold, root, rootMargin, freezeOnceVisible])

  return [elementRef, isIntersecting]
}

/**
 * Hook for lazy loading images or components
 */
export function useLazyLoad<T extends Element = HTMLDivElement>(
  rootMargin: string = '50px'
): [RefObject<T | null>, boolean] {
  return useIntersectionObserver<T>({
    rootMargin,
    freezeOnceVisible: true
  })
}

/**
 * Hook for tracking visibility of multiple elements
 */
export function useIntersectionObserverMultiple<T extends Element = HTMLElement>(
  options: UseIntersectionObserverProps = {}
) {
  const [elements, setElements] = useState<Map<T, boolean>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)

  const {
    threshold = 0,
    root = null,
    rootMargin = '0%'
  } = options

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setElements(prev => {
          const newMap = new Map(prev)
          entries.forEach(entry => {
            newMap.set(entry.target as T, entry.isIntersecting)
          })
          return newMap
        })
      },
      { threshold, root, rootMargin }
    )

    return () => {
      observerRef.current?.disconnect()
    }
  }, [threshold, root, rootMargin])

  const observe = (element: T) => {
    if (observerRef.current && element) {
      observerRef.current.observe(element)
      setElements(prev => new Map(prev).set(element, false))
    }
  }

  const unobserve = (element: T) => {
    if (observerRef.current && element) {
      observerRef.current.unobserve(element)
      setElements(prev => {
        const newMap = new Map(prev)
        newMap.delete(element)
        return newMap
      })
    }
  }

  return {
    elements,
    observe,
    unobserve
  }
}