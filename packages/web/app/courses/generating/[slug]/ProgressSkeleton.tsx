'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function ProgressSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] py-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        
        {/* Header Skeleton */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full bg-gray-800" />
              <div>
                <Skeleton className="h-6 w-48 mb-2 bg-gray-800" />
                <Skeleton className="h-4 w-32 bg-gray-800" />
              </div>
            </div>
            <Skeleton className="h-8 w-20 bg-gray-800" />
          </div>
          <Skeleton className="h-2 w-full rounded-full bg-gray-800" />
        </div>

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-800 bg-gray-900/30">
              <div className="flex justify-between items-start">
                <div>
                  <Skeleton className="h-3 w-20 mb-3 bg-gray-800" />
                  <Skeleton className="h-8 w-16 bg-gray-800" />
                </div>
                <Skeleton className="h-8 w-8 rounded bg-gray-800" />
              </div>
            </div>
          ))}
        </div>

        {/* Celestial Journey Skeleton */}
        <div className="relative max-w-2xl mx-auto py-12 px-4">
          {/* Line */}
          <div className="absolute left-[2.85rem] top-0 bottom-0 w-1 border-l-2 border-gray-800 border-dashed" />
          
          {/* Planets */}
          <div className="space-y-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="relative flex items-center gap-6">
                <Skeleton className="h-12 w-12 rounded-full bg-gray-800 flex-shrink-0 z-10 ring-4 ring-[#0a0e1a]" />
                <div className="flex-1">
                  <Skeleton className="h-6 w-40 mb-2 bg-gray-800" />
                  <Skeleton className="h-4 w-24 bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
