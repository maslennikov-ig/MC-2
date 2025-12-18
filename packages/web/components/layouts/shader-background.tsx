"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import WebGLErrorBoundary from "./webgl-error-boundary"
import { getOptimizedShaderSettings, shouldDisableWebGLShaders } from "@/lib/device-detection"

// Dynamically import with SSR disabled
const MeshGradient = dynamic(
  () => import("@paper-design/shaders-react").then(mod => {
    // Create wrapper component to filter props
    interface ShaderProps {
      className?: string
      colors?: string[]
      speed?: number
      bgColor?: string
      useWireframe?: boolean
    }
    
    const Component = ({ className, colors, speed, bgColor, useWireframe }: ShaderProps) => {
      const MeshGradientComponent = mod.MeshGradient
      
      // Create props object with only valid props
      const props: Record<string, unknown> = {
        className,
        colors,
        speed
      }
      
      // Add optional props if they exist
      if (bgColor) props.backgroundcolor = bgColor
      if (useWireframe) props.wireframe = "true"
      
      return <MeshGradientComponent {...props} />
    }
    return Component
  }),
  { 
    ssr: false,
    loading: () => <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-black via-purple-900 to-black" />
  }
)

interface ShaderBackgroundProps {
  children: React.ReactNode
}

export default function ShaderBackground({ children }: ShaderBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isClient, setIsClient] = useState(false)
  const [shaderSettings, setShaderSettings] = useState(getOptimizedShaderSettings())
  const [disableShaders, setDisableShaders] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    // Set client flag when component mounts
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
      window.removeEventListener('resize', handleResize)
      // Force cleanup of WebGL contexts
      setIsClient(false)
    }
  }, [])

  return (
    <div ref={containerRef} className="min-h-screen bg-black relative overflow-hidden">
      {/* SVG Filters */}
      <svg className="absolute inset-0 w-0 h-0">
        <defs>
          <filter id="glass-effect" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.005" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02
                      0 1 0 0 0.02
                      0 0 1 0 0.05
                      0 0 0 0.9 0"
              result="tint"
            />
          </filter>
          <filter id="gooey-filter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Background Shader - Only render on client */}
      {isClient && !disableShaders ? (
        <WebGLErrorBoundary
          fallback={
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-black via-purple-900 to-black" />
          }
        >
          <MeshGradient
            className="absolute inset-0 w-full h-full"
            colors={["#000000", "#8b5cf6", "#ffffff", "#1e1b4b", "#4c1d95"]}
            speed={shaderSettings.speed}
            bgColor="#000000"
          />
        </WebGLErrorBoundary>
      ) : (
        // CSS Gradient Fallback for mobile/low-end devices
        <div className="absolute inset-0 w-full h-full">
          <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-900 to-black" />
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/20 via-transparent to-purple-600/10" />
          <div className="absolute inset-0 animate-pulse-slow bg-gradient-to-bl from-violet-900/10 via-transparent to-purple-800/10" />
        </div>
      )}

      {children}
    </div>
  )
}