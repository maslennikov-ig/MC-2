/**
 * Centralized timeout configuration for the application
 * All timeout values in milliseconds
 */

export const TIMEOUTS = {
  // UI Transitions
  UI: {
    TOAST_DURATION: 4000,
    MODAL_ANIMATION: 200,
    DROPDOWN_DELAY: 150,
    TOOLTIP_DELAY: 500,
    LOADING_SPINNER_DELAY: 300,
  },
  
  // API Requests
  API: {
    DEFAULT: 30000, // 30 seconds
    UPLOAD: 120000, // 2 minutes for file uploads
    GENERATION: 300000, // 5 minutes for course generation
    WEBHOOK: 60000, // 1 minute for webhook calls
  },
  
  // Debounce/Throttle
  INPUT: {
    SEARCH_DEBOUNCE: 300,
    FILTER_DEBOUNCE: 200,
    SCROLL_THROTTLE: 100,
    RESIZE_DEBOUNCE: 250,
  },
  
  // Polling & Refresh
  POLLING: {
    COURSE_STATUS: 5000, // Check course generation status every 5 seconds
    NOTIFICATIONS: 30000, // Check notifications every 30 seconds
    SESSION_REFRESH: 600000, // Refresh session every 10 minutes
  },
  
  // Redirects & Navigation
  NAVIGATION: {
    AUTO_REDIRECT: 2000, // Auto redirect after success
    ERROR_REDIRECT: 3000, // Redirect after error display
    PAGE_TRANSITION: 300,
  },
  
  // Cache
  CACHE: {
    LOCAL_STORAGE: 86400000, // 24 hours
    SESSION_STORAGE: 3600000, // 1 hour
    MEMORY_CACHE: 300000, // 5 minutes
  },
  
  // Testing (only used in test environment)
  TEST: {
    PERFORMANCE_MEASURE: 2000,
    LAYOUT_SHIFT_MEASURE: 2000,
    FCP_MEASURE: 3000,
    MOCK_DELAY: 500,
  }
} as const

// Helper function to get timeout with fallback
export function getTimeout(path: string, fallback = 5000): number {
  const keys = path.split('.')
  let value: unknown = TIMEOUTS
  
  for (const key of keys) {
    if (typeof value === 'object' && value !== null && key in value) {
      value = (value as Record<string, unknown>)[key]
    } else {
      return fallback
    }
  }
  
  return typeof value === 'number' ? value : fallback
}