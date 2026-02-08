import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  X,
  RefreshCw,
  HelpCircle,
} from 'lucide-react'
import { Button } from './button'

// Error message variants
const errorVariants = cva('flex items-start gap-3 p-4 rounded-lg border text-sm', {
  variants: {
    variant: {
      error: 'bg-destructive/10 border-destructive/20 text-destructive',
      warning:
        'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/20 text-[hsl(var(--warning-foreground))]',
      info: 'bg-[hsl(var(--info))]/10 border-[hsl(var(--info))]/20 text-[hsl(var(--info-foreground))]',
      success:
        'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/20 text-[hsl(var(--success-foreground))]',
    },
    size: {
      sm: 'p-3 text-xs',
      default: 'p-4 text-sm',
      lg: 'p-5 text-base',
    },
  },
  defaultVariants: {
    variant: 'error',
    size: 'default',
  },
})

interface ErrorMessageProps extends VariantProps<typeof errorVariants> {
  children: React.ReactNode
  className?: string
  icon?: React.ReactNode
  showIcon?: boolean
  dismissible?: boolean
  onDismiss?: () => void
  action?: {
    label: string
    onClick: () => void
  }
}

export function ErrorMessage({
  children,
  className,
  variant = 'error',
  size = 'default',
  icon,
  showIcon = true,
  dismissible = false,
  onDismiss,
  action,
}: ErrorMessageProps) {
  const getDefaultIcon = () => {
    switch (variant) {
      case 'error':
        return <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      case 'warning':
        return <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      case 'info':
        return <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
      case 'success':
        return <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      default:
        return <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
    }
  }

  return (
    <div className={cn(errorVariants({ variant, size }), className)} role="alert">
      {showIcon && (icon || getDefaultIcon())}
      <div className="flex-1 space-y-2">
        <div>{children}</div>
        {action && (
          <Button
            variant="outline"
            size="sm"
            onClick={action.onClick}
            className={cn(
              'h-7 px-2 text-xs',
              variant === 'error' && 'border-destructive/30 hover:border-destructive/50',
              variant === 'warning' &&
                'border-[hsl(var(--warning))]/30 hover:border-[hsl(var(--warning))]/50',
              variant === 'info' &&
                'border-[hsl(var(--info))]/30 hover:border-[hsl(var(--info))]/50',
              variant === 'success' &&
                'border-[hsl(var(--success))]/30 hover:border-[hsl(var(--success))]/50'
            )}
          >
            {action.label}
          </Button>
        )}
      </div>
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            'rounded p-1 text-current/60 transition-colors hover:text-current',
            'hover:bg-current/10'
          )}
          aria-label="Закрыть"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

// Specific error message components
interface FieldErrorProps {
  message: string
  className?: string
}

export function FieldError({ message, className }: FieldErrorProps) {
  return (
    <ErrorMessage
      variant="error"
      size="sm"
      showIcon
      className={cn('border-0 bg-transparent p-0', className)}
    >
      {message}
    </ErrorMessage>
  )
}

interface FormErrorProps {
  title?: string
  message: string
  details?: string[]
  onRetry?: () => void
  className?: string
}

export function FormError({
  title = 'Ошибка отправки формы',
  message,
  details,
  onRetry,
  className,
}: FormErrorProps) {
  return (
    <ErrorMessage
      variant="error"
      className={className}
      action={onRetry ? { label: 'Попробовать еще раз', onClick: onRetry } : undefined}
    >
      <div className="space-y-1">
        <div className="font-medium">{title}</div>
        <div>{message}</div>
        {details && details.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs opacity-80">
            {details.map((detail, index) => (
              <li key={index} className="flex items-center gap-1">
                <span className="h-1 w-1 flex-shrink-0 rounded-full bg-current" />
                {detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ErrorMessage>
  )
}

interface ApiErrorProps {
  error: Error | { message: string; code?: string; status?: number }
  onRetry?: () => void
  className?: string
}

export function ApiError({ error, onRetry, className }: ApiErrorProps) {
  const getErrorMessage = () => {
    if ('status' in error) {
      switch (error.status) {
        case 400:
          return 'Некорректный запрос. Проверьте введенные данные.'
        case 401:
          return 'Требуется авторизация. Пожалуйста, войдите в систему.'
        case 403:
          return 'Недостаточно прав для выполнения операции.'
        case 404:
          return 'Запрашиваемый ресурс не найден.'
        case 422:
          return 'Ошибка валидации данных.'
        case 429:
          return 'Слишком много запросов. Попробуйте позже.'
        case 500:
          return 'Внутренняя ошибка сервера. Попробуйте позже.'
        case 503:
          return 'Сервис временно недоступен.'
        default:
          return error.message || 'Произошла неизвестная ошибка.'
      }
    }
    return error.message || 'Произошла ошибка при выполнении запроса.'
  }

  const getErrorTitle = () => {
    if ('status' in error && error.status) {
      return `Ошибка ${error.status}`
    }
    return 'Ошибка API'
  }

  return (
    <FormError
      title={getErrorTitle()}
      message={getErrorMessage()}
      onRetry={onRetry}
      className={className}
    />
  )
}

interface NetworkErrorProps {
  onRetry?: () => void
  className?: string
}

export function NetworkError({ onRetry, className }: NetworkErrorProps) {
  return (
    <FormError
      title="Проблема с подключением"
      message="Не удается подключиться к серверу. Проверьте интернет-соединение."
      onRetry={onRetry}
      className={className}
    />
  )
}

interface ValidationErrorProps {
  errors: Record<string, string[]>
  className?: string
}

export function ValidationError({ errors, className }: ValidationErrorProps) {
  const allErrors = Object.entries(errors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`)
  )

  return (
    <FormError
      title="Ошибки валидации"
      message="Пожалуйста, исправьте следующие ошибки:"
      details={allErrors}
      className={className}
    />
  )
}

// Page-level error boundaries
interface PageErrorProps {
  title?: string
  message?: string
  onRetry?: () => void
  onGoHome?: () => void
  className?: string
}

export function PageError({
  title = 'Что-то пошло не так',
  message = 'Произошла неожиданная ошибка. Попробуйте обновить страницу или вернуться на главную.',
  onRetry,
  onGoHome,
  className,
}: PageErrorProps) {
  return (
    <div
      className={cn(
        'flex min-h-[400px] flex-col items-center justify-center space-y-6 text-center',
        className
      )}
    >
      <div className="space-y-2">
        <AlertTriangle className="mx-auto h-12 w-12 text-[hsl(var(--warning))]" />
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-muted-foreground max-w-md">{message}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {onRetry && (
          <Button onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Попробовать еще раз
          </Button>
        )}
        {onGoHome && (
          <Button variant="outline" onClick={onGoHome}>
            На главную
          </Button>
        )}
      </div>
    </div>
  )
}

// Empty state component (related to error handling)
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[200px] flex-col items-center justify-center space-y-4 p-6 text-center',
        className
      )}
    >
      <div className="space-y-2">
        {icon || <HelpCircle className="text-muted-foreground mx-auto h-12 w-12" />}
        <h3 className="text-lg font-medium">{title}</h3>
        {description && <p className="text-muted-foreground max-w-md text-sm">{description}</p>}
      </div>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  )
}
