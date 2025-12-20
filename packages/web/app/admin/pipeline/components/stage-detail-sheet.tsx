/**
 * StageDetailSheet Component
 *
 * Slide-over panel showing detailed information about a pipeline stage.
 * Includes tabs for Overview, Models, and Prompts with edit capabilities.
 *
 * Models tab shows database-driven model configurations grouped by language and tier.
 *
 * @module app/admin/pipeline/components/stage-detail-sheet
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Clock,
  DollarSign,
  Cpu,
  FileText,
  Settings2,
  ChevronRight,
  Thermometer,
  Hash,
  Layers,
  Sparkles,
  Zap,
  Shield,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listModelConfigs, listPromptTemplates, listJudgeConfigs, listContextReserveSettings } from '@/app/actions/pipeline-admin';
import type { PipelineStage, ModelConfigWithVersion, JudgeConfigsByLanguage, JudgeConfig } from '@megacampus/shared-types';
import { calculateContextThreshold, DEFAULT_CONTEXT_RESERVE, MAX_RESERVE_PERCENT } from '@megacampus/shared-types';
import { JudgeEditorDialog } from './judge-editor-dialog';

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

interface StageDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: PipelineStage | null;
  onEditModel?: (model: ModelConfigWithVersion) => void;
  onEditPrompt?: (prompt: PromptTemplate) => void;
  /** Key to trigger data refresh (increment after external saves) */
  refreshKey?: number;
}

/**
 * Stage color mapping for visual distinction
 */
const stageColors: Record<number, { bg: string; text: string; border: string; gradient: string }> = {
  1: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', gradient: 'from-sky-500 to-sky-600' },
  2: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/30', gradient: 'from-violet-500 to-violet-600' },
  3: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', gradient: 'from-blue-500 to-blue-600' },
  4: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', gradient: 'from-purple-500 to-purple-600' },
  5: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', gradient: 'from-emerald-500 to-emerald-600' },
  6: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', gradient: 'from-amber-500 to-amber-600' },
};

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Map stage number to stage key for filtering
 */
function getStageKey(stageNumber: number): string {
  return `stage_${stageNumber}`;
}

/**
 * Format context size for display (e.g., 128K, 1M)
 */
function formatContextSize(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  return `${(tokens / 1_000).toFixed(0)}K`;
}

/**
 * Calculate threshold label for tier display
 * @param tier - 'standard' or 'extended'
 * @param maxContext - Model's max context tokens (default 128000)
 * @param reservePercent - Language-specific reserve percentage
 * @returns Formatted label like "Standard Tier (<109K tokens)"
 */
function getTierLabel(
  tier: 'standard' | 'extended',
  maxContext: number = 128000,
  reservePercent: number = DEFAULT_CONTEXT_RESERVE.any
): string {
  // Validate and clamp reservePercent
  if (reservePercent < 0 || reservePercent > MAX_RESERVE_PERCENT) {
    // Log warning with structured context
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[getTierLabel] Invalid reservePercent:',
        { reservePercent, maxAllowed: MAX_RESERVE_PERCENT, action: 'clamping' }
      );
    }
    reservePercent = Math.max(0, Math.min(reservePercent, MAX_RESERVE_PERCENT));
  }

  const threshold = calculateContextThreshold(maxContext, reservePercent);
  const thresholdK = Math.round(threshold / 1000);

  if (tier === 'standard') {
    return `Standard Tier (<${thresholdK}K tokens)`;
  }
  return `Extended Tier (>${thresholdK}K tokens)`;
}

/**
 * Group models by language and tier for organized display
 * Supports 'any' language which appears in a dedicated section
 */
function groupModelsByLanguageAndTier(models: ModelConfigWithVersion[]) {
  const grouped: {
    any: { standard: ModelConfigWithVersion[]; extended: ModelConfigWithVersion[] };
    ru: { standard: ModelConfigWithVersion[]; extended: ModelConfigWithVersion[] };
    en: { standard: ModelConfigWithVersion[]; extended: ModelConfigWithVersion[] };
  } = {
    any: { standard: [], extended: [] },
    ru: { standard: [], extended: [] },
    en: { standard: [], extended: [] },
  };

  models.forEach((model) => {
    const lang = (model.language || 'any') as 'any' | 'ru' | 'en';
    const tier = (model.contextTier || 'standard') as 'standard' | 'extended';
    if (grouped[lang]?.[tier]) {
      grouped[lang][tier].push(model);
    }
  });

  return grouped;
}

