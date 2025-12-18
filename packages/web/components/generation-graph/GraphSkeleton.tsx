import React from 'react';

export function GraphSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-blue-500 dark:border-t-blue-400"></div>
        <div className="text-slate-400 dark:text-slate-500 font-medium">Loading pipeline...</div>
      </div>
    </div>
  );
}
