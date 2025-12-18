import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

// Enhanced skeleton components for common UI patterns

interface CardSkeletonProps {
  className?: string
  showImage?: boolean
  showTags?: boolean
  showProgress?: boolean
}

export function CardSkeleton({ 
  className, 
  showImage = true, 
  showTags = true, 
  showProgress = false 
}: CardSkeletonProps) {
  return (
    <div className={cn("space-y-3 p-4 border rounded-lg", className)}>
      {showImage && <Skeleton className="h-32 w-full rounded-md" />}
      <div className="space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      {showProgress && (
        <div className="space-y-2">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      )}
      {showTags && (
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      )}
    </div>
  )
}

interface FormSkeletonProps {
  fields: number
  showSubmit?: boolean
  className?: string
}

export function FormSkeleton({ 
  fields = 4, 
  showSubmit = true, 
  className 
}: FormSkeletonProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      {showSubmit && (
        <Skeleton className="h-10 w-32" />
      )}
    </div>
  )
}

interface TableSkeletonProps {
  rows?: number
  columns?: number
  showHeader?: boolean
  className?: string
}

export function TableSkeleton({ 
  rows = 5, 
  columns = 4, 
  showHeader = true, 
  className 
}: TableSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {showHeader && (
        <div className="flex gap-4 p-4 border-b">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4">
          {Array.from({ length: columns }, (_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 w-20" />
          ))}
        </div>
      ))}
    </div>
  )
}

interface ListSkeletonProps {
  items?: number
  showAvatar?: boolean
  showActions?: boolean
  className?: string
}

export function ListSkeleton({ 
  items = 5, 
  showAvatar = false, 
  showActions = false, 
  className 
}: ListSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 border rounded-lg">
          {showAvatar && <Skeleton className="h-10 w-10 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          {showActions && (
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface NavigationSkeletonProps {
  items?: number
  showLogo?: boolean
  showActions?: boolean
  className?: string
}

export function NavigationSkeleton({ 
  items = 5, 
  showLogo = true, 
  showActions = true, 
  className 
}: NavigationSkeletonProps) {
  return (
    <div className={cn("flex items-center justify-between p-4 border-b", className)}>
      {showLogo && <Skeleton className="h-8 w-32" />}
      <div className="flex gap-6">
        {Array.from({ length: items }, (_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
      {showActions && (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-20" />
        </div>
      )}
    </div>
  )
}

// Inline loading states for buttons and smaller elements
export function ButtonSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-9 w-20 rounded-md", className)} />
}

export function BadgeSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-5 w-16 rounded-full", className)} />
}

export function AvatarSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-10 w-10 rounded-full", className)} />
}

// Text content skeletons
interface TextSkeletonProps {
  lines?: number
  className?: string
}

export function TextSkeleton({ lines = 3, className }: TextSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton 
          key={i} 
          className={cn("h-4", 
            i === lines - 1 ? "w-2/3" : "w-full"
          )} 
        />
      ))}
    </div>
  )
}