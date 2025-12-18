// API and Async Operations
export * from './use-api'

// UI State Management
export * from './use-debounce'
export * from './use-local-storage'

// Browser APIs
export * from './use-intersection-observer'
export * from './use-keyboard-shortcut'
export * from './use-media-query'
export * from './use-reduced-motion'

// Re-export commonly used combinations
export { useApi, useMutation, useAsyncOperation } from './use-api'
export { useDebounce, useDebouncedCallback } from './use-debounce'
export { useLocalStorage, useSessionStorage } from './use-local-storage'
export { 
  useIntersectionObserver, 
  useLazyLoad, 
  useIntersectionObserverMultiple 
} from './use-intersection-observer'
export { 
  useKeyboardShortcut, 
  useGlobalKeyboardShortcut, 
  useCommonShortcuts 
} from './use-keyboard-shortcut'