'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Clock, DollarSign, ChevronRight } from 'lucide-react';
import { getStagesInfo } from '@/app/actions/pipeline-admin';
import type { PipelineStage, ModelConfigWithVersion } from '@megacampus/shared-types';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format';
import { StageDetailSheet } from './stage-detail-sheet';
import { ModelEditorDialog } from './model-editor-dialog';
import { PromptEditorDialog } from './prompt-editor-dialog';

/**
 * Prompt template interface for editor dialog
 */
interface PromptTemplate {
  id: string;
  stage: string;
  promptKey: string;
  promptName: string;
  promptDescription: string | null;
  promptTemplate: string;
  variables: Array<{
    name: string;
    description: string;
    required: boolean;
    example?: string;
  }>;
  version: number;
}

/**
 * Stage color mapping for visual distinction
 */
const stageColors: Record<number, { bg: string; text: string; border: string; hover: string }> = {
  1: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', hover: 'hover:border-sky-500/60' },
  2: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/30', hover: 'hover:border-violet-500/60' },
  3: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', hover: 'hover:border-blue-500/60' },
  4: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', hover: 'hover:border-purple-500/60' },
  5: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', hover: 'hover:border-emerald-500/60' },
  6: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', hover: 'hover:border-amber-500/60' },
  7: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', hover: 'hover:border-rose-500/60' },
};

/**
 * PipelineOverview Component
 *
 * Displays horizontal flow of 6 pipeline stages with:
 * - Stage number and name
 * - Description
 * - Status badge (always active)
 * - Performance metrics (avg time, avg cost)
 * - Click to open detail sheet with models and prompts
 *
 * Layout uses horizontal scroll for overflow on small screens.
 * Stages are connected with arrow icons to show flow.
 */
export function PipelineOverview() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sheet state
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Editor dialogs state
  const [editingModel, setEditingModel] = useState<ModelConfigWithVersion | null>(null);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);

  // Key to trigger StageDetailSheet refresh after external saves
  const [sheetRefreshKey, setSheetRefreshKey] = useState(0);

  // Load stages data - extracted for reuse after save operations
  const loadStages = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      setError(null);
      const data = await getStagesInfo();
      setStages(data.result?.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stages');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadStages();
  }, [loadStages]);

  const handleStageClick = (stage: PipelineStage) => {
    setSelectedStage(stage);
    setSheetOpen(true);
  };

  const handleEditModel = (model: ModelConfigWithVersion) => {
    setEditingModel(model);
    setModelDialogOpen(true);
  };

  const handleEditPrompt = (prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setPromptDialogOpen(true);
  };

  // Refresh data after model config is saved (without full page loading state)
  const handleModelSaved = useCallback(() => {
    loadStages(false);
    setSheetRefreshKey((prev) => prev + 1); // Trigger StageDetailSheet refresh
  }, [loadStages]);

  // Refresh data after prompt template is saved (without full page loading state)
  const handlePromptSaved = useCallback(() => {
    loadStages(false);
    setSheetRefreshKey((prev) => prev + 1); // Trigger StageDetailSheet refresh
  }, [loadStages]);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="min-w-[280px] flex-shrink-0">
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!stages) return null;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3 overflow-x-auto pb-6">
          {stages.map((stage, index) => {
            const colors = stageColors[stage.number] || stageColors[1];

            return (
              <div key={stage.number} className="flex items-center gap-3">
                <Card
                  onClick={() => handleStageClick(stage)}
                  className={cn(
                    'min-w-[300px] flex-shrink-0 admin-glass-card cursor-pointer transition-all duration-200',
                    colors.border,
                    colors.hover,
                    'hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20',
                    stage.status === 'active' ? 'admin-pulse-active' : ''
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg',
                            colors.bg,
                            colors.text
                          )}
                        >
                          {stage.number}
                        </div>
                        <CardTitle
                          className="text-lg font-semibold"
                          style={{ color: 'rgb(var(--admin-text-primary))' }}
                        >
                          {stage.name}
                        </CardTitle>
                      </div>
                      <ChevronRight
                        className={cn(
                          'h-5 w-5 transition-colors',
                          colors.text,
                          'opacity-50 group-hover:opacity-100'
                        )}
                      />
                    </div>
                    <CardDescription
                      className="mt-2 line-clamp-2"
                      style={{ color: 'rgb(var(--admin-text-secondary))' }}
                    >
                      {stage.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Stats */}
                    <div
                      className="flex gap-4 text-sm"
                      style={{ color: 'rgb(var(--admin-text-tertiary))' }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-purple-400" />
                        <span>
                          {stage.avgExecutionTime
                            ? formatDuration(stage.avgExecutionTime)
                            : tc('na')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-amber-400" />
                        <span>
                          {stage.avgCost !== null ? `$${stage.avgCost.toFixed(4)}` : tc('na')}
                        </span>
                      </div>
                    </div>

                    {/* Resource counts */}
                    <div className="flex gap-3 text-xs font-medium">
                      {stage.modelCount > 0 && (
                        <Badge
                          variant="outline"
                          className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                        >
                          {stage.modelCount} {t('pipeline.stages.models')}
                        </Badge>
                      )}
                      {stage.promptCount > 0 && (
                        <Badge
                          variant="outline"
                          className="bg-purple-500/10 text-purple-400 border-purple-500/30"
                        >
                          {stage.promptCount} {t('pipeline.stages.prompts')}
                        </Badge>
                      )}
                      {stage.modelCount === 0 && stage.promptCount === 0 && (
                        <span style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
                          {t('pipeline.stages.noLlmPhases')}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {index < stages.length - 1 && (
                  <ArrowRight className="h-7 w-7 text-cyan-400/60 flex-shrink-0 animate-pulse" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Detail Sheet */}
      <StageDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        stage={selectedStage}
        onEditModel={handleEditModel}
        onEditPrompt={handleEditPrompt}
        refreshKey={sheetRefreshKey}
      />

      {/* Model Editor Dialog */}
      <ModelEditorDialog
        open={modelDialogOpen}
        onOpenChange={setModelDialogOpen}
        config={editingModel}
        onSaved={handleModelSaved}
      />

      {/* Prompt Editor Dialog */}
      <PromptEditorDialog
        open={promptDialogOpen}
        onOpenChange={setPromptDialogOpen}
        prompt={editingPrompt}
        onSaved={handlePromptSaved}
      />
    </>
  );
}
