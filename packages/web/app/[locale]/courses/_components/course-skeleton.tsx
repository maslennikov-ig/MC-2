import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'

export function CourseCardSkeleton() {
  return (
    <Card className="overflow-hidden border-slate-800 bg-slate-900/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        {/* Status badges skeleton */}
        <div className="mb-3 flex gap-2">
          <Skeleton className="h-5 w-20 bg-slate-800" />
          <Skeleton className="h-5 w-16 bg-slate-800" />
        </div>

        {/* Title skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-full bg-slate-800" />
          <Skeleton className="h-6 w-3/4 bg-slate-800" />
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {/* Description skeleton */}
        <div className="mb-4 space-y-2">
          <Skeleton className="h-4 w-full bg-slate-800" />
          <Skeleton className="h-4 w-5/6 bg-slate-800" />
        </div>

        {/* Stats grid skeleton */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-800/30 px-3 py-2">
              <Skeleton className="h-4 w-4 bg-slate-700" />
              <div className="flex-1">
                <Skeleton className="mb-1 h-3 w-12 bg-slate-700" />
                <Skeleton className="h-4 w-8 bg-slate-700" />
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar skeleton */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-24 bg-slate-800" />
            <Skeleton className="h-3 w-8 bg-slate-800" />
          </div>
          <Skeleton className="h-2 w-full bg-slate-800" />
        </div>
      </CardContent>

      <CardFooter className="border-t border-slate-800 pt-3 pb-4">
        <div className="flex w-full items-center justify-between">
          {/* Quick actions skeleton */}
          <div className="flex items-center gap-1">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-8 bg-slate-800" />
            ))}
          </div>

          {/* Main button skeleton */}
          <Skeleton className="h-8 w-24 bg-slate-800" />

          {/* More options skeleton */}
          <Skeleton className="h-8 w-8 bg-slate-800" />
        </div>
      </CardFooter>
    </Card>
  )
}

export function CourseGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {[...Array(count)].map((_, i) => (
        <CourseCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function CourseListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {[...Array(count)].map((_, i) => (
        <Card key={i} className="border-slate-800 bg-slate-900/80 backdrop-blur-sm">
          <div className="flex flex-row gap-4 p-6">
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-2">
                <Skeleton className="h-5 w-20 bg-slate-800" />
                <Skeleton className="h-5 w-16 bg-slate-800" />
              </div>
              <Skeleton className="mb-2 h-6 w-3/4 bg-slate-800" />
              <div className="mb-3 space-y-1">
                <Skeleton className="h-4 w-full bg-slate-800" />
                <Skeleton className="h-4 w-5/6 bg-slate-800" />
              </div>
              <div className="flex items-center gap-4">
                {[...Array(3)].map((_, j) => (
                  <Skeleton key={j} className="h-4 w-20 bg-slate-800" />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-24 bg-slate-800" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function CoursesPageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950">
      <div className="relative z-10">
        {/* Header skeleton */}
        <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-32 bg-slate-800" />
              <div className="flex gap-4">
                <Skeleton className="h-10 w-24 bg-slate-800" />
                <Skeleton className="h-10 w-32 bg-slate-800" />
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main className="container mx-auto px-4 py-8">
          {/* Title skeleton */}
          <div className="mb-8 text-center">
            <Skeleton className="mx-auto mb-2 h-10 w-64 bg-slate-800" />
            <Skeleton className="mx-auto h-6 w-96 bg-slate-800" />
          </div>

          {/* Statistics skeleton */}
          <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="text-center">
                  <Skeleton className="mx-auto mb-2 h-8 w-16 bg-slate-800" />
                  <Skeleton className="mx-auto h-4 w-24 bg-slate-800" />
                </div>
              ))}
            </div>
          </div>

          {/* Filters skeleton */}
          <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="flex flex-col gap-4 lg:flex-row">
              <Skeleton className="h-11 max-w-xl flex-1 bg-slate-800" />
              <Skeleton className="h-11 w-full bg-slate-800 sm:w-[200px]" />
              <Skeleton className="h-11 w-full bg-slate-800 sm:w-[200px]" />
              <Skeleton className="h-11 w-[180px] bg-slate-800" />
              <Skeleton className="h-11 w-20 bg-slate-800" />
            </div>
          </div>

          {/* Course grid skeleton */}
          <CourseGridSkeleton count={12} />

          {/* Pagination skeleton */}
          <div className="mt-8 flex justify-center gap-2">
            <Skeleton className="h-10 w-32 bg-slate-800" />
          </div>
        </main>
      </div>
    </div>
  )
}
