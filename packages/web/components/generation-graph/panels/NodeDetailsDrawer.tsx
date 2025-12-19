import React, { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { RestartConfirmDialog } from '../controls/RestartConfirmDialog';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { useUserRole } from '../hooks/useUserRole';
import { AppNode } from '../types';
import { AttemptSelector } from './AttemptSelector';
import { PhaseSelector } from './PhaseSelector';
import { ApprovalControls } from '../controls/ApprovalControls';
import { InputTab } from './InputTab';
import { ProcessTab } from './ProcessTab';
import { OutputTab } from './OutputTab';
import { ActivityTab } from './ActivityTab';
import { RefinementChat } from './RefinementChat';
import { useRefinement } from '../hooks/useRefinement';
import { useStaticGraph } from '../contexts/StaticGraphContext';
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';
import { useLessonContent } from '../hooks/useLessonContent';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { TraceAttempt } from '@megacampus/shared-types';
import { isAwaitingApproval as getAwaitingStageNumber } from '@/lib/generation-graph/utils';
import { toast } from 'sonner';
import { approveLesson } from '@/app/actions/lesson-actions';
// Stage 6 "Glass Factory" UI components
import { ModuleDashboard } from './module/ModuleDashboard';
import { LessonInspector } from './lesson/LessonInspector';
import { useModuleDashboardData } from '../hooks/useModuleDashboardData';
import { useLessonInspectorData } from '../hooks/useLessonInspectorData';

interface DisplayData {
  label?: string;
  inputData?: unknown;
  outputData?: unknown;
  duration?: number;
  tokens?: number;
  model?: string;
  qualityScore?: number;
  status?: string;
  attempts?: TraceAttempt[];
  attemptNumber?: number;
  retryCount?: number;
}

export const NodeDetailsDrawer = memo(function NodeDetailsDrawer() {
  const { selectedNodeId, deselectNode, focusRefinement, clearRefinementFocus, autoOpened } = useNodeSelection();
  const { t } = useTranslation();
  const { getNode } = useReactFlow();
  const { courseInfo } = useStaticGraph();
  const { isAdmin } = useUserRole();
  const params = useParams();
  const courseSlug = params?.slug as string | undefined;
  const [selectedAttemptNum, setSelectedAttemptNum] = useState<number | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const { refine, isRefining } = useRefinement(courseInfo.id);
  const refinementChatRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLessonMaximized, setIsLessonMaximized] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const selectedNode = selectedNodeId ? getNode(selectedNodeId) as AppNode : null;
  const data = selectedNode?.data;

  // Detect if this node has phases (stages 4, 5)
  const hasPhases = data?.stageNumber && (data.stageNumber === 4 || data.stageNumber === 5);
  const phases = (data as any)?.phases || [];

  // Get realtime status from context (more reliable than node data)
  const realtimeStatus = useNodeStatus(selectedNodeId || '');
  const { status: generationStatus } = useGenerationRealtime();

  // Check if THIS stage is awaiting approval based on course generation_status
  // generationStatus contains the raw generation_status like 'stage_5_awaiting_approval'
  const awaitingStageNumber = getAwaitingStageNumber(generationStatus || '');
  const isThisStageAwaiting = awaitingStageNumber !== null && data?.stageNumber === awaitingStageNumber;

  // Editing permission:
  // - When stage is awaiting approval, EVERYONE can edit (to review/change before approving)
  // - Otherwise, admins get read-only view, owners can edit
  const isAwaitingApproval = isThisStageAwaiting || realtimeStatus?.status === 'awaiting' || data?.status === 'awaiting';
  const canEdit = isAwaitingApproval || !isAdmin;

  // Detect if this is a lesson node and extract lessonId for content fetching
  const isLessonNode = selectedNode?.type === 'lesson';
  const isModuleNode = selectedNode?.type === 'module';

  // Stage 6 "Glass Factory" UI: Detect if this is a Stage 6 module or lesson
  const isStage6Module = isModuleNode;
  const isStage6Lesson = isLessonNode;

  // Extract module ID for module dashboard (module_1, module_2, etc.)
  const moduleIdForDashboard = useMemo(() => {
    if (!isStage6Module || !selectedNodeId) return null;
    return selectedNodeId; // Already in format like "module_1"
  }, [isStage6Module, selectedNodeId]);

  // Extract lesson info for lesson inspector
  const lessonInfoForInspector = useMemo(() => {
    if (!isStage6Lesson || !selectedNodeId) return null;
    const match = selectedNodeId.match(/^lesson_(\d+)_(\d+)$/);
    if (match) {
      return {
        lessonId: `${match[1]}.${match[2]}`,
        moduleNumber: parseInt(match[1], 10),
        lessonNumber: parseInt(match[2], 10),
      };
    }
    return null;
  }, [isStage6Lesson, selectedNodeId]);

  // Lesson action handlers
  const handleApproveLesson = useCallback(async () => {
    if (!lessonInfoForInspector) return;

    setIsApproving(true);
    try {
      await approveLesson(courseInfo.id, lessonInfoForInspector.lessonId);
      toast.success('Урок одобрен');
      // TODO: Refetch lesson data or update local state
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Не удалось одобрить урок'}`);
    } finally {
      setIsApproving(false);
    }
  }, [lessonInfoForInspector, courseInfo.id]);

  const handleEditLesson = useCallback(() => {
    // For MVP: Show "not available yet" message
    toast.info('Редактирование пока недоступно');
    // TODO: Implement edit mode or modal
  }, []);

  const handleRegenerateLesson = useCallback(() => {
    if (!lessonInfoForInspector) return;

    // Use existing retry mechanism - TODO: wire up properly with lessonSpec
    toast.info('Функция регенерации будет добавлена позже');
    // TODO: Fetch lesson spec and call regenerateLesson action
  }, [lessonInfoForInspector]);

  const lessonIdForFetch = useMemo(() => {
    if (!isLessonNode || !selectedNodeId) return null;
    // Convert lesson_1_2 format to 1.2 format for API
    const match = selectedNodeId.match(/^lesson_(\d+)_(\d+)$/);
    if (match) {
      return `${match[1]}.${match[2]}`;
    }
    return null;
  }, [isLessonNode, selectedNodeId]);

  // Fetch lesson content from lesson_contents table (only for lesson nodes)
  const {
    data: lessonContentData,
    isLoading: isLoadingLessonContent,
  } = useLessonContent({
    courseId: courseInfo.id,
    lessonId: lessonIdForFetch,
    enabled: isLessonNode && !!lessonIdForFetch,
  });

  // Stage 6 "Glass Factory" UI: Fetch module dashboard data
  const {
    data: moduleDashboardData,
    isLoading: isLoadingModuleDashboard,
    error: moduleDashboardError,
  } = useModuleDashboardData({
    courseId: courseInfo.id,
    moduleId: moduleIdForDashboard,
    enabled: isStage6Module && !!moduleIdForDashboard,
  });

  // Stage 6 "Glass Factory" UI: Fetch lesson inspector data
  const {
    data: lessonInspectorData,
    isLoading: isLoadingLessonInspector,
    error: lessonInspectorError,
  } = useLessonInspectorData({
    courseId: courseInfo.id,
    lessonId: lessonInfoForInspector?.lessonId ?? null,
    enabled: isStage6Lesson && !!lessonInfoForInspector,
  });

  // Reset phase and attempt selection when node changes
  useEffect(() => {
      if (hasPhases && phases.length > 0) {
          // For Stage 4 and 5: prefer 'complete' phase since it contains the final result
          // Other phases contain intermediate data that doesn't match the expected output format
          const completePhase = phases.find((p: any) => p.phaseId === 'complete');
          if (completePhase && (data?.stageNumber === 4 || data?.stageNumber === 5)) {
              setSelectedPhaseId('complete');
          } else {
              // Fallback: select the latest phase
              const latestPhase = phases[phases.length - 1];
              setSelectedPhaseId(latestPhase.phaseId);
          }
          setSelectedAttemptNum(null); // Clear attempt selection
      } else if (data?.attempts && data.attempts.length > 0) {
          // For non-phase nodes: select latest attempt
          const latest = data.attempts[data.attempts.length - 1];
          setSelectedAttemptNum(latest.attemptNumber);
          setSelectedPhaseId(null); // Clear phase selection
      } else {
          setSelectedAttemptNum(null);
          setSelectedPhaseId(null);
      }
  }, [selectedNodeId, data?.attempts, hasPhases, phases]);

  // Reset lesson maximization when drawer closes
  useEffect(() => {
    if (!selectedNodeId) {
      setIsLessonMaximized(false);
    }
  }, [selectedNodeId]);

  // Auto-scroll to RefinementChat (T085)
  useEffect(() => {
      if (!focusRefinement || !selectedNodeId || !refinementChatRef.current) {
          return;
      }
      
      // Small delay to allow drawer animation
      const timer = setTimeout(() => {
          refinementChatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Try to focus input
          const input = refinementChatRef.current?.querySelector('textarea, input');
          if (input instanceof HTMLElement) input.focus();
          clearRefinementFocus();
      }, 300);
      return () => clearTimeout(timer);
  }, [focusRefinement, selectedNodeId, clearRefinementFocus]);

  // Determine data to show based on selected phase or attempt
  const displayData = useMemo((): DisplayData | undefined => {
      // If phases exist and a phase is selected, show phase data
      if (hasPhases && selectedPhaseId && phases.length > 0) {
          const phase = phases.find((p: any) => p.phaseId === selectedPhaseId);
          if (phase) {
              return {
                  label: `${data?.label} - ${phase.phaseName}`,
                  inputData: phase.inputData,
                  outputData: phase.outputData,
                  duration: phase.processMetrics?.duration,
                  tokens: phase.processMetrics?.tokens,
                  model: phase.processMetrics?.model,
                  qualityScore: phase.processMetrics?.qualityScore,
                  status: phase.status,
                  attempts: phase.attempts || [],
                  attemptNumber: 1,
                  retryCount: phase.attempts?.filter((a: TraceAttempt) => a.status === 'failed').length || 0
              };
          }
      }

      // Otherwise, show attempt data (for non-phase nodes or retries within a phase)
      if (selectedAttemptNum && data?.attempts) {
          const attempt = data.attempts.find((a: TraceAttempt) => a.attemptNumber === selectedAttemptNum);
          if (attempt) {
              // For lesson nodes: merge fetched lesson content into outputData
              const outputData = isLessonNode && lessonContentData
                ? {
                    ...attempt.outputData,
                    content: lessonContentData.content,
                    lessonContent: lessonContentData.content,
                    status: lessonContentData.status,
                    metadata: lessonContentData.metadata,
                    // Extract quality info from metadata
                    qualityScore: (lessonContentData.metadata as any)?.qualityScore,
                  }
                : attempt.outputData;

              return {
                  label: data.label,
                  inputData: attempt.inputData,
                  outputData,
                  duration: attempt.processMetrics?.duration,
                  tokens: attempt.processMetrics?.tokens,
                  model: attempt.processMetrics?.model,
                  qualityScore: attempt.processMetrics?.qualityScore,
                  status: attempt.status,
                  attempts: data.attempts,
                  attemptNumber: attempt.attemptNumber,
                  retryCount: data.retryCount
              };
          }
      }

      // For lesson nodes without attempts but with fetched content
      if (isLessonNode && lessonContentData) {
          return {
              ...data,
              outputData: {
                  content: lessonContentData.content,
                  lessonContent: lessonContentData.content,
                  status: lessonContentData.status,
                  metadata: lessonContentData.metadata,
                  qualityScore: (lessonContentData.metadata as any)?.qualityScore,
              },
              qualityScore: (lessonContentData.metadata as any)?.qualityScore,
              status: lessonContentData.status === 'completed' ? 'completed' : data?.status,
          };
      }

      return data;
  }, [data, selectedAttemptNum, hasPhases, selectedPhaseId, phases, isLessonNode, lessonContentData]);

  // Construct chat history - only show REAL user refinement messages
  // DO NOT show LLM prompts (prompt_text) which were incorrectly set as refinementMessage
  const chatHistory = useMemo(() => {
      // For now, return empty until proper refinement tracking is implemented
      // Previously, refinementMessage was incorrectly set to prompt_text (LLM prompt)
      // Real user refinements need to be tracked separately in the database
      return [];
  }, []);

  const handleRefine = async (message: string) => {
      if (!data || !selectedAttemptNum) return;
      
      // Get current output to refine
      const currentOutput = JSON.stringify(displayData?.outputData || {});
      
      await refine(
          `stage_${data.stageNumber}`,
          selectedNodeId || undefined,
          selectedAttemptNum,
          message,
          currentOutput
      );
  };

  const isAIStage = data?.stageNumber && [3, 4, 5, 6].includes(data.stageNumber);

  // Restart button available for stages 2-6 with completed/error/awaiting status
  const canRestart = data?.stageNumber &&
    data.stageNumber >= 2 &&
    displayData?.status &&
    ['completed', 'error', 'awaiting'].includes(displayData.status);

  // Calculate SheetContent width based on node type
  const getSheetWidthClass = () => {
    if (isStage6Lesson) {
      // Lesson nodes: wide by default, fullscreen when maximized
      if (isLessonMaximized) {
        return 'w-screen max-w-none'; // Full width
      }
      return 'w-full sm:w-[85vw] sm:max-w-[85vw]'; // 85% width
    }
    // Other nodes: standard behavior
    return isExpanded ? 'max-w-[100vw]' : 'max-w-[50vw]';
  };

  return (
    <Sheet
      open={!!selectedNodeId}
      onOpenChange={(open) => !open && deselectNode()}
      aria-expanded={!!selectedNodeId}
    >
      <SheetContent
        side="right"
        className={cn(
          'w-full overflow-y-auto transition-all duration-300 ease-in-out',
          getSheetWidthClass(),
          // Remove padding for lesson nodes - LessonInspectorLayout handles its own padding
          isStage6Lesson && 'p-0'
        )}
        data-testid="node-details-drawer"
      >
        <SheetHeader className="pr-12">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2" data-testid="drawer-title">
              {data?.stageNumber
                ? t(`stages.stage_${data.stageNumber}`)
                : data?.label
                  ? String(data.label)
                  : `Details: ${selectedNodeId}`}
            </SheetTitle>
            <div className="flex items-center gap-1">
              {/* Restart Button - only for stages 2-6 with error/completed/awaiting */}
              {canRestart && courseSlug && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowRestartDialog(true)}
                        className="h-8 w-8 text-slate-500 hover:text-orange-600 hover:bg-orange-50"
                        data-testid="drawer-restart-button"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('restart.buttonTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Only show expand button for non-lesson nodes */}
              {!isStage6Lesson && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleExpand}
                  className="h-8 w-8 shrink-0"
                  title={isExpanded ? t('drawer.collapse') : t('drawer.expand')}
                  data-testid="drawer-expand-button"
                >
                  {isExpanded ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
          <SheetDescription>
            Inspect stage data and execution metrics.
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 h-[calc(100vh-140px)]">
          {/* Stage 6 "Glass Factory" UI: Module Dashboard */}
          {isStage6Module ? (
            <ModuleDashboard
              data={moduleDashboardData}
              isLoading={isLoadingModuleDashboard}
              error={moduleDashboardError}
              onExportAll={() => {/* TODO: Implement export */}}
              onRegenerateFailed={() => {/* TODO: Implement regenerate failed */}}
              onImproveQuality={() => {/* TODO: Implement improve quality */}}
              className="h-full"
            />
          ) : isStage6Lesson ? (
            /* Stage 6 "Glass Factory" UI: Lesson Inspector */
            <LessonInspector
              data={lessonInspectorData}
              isLoading={isLoadingLessonInspector}
              error={lessonInspectorError}
              onBack={deselectNode}
              onClose={deselectNode}
              onApprove={handleApproveLesson}
              onEdit={handleEditLesson}
              onRegenerate={handleRegenerateLesson}
              onRetryNode={(_node) => {/* TODO: Implement retry node */}}
              isMaximized={isLessonMaximized}
              onToggleMaximize={() => setIsLessonMaximized(!isLessonMaximized)}
              className="h-full"
              isApproving={isApproving}
            />
          ) : (
            /* Default tab-based UI for other node types */
            <>
              {/* Approval Controls - show when stage is awaiting approval */}
              {isAwaitingApproval && courseSlug && data?.stageNumber && (
                 <div className="mb-6 p-4 rounded-lg border bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200 dark:from-purple-900/20 dark:to-indigo-900/20 dark:border-purple-700">
                     <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                         {t('drawer.awaitingMessage')}
                     </p>
                     <ApprovalControls
                        courseId={courseInfo.id}
                        courseSlug={courseSlug}
                        stageNumber={data.stageNumber}
                        onApproved={deselectNode}
                        onRegenerated={deselectNode}
                        variant="prominent"
                     />
                 </div>
              )}

              {/* Phase Selector for stages with phases (4, 5) */}
              {hasPhases && phases.length > 0 && (
                <PhaseSelector
                  stageId={`stage_${data?.stageNumber}`}
                  phases={phases.map((p: any) => ({
                    phaseId: p.phaseId,
                    attemptNumber: 1,
                    timestamp: p.timestamp.toISOString(),
                    status: p.status
                  }))}
                  selectedPhase={selectedPhaseId}
                  onSelectPhase={setSelectedPhaseId}
                  locale="ru"
                />
              )}

              {/* Attempt Selector only for actual retries (not phases) */}
              {!hasPhases && data?.attempts && data.attempts.length > 1 && (
                 <AttemptSelector
                    attempts={data.attempts}
                    selectedAttempt={selectedAttemptNum || 1}
                    onSelectAttempt={setSelectedAttemptNum}
                 />
              )}

              <Tabs defaultValue="output" className="w-full" data-testid="drawer-tabs">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="input" data-testid="tab-input">{t('drawer.input')}</TabsTrigger>
                  <TabsTrigger value="process" data-testid="tab-process">{t('drawer.process')}</TabsTrigger>
                  <TabsTrigger value="output" data-testid="tab-output">{t('drawer.output')}</TabsTrigger>
                  <TabsTrigger value="activity" data-testid="tab-activity">{t('drawer.activity')}</TabsTrigger>
                </TabsList>

                <TabsContent value="input" className="mt-4 space-y-4" data-testid="content-input">
                  <InputTab inputData={displayData?.inputData} />
                </TabsContent>

                <TabsContent value="process" className="mt-4 space-y-4" data-testid="content-process">
                  <ProcessTab
                    duration={displayData?.duration}
                    tokens={displayData?.tokens}
                    model={displayData?.model}
                    status={displayData?.status}
                    attemptNumber={displayData?.attemptNumber}
                    retryCount={displayData?.retryCount}
                    qualityScore={displayData?.qualityScore}
                  />
                </TabsContent>

                <TabsContent value="output" className="mt-4 space-y-4" data-testid="content-output">
                  <OutputTab
                    outputData={displayData?.outputData}
                    stageId={`stage_${data?.stageNumber}`}
                    courseId={courseInfo.id}
                    editable={canEdit}
                    readOnly={isAdmin && !isAwaitingApproval}
                    autoFocus={autoOpened}
                    onApproved={deselectNode}
                    nodeType={selectedNode?.type}
                    isLoading={isLessonNode && isLoadingLessonContent}
                  />
                </TabsContent>

                <TabsContent value="activity" className="mt-4 space-y-4" data-testid="content-activity">
                  <ActivityTab nodeId={selectedNodeId} />
                </TabsContent>
              </Tabs>

              {/* Refinement Chat (T084) */}
              {isAIStage && (
                  <div ref={refinementChatRef}>
                      <RefinementChat
                          courseId={courseInfo.id}
                          stageId={`stage_${data?.stageNumber}`}
                          nodeId={selectedNodeId || undefined}
                          attemptNumber={selectedAttemptNum || 1}
                          onRefine={handleRefine}
                          history={chatHistory}
                          isProcessing={isRefining}
                      />
                  </div>
              )}
            </>
          )}
        </div>

        {/* Restart Confirmation Dialog */}
        {courseSlug && data?.stageNumber && (
          <RestartConfirmDialog
            open={showRestartDialog}
            onClose={() => setShowRestartDialog(false)}
            courseSlug={courseSlug}
            stageNumber={data.stageNumber}
            stageName={t(`stages.stage_${data.stageNumber}`)}
            onSuccess={() => {
              // State updates automatically via realtime subscription or polling
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
});
