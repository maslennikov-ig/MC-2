'use client';

import dynamic from 'next/dynamic';

interface PipelineTabsWrapperProps {
  translations: {
    tabs: {
      overview: string;
      models: string;
      prompts: string;
      settings: string;
    };
    stages: {
      title: string;
    };
  };
}

// Dynamic import with ssr: false to prevent Radix UI hydration mismatch
// Radix generates unique IDs that differ between server and client
const PipelineTabs = dynamic(
  () => import('./pipeline-tabs').then((mod) => mod.PipelineTabs),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        <div className="h-12 w-96 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/5 animate-pulse" />
      </div>
    ),
  }
);

export function PipelineTabsWrapper({ translations }: PipelineTabsWrapperProps) {
  return <PipelineTabs translations={translations} />;
}
