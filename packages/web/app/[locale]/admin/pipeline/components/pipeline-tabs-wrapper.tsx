'use client'

import dynamic from 'next/dynamic'

interface PipelineTabsWrapperProps {
  translations: {
    tabs: {
      overview: string
      models: string
      prompts: string
      settings: string
    }
    stages: {
      title: string
    }
  }
}

// Dynamic import with ssr: false to prevent Radix UI hydration mismatch
// Radix generates unique IDs that differ between server and client
const PipelineTabs = dynamic(() => import('./pipeline-tabs').then((mod) => mod.PipelineTabs), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <div className="h-12 w-96 animate-pulse rounded-xl bg-white/5" />
      <div className="h-64 animate-pulse rounded-xl bg-white/5" />
    </div>
  ),
})

export function PipelineTabsWrapper({ translations }: PipelineTabsWrapperProps) {
  return <PipelineTabs translations={translations} />
}
