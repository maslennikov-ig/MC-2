'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { PipelineStats } from './pipeline-stats';
import { PipelineOverview } from './pipeline-overview';
import { ModelsConfig } from './models-config';
import { ModelBrowser } from './model-browser';
import { PromptsEditor } from './prompts-editor';
import { SettingsPanel } from './settings-panel';
import { ApiKeysPanel } from './api-keys-panel';
import { ExportImportPanel } from './export-import';
import { ContextReserveSettings } from './context-reserve-settings';

interface PipelineTabsProps {
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

/**
 * Pipeline Admin Tabs - Client Component
 *
 * Wraps Radix UI Tabs in a client component to prevent hydration mismatch.
 * Radix generates dynamic IDs that differ between server and client.
 */
export function PipelineTabs({ translations }: PipelineTabsProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="admin-glass-card inline-flex h-12 items-center justify-center rounded-xl p-1 gap-1">
        <TabsTrigger
          value="overview"
          className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-cyan-400 data-[state=active]:shadow-lg"
        >
          {translations.tabs.overview}
        </TabsTrigger>
        <TabsTrigger
          value="models"
          className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-cyan-400 data-[state=active]:shadow-lg"
        >
          {translations.tabs.models}
        </TabsTrigger>
        <TabsTrigger
          value="prompts"
          className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-cyan-400 data-[state=active]:shadow-lg"
        >
          {translations.tabs.prompts}
        </TabsTrigger>
        <TabsTrigger
          value="settings"
          className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-cyan-400 data-[state=active]:shadow-lg"
        >
          {translations.tabs.settings}
        </TabsTrigger>
      </TabsList>

      {/* Overview Tab: Pipeline stages and statistics */}
      <TabsContent value="overview" className="space-y-8 animate-tab-fade-in">
        <PipelineStats />
        <div>
          <h2 className="text-2xl font-semibold mb-6" style={{ color: 'rgb(var(--admin-text-primary))' }}>
            {translations.stages.title}
          </h2>
          <PipelineOverview />
        </div>
      </TabsContent>

      {/* Models Tab: LLM model configuration */}
      <TabsContent value="models" className="space-y-8 animate-tab-fade-in">
        <ModelsConfig />
        <ModelBrowser />
      </TabsContent>

      {/* Prompts Tab: Prompt template editing */}
      <TabsContent value="prompts" className="space-y-6 animate-tab-fade-in">
        <PromptsEditor />
      </TabsContent>

      {/* Settings Tab: Global settings, context reserve, API keys, and export/import */}
      <TabsContent value="settings" className="space-y-8 animate-tab-fade-in">
        <SettingsPanel />
        <Separator className="my-8 opacity-20" />
        <ContextReserveSettings />
        <Separator className="my-8 opacity-20" />
        <ApiKeysPanel />
        <Separator className="my-8 opacity-20" />
        <ExportImportPanel />
      </TabsContent>
    </Tabs>
  );
}
