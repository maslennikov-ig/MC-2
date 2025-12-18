'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { User } from 'lucide-react'

interface ProfileMenuErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ProfileMenuErrorBoundaryProps {
  children: React.ReactNode
  darkMode?: boolean
}

export class ProfileMenuErrorBoundary extends React.Component<
  ProfileMenuErrorBoundaryProps,
  ProfileMenuErrorBoundaryState
> {
  constructor(props: ProfileMenuErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ProfileMenuErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {
    // Profile menu error caught - gracefully degraded to fallback UI
    // In production, this would be sent to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return (
        <Button 
          variant="ghost" 
          size="sm" 
          disabled
          className={`relative h-10 w-10 rounded-full min-h-[44px] min-w-[44px] ${
            this.props.darkMode ? 'text-white/50' : 'text-muted-foreground'
          }`}
          aria-label="Профиль недоступен"
          title="Произошла ошибка при загрузке профиля"
        >
          <User className="h-4 w-4" />
        </Button>
      )
    }

    return this.props.children
  }
}