import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

function SkeletonCard() {
  return (
    <div className="flex min-h-[280px] animate-pulse flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Top section */}
      <div className="min-h-[160px] flex-1 bg-gray-100 dark:bg-slate-800" />
      {/* Bottom section */}
      <div className="flex flex-col gap-2 p-4">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-2 w-full rounded bg-gray-200 dark:bg-slate-700" />
        <div className="flex items-center justify-between">
          <div className="h-6 w-20 rounded bg-gray-200 dark:bg-slate-700" />
          <div className="h-4 w-12 rounded bg-gray-200 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  )
}

export default function LessonsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <Button variant="ghost" disabled className="mb-4 text-gray-400">
            <ChevronLeft className="mr-2 h-4 w-4" />
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
          </Button>

          <div className="mb-6">
            <div className="mb-2 h-10 w-2/3 animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700" />
            <div className="h-6 w-1/4 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
          </div>

          {/* Filter skeleton */}
          <div className="flex gap-2">
            <div className="h-10 w-24 animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700" />
            <div className="h-10 w-28 animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700" />
          </div>
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
