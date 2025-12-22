import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import { PipelineTabsWrapper } from './components/pipeline-tabs-wrapper';

/**
 * Pipeline Admin Main Page - Tabs Structure
 *
 * Main entry point for pipeline configuration dashboard.
 * Provides 4 tabs for managing different aspects of the pipeline:
 * - Overview: Pipeline stages and statistics (T020-T024 - IMPLEMENTED)
 * - Models: LLM model configuration (T025-T037 - IMPLEMENTED)
 * - Prompts: Prompt template editing (T038-T047 - IMPLEMENTED)
 * - Settings: Global settings and export/import (T048-T058 - IMPLEMENTED)
 *
 * @module app/admin/pipeline/page
 *
 * Features:
 * - Tab-based navigation for logical grouping
 * - Overview tab: PipelineStats + PipelineOverview components
 * - Clean, consistent UI using shadcn/ui components
 * - Superadmin-only access (enforced by layout)
 *
 * Implementation Status:
 * - [X] T020-T024: Overview tab (PipelineStats, PipelineOverview)
 * - [X] T025-T037: Models tab (ModelsConfig, ModelEditorDialog, ConfigHistoryDialog)
 * - [X] T038-T047: Prompts tab (PromptsEditor, PromptEditorDialog, PromptHistoryDialog)
 * - [X] T048-T051: Settings tab (SettingsPanel)
 * - [X] T052-T058: Export/Import (ExportImportPanel)
 */

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function PipelineAdminPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale); // Enable static rendering

  const t = await getTranslations('admin');

  // Prepare translations for client component
  const translations = {
    tabs: {
      overview: t('pipeline.tabs.overview'),
      models: t('pipeline.tabs.models'),
      prompts: t('pipeline.tabs.prompts'),
      settings: t('pipeline.tabs.settings'),
    },
    stages: {
      title: t('pipeline.stages.title'),
    },
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          {t('pipeline.title')}
        </h1>
        <p className="text-lg" style={{ color: 'rgb(var(--admin-text-secondary))' }}>
          {t('pipeline.description')}
        </p>
      </div>

      {/* Main Tabs - Client Component with dynamic import to prevent hydration mismatch */}
      <PipelineTabsWrapper translations={translations} />
    </div>
  );
}
