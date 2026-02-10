'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function ProfilePageSkeleton() {
  return (
    <div className="bg-background relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-100/20 via-transparent to-pink-100/20 dark:from-purple-900/10 dark:to-pink-900/10" />
      <div className="relative z-10 hidden lg:flex">
        {/* Desktop Skeleton */}
        <aside className="w-80 border-r">
          <div className="border-b p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1">
                <Skeleton className="mb-2 h-5 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="shimmer h-16 w-full rounded-lg" />
            ))}
          </div>
        </aside>
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <div>
              <Skeleton className="mb-2 h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Card className="p-6">
              <Skeleton className="mb-4 h-6 w-32" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i}>
                    <Skeleton className="mb-2 h-4 w-24" />
                    <Skeleton className="h-5 w-full max-w-sm" />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </main>
      </div>

      {/* Mobile Skeleton */}
      <div className="p-4 lg:hidden">
        <div className="mb-6 flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1">
            <Skeleton className="mb-2 h-5 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="mb-6 h-10 w-full" />
        <Card className="p-6">
          <Skeleton className="mb-4 h-6 w-32" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <Skeleton className="mb-2 h-4 w-24" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
