"use client"

import React, { Component, ReactNode } from "react"
import { logger } from "@/lib/logger"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class WebGLErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.devLog("WebGL Error caught:", error, errorInfo)
      
    // Check if it's a WebGL-related error
    if (
      error.message?.includes("WebGL") ||
      error.message?.includes("GL") ||
      error.message?.includes("shader") ||
      error.message?.includes("canvas") ||
      error.stack?.includes("MeshGradient")
    ) {
      // WebGL context lost or shader compilation failed
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-black via-purple-900 to-black">
            <div className="flex items-center justify-center h-full">
              <div className="text-white/60 text-center p-8">
                <p className="text-lg mb-2">WebGL is not available</p>
                <p className="text-sm">Falling back to static gradient</p>
              </div>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}

export default WebGLErrorBoundary