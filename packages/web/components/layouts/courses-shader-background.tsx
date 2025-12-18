"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import WebGLErrorBoundary from "./webgl-error-boundary"
import FloatingParticles from "./floating-particles"
import { getOptimizedShaderSettings, shouldDisableWebGLShaders } from "@/lib/device-detection"

// Dynamically import with SSR disabled
const MeshGradient = dynamic(
  () => import("@paper-design/shaders-react").then(mod => {
    interface ShaderProps {
      className?: string
      colors?: string[]
      speed?: number
      bgColor?: string
      useWireframe?: boolean
      distortion?: number
      swirl?: number
    }
    
    const Component = ({ className, colors, speed, bgColor, useWireframe, distortion, swirl }: ShaderProps) => {
      const MeshGradientComponent = mod.MeshGradient
      
      const props: Record<string, unknown> = {
        className,
        colors,
        speed,
        distortion,
        swirl
      }
      
      if (bgColor) props.backgroundcolor = bgColor
      if (useWireframe) props.wireframe = "true"
      
      return <MeshGradientComponent {...props} />
    }
    return Component
  }),
  { 
    ssr: false,
    loading: () => <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900" />
  }
)

interface CoursesShaderBackgroundProps {
  children: React.ReactNode
}

export default function CoursesShaderBackground({ children }: CoursesShaderBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isClient, setIsClient] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [shaderSettings, setShaderSettings] = useState(getOptimizedShaderSettings())
  const [disableShaders, setDisableShaders] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => {
      if (mountedRef.current) {
        setPrefersReducedMotion(e.matches)
      }
    }
    
    mediaQuery.addEventListener('change', handleChange)
    setIsClient(true)
    
    // Check if we should disable shaders for performance
    const shouldDisable = shouldDisableWebGLShaders()
    setDisableShaders(shouldDisable)
    
    // Get optimized settings
    const settings = getOptimizedShaderSettings()
    setShaderSettings(settings)
    
    // Debounced resize handler to reduce WebGL checks
    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (mountedRef.current) {
          const shouldDisable = shouldDisableWebGLShaders()
          setDisableShaders(shouldDisable)
          setShaderSettings(getOptimizedShaderSettings())
        }
      }, 250) // Debounce by 250ms
    }
    
    window.addEventListener('resize', handleResize)
    
    return () => {
      mountedRef.current = false
      clearTimeout(resizeTimeout)
      mediaQuery.removeEventListener('change', handleChange)
      window.removeEventListener('resize', handleResize)
      // Force cleanup of WebGL contexts
      setIsClient(false)
    }
  }, [])

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-900 relative overflow-hidden">
      {/* Enhanced SVG Filters for glass effects */}
      <svg className="absolute inset-0 w-0 h-0">
        <defs>
          {/* Enhanced glass effect with subtle distortion */}
          <filter id="courses-glass-effect" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.003" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.5" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.05
                      0 1 0 0 0.05
                      0 0 1 0 0.1
                      0 0 0 0.95 0"
              result="tint"
            />
          </filter>
          
          {/* Gooey filter for organic card transitions */}
          <filter id="courses-gooey" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
          
          {/* Shimmer effect for interactive elements */}
          <filter id="courses-shimmer">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Single Shader Background with CSS layers - Only render on client */}
      {isClient && !disableShaders ? (
        <WebGLErrorBoundary
          fallback={
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900" />
          }
        >
          {/* Single WebGL context with combined colors */}
          <div className="absolute inset-0 z-0">
            <MeshGradient
              className="absolute inset-0 w-full h-full"
              colors={["#0f172a", "#581c87", "#7c3aed", "#3b82f6", "#14b8a6"]}
              speed={prefersReducedMotion ? 0 : shaderSettings.speed * 0.5}
              distortion={shaderSettings.distortion}
              swirl={shaderSettings.swirl}
              bgColor="#0f172a"
            />
          </div>

          {/* CSS overlay layers for depth without additional WebGL contexts */}
          <div className="absolute inset-0 z-10 bg-gradient-to-tr from-purple-900/30 via-transparent to-purple-600/20 animate-pulse-slow" />
          <div className="absolute inset-0 z-20 bg-gradient-to-bl from-blue-900/20 via-transparent to-cyan-800/20 animate-pulse-slower" />
          <div className="absolute inset-0 z-30 bg-gradient-radial from-transparent via-gray-900/30 to-gray-900/60" />
        </WebGLErrorBoundary>
      ) : (
        // CSS Gradient Fallback for mobile/low-end devices
        <div className="absolute inset-0 w-full h-full">
          {/* Base gradient layer */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900" />
          
          {/* Purple accent layer */}
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/30 via-transparent to-purple-600/20 animate-pulse-slow" />
          
          {/* Blue accent layer */}
          <div className="absolute inset-0 bg-gradient-to-bl from-blue-900/20 via-transparent to-cyan-800/20 animate-pulse-slower" />
          
          {/* Subtle overlay for depth */}
          <div className="absolute inset-0 bg-gradient-radial from-transparent via-gray-900/50 to-gray-900/80" />
        </div>
      )}

      {/* Floating particles for additional depth */}
      {isClient && !prefersReducedMotion && !disableShaders && (
        <div className="absolute inset-0 z-35">
          <FloatingParticles count={shaderSettings.particleCount} />
        </div>
      )}

      {/* Content overlay with enhanced glass morphism */}
      <div className="relative z-40">
        {children}
      </div>
    </div>
  )
}