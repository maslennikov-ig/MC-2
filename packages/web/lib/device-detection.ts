/**
 * Device detection utilities for performance optimization
 */

/**
 * Check if the current device is mobile based on viewport width
 */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 768
}

/**
 * Check if the device is low-end based on hardware concurrency
 */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  // Hardware concurrency <= 4 indicates a low-end device
  // Also check for undefined (some browsers don't support it)
  const cores = navigator.hardwareConcurrency
  return !cores || cores <= 4
}

// Cache WebGL availability to avoid creating multiple contexts
let webglAvailabilityCache: boolean | null = null

/**
 * Check if WebGL is available and performant
 */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false
  
  // Return cached result if available
  if (webglAvailabilityCache !== null) {
    return webglAvailabilityCache
  }
  
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) || 
               canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true })
    
    // Properly dispose of the test context
    if (gl && 'getExtension' in gl) {
      const loseContext = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')
      if (loseContext) {
        loseContext.loseContext()
      }
    }
    
    // Clean up the canvas
    canvas.width = 1
    canvas.height = 1
    
    // Cache the result
    webglAvailabilityCache = !!gl
    return webglAvailabilityCache
  } catch {
    webglAvailabilityCache = false
    return false
  }
}

/**
 * Reset WebGL cache (useful for testing or when context changes)
 */
export function resetWebGLCache(): void {
  webglAvailabilityCache = null
}

/**
 * Check if the user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  return mediaQuery.matches
}

/**
 * Comprehensive check if WebGL shaders should be disabled
 * Returns true if shaders should be disabled for performance
 */
export function shouldDisableWebGLShaders(): boolean {
  // Disable on server-side rendering
  if (typeof window === 'undefined') return true
  
  // Check various conditions
  const mobile = isMobileViewport()
  const lowEnd = isLowEndDevice()
  const reducedMotion = prefersReducedMotion()
  const webglUnavailable = !isWebGLAvailable()
  
  // Disable if any of these conditions are met:
  // 1. Mobile viewport AND low-end device
  // 2. User prefers reduced motion
  // 3. WebGL is not available
  // 4. Mobile viewport on iOS (Safari WebGL can be problematic)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
  
  return (
    webglUnavailable ||
    reducedMotion ||
    (mobile && lowEnd) ||
    (mobile && isIOS)
  )
}

/**
 * Get performance-optimized shader settings
 */
export function getOptimizedShaderSettings() {
  const disable = shouldDisableWebGLShaders()
  
  if (disable) {
    return {
      useShaders: false,
      speed: 0,
      distortion: 0,
      swirl: 0,
      particleCount: 0
    }
  }
  
  // For devices that can handle shaders, but might need reduced settings
  const mobile = isMobileViewport()
  const lowEnd = isLowEndDevice()
  
  if (mobile || lowEnd) {
    return {
      useShaders: true,
      speed: 0.1,       // Reduced speed
      distortion: 0.2,  // Reduced distortion
      swirl: 0.1,       // Reduced swirl
      particleCount: 5  // Fewer particles
    }
  }
  
  // Full settings for desktop/high-end devices
  return {
    useShaders: true,
    speed: 0.3,
    distortion: 0.5,
    swirl: 0.4,
    particleCount: 12
  }
}