/**
 * Stage detail sheet with tabs for overview, models, and prompts
 */
export function StageDetailSheet({
  open,
  onOpenChange,
  stage,
  onEditModel,
  onEditPrompt,
  refreshKey,
}: StageDetailSheetProps) {
  const [models, setModels] = useState<ModelConfigWithVersion[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [judgeConfigs, setJudgeConfigs] = useState<JudgeConfigsByLanguage[]>([]);
  const [reserveSettings, setReserveSettings] = useState<Record<string, number>>(
    DEFAULT_CONTEXT_RESERVE
  );
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [judgeEditorOpen, setJudgeEditorOpen] = useState(false);
  const [selectedJudge, setSelectedJudge] = useState<JudgeConfig | null>(null);

  // Click handler for judge cells
  const handleJudgeClick = (judge: JudgeConfig) => {
    setSelectedJudge(judge);
    setJudgeEditorOpen(true);
  };

  // Fetch models and prompts for this stage
  const loadStageData = useCallback(async () => {
    if (!stage) return;

    setIsLoading(true);
    try {
      const promises = [
        listModelConfigs(),
        listPromptTemplates(),
        listContextReserveSettings(),
      ];

      // For Stage 6, also load judge configs
      if (stage.number === 6) {
        promises.push(listJudgeConfigs());
      }

      const results = await Promise.all(promises);
      const [modelsRes, promptsRes, reserveRes, judgesRes] = results;

      // Filter models by stage using unified format: stage_X_*
      const stageModels = (modelsRes.result?.data || []).filter(
        (m: ModelConfigWithVersion) => m.phaseName.startsWith(`stage_${stage.number}_`)
      );
      setModels(stageModels);

      // Get prompts for this stage - data is object { stage_3: [], stage_4: [], ... }
      const stagePrefix = getStageKey(stage.number);
      const promptsByStage = promptsRes.result?.data || {};
      const stagePrompts = promptsByStage[stagePrefix] || [];
      setPrompts(stagePrompts);

      // Process reserve settings
      const reserveData = reserveRes?.result?.data || reserveRes?.result || reserveRes || [];
      if (Array.isArray(reserveData)) {
        const settingsMap: Record<string, number> = { ...DEFAULT_CONTEXT_RESERVE };
        reserveData.forEach((setting: { language: string; reservePercent: number }) => {
          settingsMap[setting.language] = setting.reservePercent;
        });
        setReserveSettings(settingsMap);
      }

      // Set judge configs if Stage 6
      if (stage.number === 6 && judgesRes) {
        setJudgeConfigs(judgesRes.result?.data || []);
      }
    } catch (error) {
      console.error('Failed to load stage data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [stage]);

  useEffect(() => {
    if (open && stage) {
      loadStageData();
      setActiveTab('overview');
    }
  }, [open, stage, loadStageData]);

  // Refresh data when refreshKey changes (after external model/prompt saves)
  useEffect(() => {
    if (open && stage && refreshKey !== undefined) {
      loadStageData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (!stage) return null;

  const colors = stageColors[stage.number] || stageColors[1];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              'bg-gradient-to-br', colors.gradient
            )}>
              <span className="text-xl font-bold text-white">{stage.number}</span>
            </div>
            <div className="flex-1">
              <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
                {stage.name}
              </SheetTitle>
              <SheetDescription className="text-gray-600 dark:text-zinc-400 mt-1">
                {stage.description}
              </SheetDescription>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'font-medium px-3 py-1',
                stage.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
              )}
            >
              {stage.status === 'active' ? 'Active' : stage.status}
            </Badge>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4">
            <TabsList className="bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 w-full grid grid-cols-3">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-gray-200 dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-purple-500 dark:data-[state=active]:text-cyan-400"
              >
                <Layers className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="models"
                className="data-[state=active]:bg-gray-200 dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-purple-500 dark:data-[state=active]:text-cyan-400"
              >
                <Cpu className="h-4 w-4 mr-2" />
                Models
                {models.length > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 text-xs">
                    {models.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="prompts"
                className="data-[state=active]:bg-gray-200 dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-purple-500 dark:data-[state=active]:text-cyan-400"
              >
                <FileText className="h-4 w-4 mr-2" />
                Prompts
                {prompts.length > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 text-xs">
                    {prompts.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 px-6 py-4">
            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-0 space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <Clock className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-zinc-500 uppercase tracking-wide">Avg Time</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                          {stage.avgExecutionTime ? formatDuration(stage.avgExecutionTime) : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/10">
                        <DollarSign className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-zinc-500 uppercase tracking-wide">Avg Cost</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                          {stage.avgCost !== null ? `$${stage.avgCost.toFixed(4)}` : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Stage Info */}
              <Card className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-700 dark:text-zinc-300 flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-gray-500 dark:text-zinc-500" />
                    Stage Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-zinc-800">
                    <span className="text-sm text-gray-600 dark:text-zinc-400">Linked Models</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                      {stage.linkedModels.length} phases
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-zinc-800">
                    <span className="text-sm text-gray-600 dark:text-zinc-400">Linked Prompts</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                      {stage.linkedPrompts.length} templates
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-600 dark:text-zinc-400">Status</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        stage.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                      )}
                    >
                      {stage.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Linked Phases */}
              {stage.linkedModels.length > 0 && (
                <Card className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-700 dark:text-zinc-300 flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-gray-500 dark:text-zinc-500" />
                      LLM Phases
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {stage.linkedModels.map((phase) => (
                        <Badge
                          key={phase}
                          variant="outline"
                          className="bg-purple-500/10 dark:bg-cyan-500/10 text-purple-500 dark:text-cyan-400 border-purple-500/30 dark:border-cyan-500/30 font-mono text-xs"
                        >
                          {phase}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Models Tab */}
            <TabsContent value="models" className="mt-0 space-y-6">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full bg-gray-200 dark:bg-zinc-800" />
                  ))}
                </div>
              ) : models.length === 0 ? (
                <Card className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800">
                  <CardContent className="p-8 text-center">
                    <Cpu className="h-12 w-12 mx-auto text-gray-400 dark:text-zinc-600 mb-3" />
                    <p className="text-gray-600 dark:text-zinc-400">No models configured for this stage</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
                      This stage may not use LLM calls
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Stage 6: Show CLEV Judge Configurations first */}
                  {stage.number === 6 && judgeConfigs.length > 0 && (
                    <Card className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-700 dark:text-zinc-300 flex items-center gap-2">
                          <Shield className="h-4 w-4 text-amber-400" />
                          CLEV Judges Configuration
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs"
                          >
                            Database
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-gray-500 dark:text-zinc-500 mb-4">
                          Three-judge voting system for lesson quality evaluation. Each language uses
                          primary/secondary/tiebreaker judges with weighted votes.
                        </p>

                        {/* Judge Configs Table */}
                        <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-100 dark:bg-zinc-900/50 hover:bg-gray-100 dark:hover:bg-zinc-900/50">
                                <TableHead className="text-gray-600 dark:text-zinc-400 font-medium w-24">Language</TableHead>
                                <TableHead className="text-gray-600 dark:text-zinc-400 font-medium">Primary Judge</TableHead>
                                <TableHead className="text-gray-600 dark:text-zinc-400 font-medium">Secondary Judge</TableHead>
                                <TableHead className="text-gray-600 dark:text-zinc-400 font-medium">Tiebreaker</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {judgeConfigs.map((langConfig) => {
                                const languageLabels: Record<string, { emoji: string; name: string }> = {
                                  ru: { emoji: '🇷🇺', name: 'Russian' },
                                  en: { emoji: '🇺🇸', name: 'English' },
                                  any: { emoji: '🌐', name: 'Any' },
                                };
                                const langLabel = languageLabels[langConfig.language] || { emoji: '🌐', name: langConfig.language };

                                return (
                                  <TableRow key={langConfig.language} className="border-gray-200 dark:border-zinc-800">
                                    <TableCell className="font-medium text-gray-700 dark:text-zinc-300">
                                      <div className="flex items-center gap-2">
                                        <span className="text-lg">{langLabel.emoji}</span>
                                        <span className="text-sm">{langLabel.name}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      onClick={() => handleJudgeClick(langConfig.primary)}
                                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/50 transition-colors"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs text-purple-500 dark:text-cyan-400 bg-gray-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded font-mono">
                                            {langConfig.primary.displayName}
                                          </code>
                                          <Badge
                                            variant="outline"
                                            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                                          >
                                            {langConfig.primary.weight.toFixed(2)}
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-500">
                                          <span>T: {langConfig.primary.temperature}</span>
                                          <span>•</span>
                                          <span>Max: {langConfig.primary.maxTokens}</span>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      onClick={() => handleJudgeClick(langConfig.secondary)}
                                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/50 transition-colors"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs text-purple-500 dark:text-cyan-400 bg-gray-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded font-mono">
                                            {langConfig.secondary.displayName}
                                          </code>
                                          <Badge
                                            variant="outline"
                                            className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs"
                                          >
                                            {langConfig.secondary.weight.toFixed(2)}
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-500">
                                          <span>T: {langConfig.secondary.temperature}</span>
                                          <span>•</span>
                                          <span>Max: {langConfig.secondary.maxTokens}</span>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      onClick={() => handleJudgeClick(langConfig.tiebreaker)}
                                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/50 transition-colors"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs text-purple-500 dark:text-cyan-400 bg-gray-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded font-mono">
                                            {langConfig.tiebreaker.displayName}
                                          </code>
                                          <Badge
                                            variant="outline"
                                            className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs"
                                          >
                                            {langConfig.tiebreaker.weight.toFixed(2)}
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-500">
                                          <span>T: {langConfig.tiebreaker.temperature}</span>
                                          <span>•</span>
                                          <span>Max: {langConfig.tiebreaker.maxTokens}</span>
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-500 dark:text-cyan-400" />
                    <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                      Model Configurations
                    </h3>
                    <Badge
                      variant="outline"
                      className="bg-purple-500/10 dark:bg-cyan-500/10 text-purple-500 dark:text-cyan-400 border-purple-500/30 dark:border-cyan-500/30 text-xs"
                    >
                      Database
                    </Badge>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-zinc-500">
                    Models are automatically selected based on content language and document size.
                    All configurations are editable and stored in the database.
                  </p>

                  {/* Group models by language and tier (exclude judge configs - they are shown above) */}
                  {(() => {
                    // Filter out judge models - they are already shown in CLEV Judges section
                    const nonJudgeModels = models.filter((m) => !m.judgeRole);
                    const grouped = groupModelsByLanguageAndTier(nonJudgeModels);
                    const languages: Array<'any' | 'ru' | 'en'> = ['any', 'ru', 'en'];
                    const tiers: Array<'standard' | 'extended'> = ['standard', 'extended'];

                    const languageLabels: Record<'any' | 'ru' | 'en', { emoji: string; name: string }> = {
                      any: { emoji: '🌐', name: 'All Languages' },
                      ru: { emoji: '🇷🇺', name: 'Russian' },
                      en: { emoji: '🇺🇸', name: 'English' },
                    };

                    return (
                      <div className="grid grid-cols-1 gap-6">
                        {languages.map((lang) => {
                          const hasModels =
                            grouped[lang].standard.length > 0 || grouped[lang].extended.length > 0;
                          if (!hasModels) return null;

                          return (
                            <Card key={lang} className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-gray-700 dark:text-zinc-300 flex items-center gap-2">
                                  <span className="text-lg">{languageLabels[lang].emoji}</span>
                                  {languageLabels[lang].name}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {tiers.map((tier) => {
                                  const tierModels = grouped[lang][tier];
                                  if (tierModels.length === 0) return null;

                                  return (
                                    <div key={tier} className="space-y-3">
                                      {/* Tier header */}
                                      <div className="flex items-center gap-2">
                                        {tier === 'standard' ? (
                                          <Zap className="h-3.5 w-3.5 text-emerald-400" />
                                        ) : (
                                          <Cpu className="h-3.5 w-3.5 text-purple-400" />
                                        )}
                                        <span
                                          className={cn(
                                            'text-xs font-medium',
                                            tier === 'standard'
                                              ? 'text-emerald-400'
                                              : 'text-purple-400'
                                          )}
                                        >
                                          {getTierLabel(
                                            tier,
                                            tierModels[0]?.maxContextTokens || 128000,
                                            reserveSettings[lang] || reserveSettings.any || 0.20
                                          )}
                                        </span>
                                      </div>

                                      {/* Model cards for this tier */}
                                      {tierModels.map((model) => (
                                        <div
                                          key={model.id}
                                          className={cn(
                                            'p-3 rounded-lg border transition-colors group cursor-pointer',
                                            tier === 'standard'
                                              ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40'
                                              : 'bg-purple-500/5 border-purple-500/20 hover:border-purple-500/40'
                                          )}
                                          onClick={() => onEditModel?.(model)}
                                        >
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0 space-y-2">
                                              {/* Phase name and version */}
                                              <div className="flex items-center gap-2">
                                                <Badge
                                                  variant="outline"
                                                  className="bg-gray-100 dark:bg-zinc-800/50 text-gray-700 dark:text-zinc-300 border-gray-300 dark:border-zinc-700 font-mono text-xs"
                                                >
                                                  {model.phaseName}
                                                </Badge>
                                                <Badge
                                                  variant="secondary"
                                                  className="bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 text-xs"
                                                >
                                                  v{model.version}
                                                </Badge>
                                                {model.isActive && (
                                                  <Badge
                                                    variant="outline"
                                                    className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                                                  >
                                                    Active
                                                  </Badge>
                                                )}
                                              </div>

                                              {/* Primary and fallback models */}
                                              <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs text-gray-500 dark:text-zinc-500 w-16">
                                                    Primary:
                                                  </span>
                                                  <code className="text-xs text-purple-500 dark:text-cyan-400 bg-gray-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded font-mono truncate">
                                                    {model.modelId}
                                                  </code>
                                                </div>
                                                {model.fallbackModelId && (
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500 dark:text-zinc-500 w-16">
                                                      Fallback:
                                                    </span>
                                                    <code className="text-xs text-amber-500 dark:text-amber-400/80 bg-gray-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded font-mono truncate">
                                                      {model.fallbackModelId}
                                                    </code>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Model parameters */}
                                              <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-zinc-500">
                                                {model.maxContextTokens && (
                                                  <div className="flex items-center gap-1">
                                                    <Layers className="h-3.5 w-3.5" />
                                                    <span>
                                                      {formatContextSize(model.maxContextTokens)} ctx
                                                    </span>
                                                  </div>
                                                )}
                                                <div className="flex items-center gap-1">
                                                  <Thermometer className="h-3.5 w-3.5" />
                                                  <span>Temp: {model.temperature}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  <Hash className="h-3.5 w-3.5" />
                                                  <span>Max: {model.maxTokens.toLocaleString()}</span>
                                                </div>
                                                {model.cacheReadEnabled && (
                                                  <div className="flex items-center gap-1 text-green-400">
                                                    <Shield className="h-3.5 w-3.5" />
                                                    <span>Cache enabled</span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            {/* Chevron indicator */}
                                            <ChevronRight className="h-5 w-5 text-gray-400 dark:text-zinc-600 group-hover:text-purple-500 dark:group-hover:text-cyan-400 transition-colors flex-shrink-0" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </TabsContent>

            {/* Prompts Tab */}
            <TabsContent value="prompts" className="mt-0 space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full bg-gray-200 dark:bg-zinc-800" />
                  ))}
                </div>
              ) : prompts.length === 0 ? (
                <Card className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800">
                  <CardContent className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto text-gray-400 dark:text-zinc-600 mb-3" />
                    <p className="text-gray-600 dark:text-zinc-400">No prompts configured for this stage</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
                      This stage may not use prompt templates
                    </p>
                  </CardContent>
                </Card>
              ) : (
                prompts.map((prompt) => (
                  <Card
                    key={prompt.id}
                    className="bg-gray-50 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors group cursor-pointer"
                    onClick={() => onEditPrompt?.(prompt)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge
                              variant="outline"
                              className="bg-purple-500/10 text-purple-400 border-purple-500/30 font-mono text-xs"
                            >
                              {prompt.promptKey}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 text-xs"
                            >
                              v{prompt.version}
                            </Badge>
                          </div>
                          <p className="font-medium text-gray-800 dark:text-zinc-200 mb-1">
                            {prompt.promptName}
                          </p>
                          {prompt.promptDescription && (
                            <p className="text-xs text-gray-500 dark:text-zinc-500 line-clamp-2">
                              {prompt.promptDescription}
                            </p>
                          )}
                          {prompt.variables && prompt.variables.length > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <Sparkles className="h-3 w-3 text-purple-500 dark:text-cyan-400" />
                              <span className="text-xs text-gray-500 dark:text-zinc-500">
                                {prompt.variables.length} variables
                              </span>
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400 dark:text-zinc-600 group-hover:text-purple-500 dark:group-hover:text-cyan-400 transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Judge Editor Dialog */}
        <JudgeEditorDialog
          open={judgeEditorOpen}
          onOpenChange={setJudgeEditorOpen}
          judge={selectedJudge}
          onSaved={loadStageData}
        />
      </SheetContent>
    </Sheet>
  );
}
