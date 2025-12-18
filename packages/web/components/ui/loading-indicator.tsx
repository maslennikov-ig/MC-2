import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

const spinnerVariants = cva(
  "animate-spin",
  {
    variants: {
      size: {
        small: "h-3 w-3",
        default: "h-4 w-4", 
        medium: "h-5 w-5",
        large: "h-6 w-6",
        xl: "h-8 w-8",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

export interface SpinnerProps 
  extends VariantProps<typeof spinnerVariants> {
  className?: string
}

export function Spinner({ className, size }: SpinnerProps) {
  return (
    <Loader2 
      className={cn(spinnerVariants({ size, className }))}
    />
  )
}

// Loading state for buttons
interface LoadingButtonProps {
  isLoading: boolean
  children: React.ReactNode
  loadingText?: string
  className?: string
  spinnerSize?: VariantProps<typeof spinnerVariants>['size']
}

export function LoadingButton({ 
  isLoading, 
  children, 
  loadingText, 
  className,
  spinnerSize = "small",
  ...props 
}: LoadingButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button 
      className={cn(
        "inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      disabled={isLoading}
      {...props}
    >
      {isLoading && <Spinner size={spinnerSize} />}
      {isLoading && loadingText ? loadingText : children}
    </button>
  )
}

// Overlay loading state
interface LoadingOverlayProps {
  isLoading: boolean
  children: React.ReactNode
  loadingText?: string
  className?: string
  overlayClassName?: string
}

export function LoadingOverlay({
  isLoading,
  children,
  loadingText = "Loading...",
  className,
  overlayClassName,
}: LoadingOverlayProps) {
  return (
    <div className={cn("relative", className)}>
      {children}
      {isLoading && (
        <div className={cn(
          "absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10",
          overlayClassName
        )}>
          <div className="flex flex-col items-center gap-3">
            <Spinner size="large" />
            {loadingText && (
              <p className="text-sm text-muted-foreground">{loadingText}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Inline loading states
export function InlineLoader({ 
  text = "Loading...", 
  size = "default",
  className 
}: { 
  text?: string
  size?: VariantProps<typeof spinnerVariants>['size']
  className?: string 
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Spinner size={size} />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  )
}

// Page loading state
export function PageLoader({ 
  title = "Loading...",
  description,
  className 
}: {
  title?: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-[200px] gap-4",
      className
    )}>
      <Spinner size="xl" />
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        )}
      </div>
    </div>
  )
}

// Progress loading with percentage
interface ProgressLoaderProps {
  progress: number
  title?: string
  description?: string
  className?: string
}

export function ProgressLoader({
  progress,
  title = "Processing...",
  description,
  className,
}: ProgressLoaderProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-[200px] gap-4",
      className
    )}>
      <div className="relative">
        <Spinner size="xl" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium">{Math.round(progress)}%</span>
        </div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        )}
        <div className="w-64 bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
    </div>
  )
}