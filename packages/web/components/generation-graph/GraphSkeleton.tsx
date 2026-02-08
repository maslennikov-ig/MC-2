import React from 'react'

export function GraphSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500 dark:border-slate-700 dark:border-t-blue-400"></div>
        <div className="font-medium text-slate-400 dark:text-slate-500">Loading pipeline...</div>
      </div>
    </div>
  )
}
