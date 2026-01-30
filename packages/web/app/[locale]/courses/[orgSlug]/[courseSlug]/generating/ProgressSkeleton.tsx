'use client'

import { Skeleton } from '@/components/ui/skeleton'

export default function ProgressSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] py-8">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header Skeleton */}
        <div className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full bg-gray-800" />
              <div>
                <Skeleton className="mb-2 h-6 w-48 bg-gray-800" />
                <Skeleton className="h-4 w-32 bg-gray-800" />
              </div>
            </div>
            <Skeleton className="h-8 w-20 bg-gray-800" />
          </div>
          <Skeleton className="h-2 w-full rounded-full bg-gray-800" />
        </div>

        {/* Stats Grid Skeleton */}
        <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Skeleton className="mb-3 h-3 w-20 bg-gray-800" />
                  <Skeleton className="h-8 w-16 bg-gray-800" />
                </div>
                <Skeleton className="h-8 w-8 rounded bg-gray-800" />
              </div>
            </div>
          ))}
        </div>

        {/* Celestial Journey Skeleton */}
        <div className="relative mx-auto max-w-2xl px-4 py-12">
          {/* Line */}
          <div className="absolute top-0 bottom-0 left-[2.85rem] w-1 border-l-2 border-dashed border-gray-800" />

          {/* Planets */}
          <div className="space-y-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="relative flex items-center gap-6">
                <Skeleton className="z-10 h-12 w-12 flex-shrink-0 rounded-full bg-gray-800 ring-4 ring-[#0a0e1a]" />
                <div className="flex-1">
                  <Skeleton className="mb-2 h-6 w-40 bg-gray-800" />
                  <Skeleton className="h-4 w-24 bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
