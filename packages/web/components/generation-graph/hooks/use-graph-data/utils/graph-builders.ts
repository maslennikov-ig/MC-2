import { AppNode, AppEdge } from '../../../types';
import { GRAPH_STAGE_CONFIG } from '@/lib/generation-graph/constants';
import { NodeStatus, TraceAttempt } from '@megacampus/shared-types';
import { ParallelItem, DocumentWithSteps, PhaseData, Stage1CourseData } from '../types';
import { calculateDocumentStatus } from './graph-transformers';
import { GenerationTrace } from '@/components/generation-celestial/utils';

// Layout constants for Stage 6 modules and lessons
// These match the values in useGraphLayout.ts
const LAYOUT_CONFIG = {
  MODULE_WIDTH: 300,
  MODULE_COLLAPSED_HEIGHT: 90,
  MODULE_HEADER_HEIGHT: 60,
  LESSON_HEIGHT: 50,
  LESSON_GAP: 10,
  MODULE_PADDING: 15,
} as const;

interface BuildGraphParams {
  parallelItems: Map<number, ParallelItem[]>;
  stageStatuses: Record<string, NodeStatus>;
  documentSteps: Map<string, DocumentWithSteps>;
  hasDocuments: boolean;
  /** Pre-loaded Stage 1 course data (for display before generation starts) */
  stage1CourseData?: Stage1CourseData;
  getTrace: (id: string) => GenerationTrace | undefined;
  getAttempts: (id: string) => TraceAttempt[];
  getPhases: (id: string) => PhaseData[];
  getExistingPos: (id: string) => { x: number; y: number };
  getModuleCollapsed: (id: string) => boolean | undefined;
}

export function buildGraph({
  parallelItems,
  stageStatuses,
  documentSteps,
  hasDocuments,
  stage1CourseData,
  getTrace,
  getAttempts,
  getPhases,
  getExistingPos,
  getModuleCollapsed
}: BuildGraphParams): { nodes: AppNode[]; edges: AppEdge[] } {
  const newNodes: AppNode[] = [];
  const newEdges: AppEdge[] = [];
  
  // Helper to get status
  const getStatus = (id: string) => stageStatuses[id] || 'pending';
  
  let prevNodeId = 'stage_1'; 

  for (let i = 1; i <= 6; i++) {
    const stageKey = `stage_${i}`;
    const config = GRAPH_STAGE_CONFIG[stageKey];
    const items = parallelItems.get(i);

    // Handle skipped stages when no documents (Stage 2 and Stage 3 are skipped)
    if (!hasDocuments && (i === 2 || i === 3)) {
      newNodes.push({
        id: stageKey,
        type: 'stage',
        position: getExistingPos(stageKey),
        data: {
          ...config,
          status: 'skipped' as const,
          stageNumber: i as 1 | 2 | 3 | 4 | 5 | 6,
          label: config.name,
        }
      });

      if (i > 1) {
        newEdges.push({
          id: `e${prevNodeId}-${stageKey}`,
          source: prevNodeId,
          target: stageKey,
          type: 'animated',
          data: { status: 'idle', animated: false }
        });
      }

      prevNodeId = stageKey;
      continue;
    }

    // Special handling for Stage 2: Documents
    if (i === 2 && documentSteps.size > 0) {
      const documentNodeIds: string[] = [];

      documentSteps.forEach((doc) => {
        const docNodeId = `doc_${doc.id.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
        const overallStatus = calculateDocumentStatus(doc.steps);
        const completedStages = doc.steps.filter(s => s.status === 'completed').length;
        const totalStages = doc.steps.length;
        const allAttempts = doc.steps.flatMap(s => s.attempts);

        const stages = doc.steps.map((step, idx) => ({
          stageId: step.id,
          stageName: step.stepName,
          stageNumber: idx + 1,
          status: step.status,
          attempts: step.attempts,
          inputData: step.inputData as Record<string, unknown> | undefined,
          outputData: step.outputData as Record<string, unknown> | undefined
        }));

        newNodes.push({
          id: docNodeId,
          type: 'document',
          position: getExistingPos(docNodeId),
          data: {
            ...config,
            label: doc.name,
            filename: doc.name,
            documentId: doc.id,
            status: overallStatus,
            stageNumber: 2 as const,
            color: config.color,
            priority: doc.priority,
            stages: stages,
            completedStages,
            totalStages,
            attempts: allAttempts,
            inputData: stages[0]?.inputData,
            outputData: stages[stages.length - 1]?.outputData,
            retryCount: allAttempts.filter(a => a.status === 'failed').length
          }
        } as AppNode);

        newEdges.push({
          id: `e${prevNodeId}-${docNodeId}`,
          source: prevNodeId,
          target: docNodeId,
          type: 'animated',
          data: { status: 'idle', animated: false }
        });

        documentNodeIds.push(docNodeId);
      });

      const mergeId = 'merge_stage_2';
      newNodes.push({
        id: mergeId,
        type: 'merge',
        position: getExistingPos(mergeId),
        data: {
          label: 'Merge',
          status: 'pending',
          stageNumber: null,
          sourceIds: documentNodeIds,
          color: '#94a3b8',
          icon: 'GitMerge'
        }
      });

      documentNodeIds.forEach(nodeId => {
        newEdges.push({
          id: `e${nodeId}-${mergeId}`,
          source: nodeId,
          target: mergeId,
          type: 'animated',
          data: { status: 'idle', animated: false }
        });
      });

      prevNodeId = mergeId;
      continue;
    }

    // Special handling for Stage 6: Modules/Lessons
    if (i === 6 && config.parallelizable && items && items.length > 0) {
      const modules = items.filter(item => item.type === 'module');
      const lessons = items.filter(item => item.type === 'lesson');

      let stage6Status: NodeStatus = 'pending';
      if (lessons.some(l => (l.status || getStatus(l.id)) === 'error')) {
        stage6Status = 'error';
      } else if (lessons.some(l => (l.status || getStatus(l.id)) === 'active')) {
        stage6Status = 'active';
      } else if (lessons.length > 0 && lessons.every(l => (l.status || getStatus(l.id)) === 'completed')) {
        stage6Status = 'completed';
      }

      const allLessonAttempts = lessons.flatMap(l => getAttempts(l.id));
      const totalTokens = allLessonAttempts.reduce((sum, a) => sum + (a.processMetrics?.tokens || 0), 0);
      const totalCost = allLessonAttempts.reduce((sum, a) => sum + (a.processMetrics?.cost || 0), 0);
      const totalDuration = allLessonAttempts.reduce((sum, a) => sum + (a.processMetrics?.duration || 0), 0);
      const completedLessons = lessons.filter(l => (l.status || getStatus(l.id)) === 'completed').length;

      newNodes.push({
        id: stageKey,
        type: 'stage',
        position: getExistingPos(stageKey),
        data: {
          ...config,
          status: stage6Status,
          stageNumber: 6 as const,
          label: config.name,
          tokens: totalTokens,
          cost: totalCost,
          duration: totalDuration,
          attempts: allLessonAttempts,
          outputData: {
            completedLessons,
            totalLessons: lessons.length
          }
        }
      });

      newEdges.push({
        id: `e${prevNodeId}-${stageKey}`,
        source: prevNodeId,
        target: stageKey,
        type: 'animated',
        data: { status: 'idle', animated: false }
      });

      const extractSortKey = (id: string): number => {
        const numbers = id.match(/\d+/g);
        if (!numbers) return 0;
        if (numbers.length >= 2) {
          return parseInt(numbers[0]) * 1000 + parseInt(numbers[1]);
        }
        return parseInt(numbers[0]);
      };

      const moduleItems = items
        .filter(item => item.type === 'module')
        .sort((a, b) => {
          const aNum = (a.data?.moduleOrder as number) ?? (a.data?.section_number as number) ?? extractSortKey(a.id);
          const bNum = (b.data?.moduleOrder as number) ?? (b.data?.section_number as number) ?? extractSortKey(b.id);
          return aNum - bNum;
        });

      const lessonItems = items
        .filter(item => item.type === 'lesson')
        .sort((a, b) => {
          const aNum = (a.data?.lessonOrder as number) ?? extractSortKey(a.id);
          const bNum = (b.data?.lessonOrder as number) ?? extractSortKey(b.id);
          return aNum - bNum;
        });

      moduleItems.forEach(item => {
        const trace = getTrace(item.id);
        const attempts = getAttempts(item.id);
        const latestAttempt = attempts[attempts.length - 1];
        const childLessons = lessonItems.filter(lesson => lesson.parentId === item.id);
        const childIds = childLessons.map(lesson => lesson.id);
        const childStatuses = childLessons.map(lesson => lesson.status || getStatus(lesson.id));
        const completedLessons = childStatuses.filter(s => s === 'completed').length;
        const totalLessons = childIds.length;

        let moduleStatus: NodeStatus = 'pending';
        if (childStatuses.some(s => s === 'error')) moduleStatus = 'error';
        else if (childStatuses.some(s => s === 'active')) moduleStatus = 'active';
        else if (totalLessons > 0 && completedLessons === totalLessons) moduleStatus = 'completed';
        else if (completedLessons > 0) moduleStatus = 'active';

        const defaultCollapsed = modules.length > 5;
        const isCollapsed = getModuleCollapsed(item.id) ?? (item.data?.isCollapsed as boolean) ?? defaultCollapsed;

        // Calculate module height based on collapse state
        const moduleHeight = isCollapsed
          ? LAYOUT_CONFIG.MODULE_COLLAPSED_HEIGHT
          : LAYOUT_CONFIG.MODULE_HEADER_HEIGHT +
            (totalLessons * (LAYOUT_CONFIG.LESSON_HEIGHT + LAYOUT_CONFIG.LESSON_GAP)) +
            LAYOUT_CONFIG.MODULE_PADDING;

        newNodes.push({
          id: item.id,
          type: 'module',
          position: getExistingPos(item.id),
          // React Flow requires parent nodes to have explicit dimensions for child positioning
          style: {
            width: LAYOUT_CONFIG.MODULE_WIDTH,
            height: Math.max(moduleHeight, 150), // Minimum height for visual balance
          },
          data: {
            ...config,
            ...item.data,
            label: item.label,
            status: moduleStatus,
            stageNumber: 6 as const,
            moduleId: item.id,
            title: item.label,
            totalLessons: totalLessons,
            completedLessons: completedLessons,
            isCollapsed: isCollapsed,
            childIds: childIds,
            currentStep: trace?.step_name,
            duration: trace?.duration_ms,
            tokens: trace?.tokens_used,
            cost: trace?.cost_usd,
            attempts: attempts,
            inputData: latestAttempt?.inputData,
            outputData: latestAttempt?.outputData,
            retryCount: attempts.filter(a => a.status === 'failed').length
          }
        } as AppNode);
      });

      const defaultCollapsedForLessons = modules.length > 5;
      const moduleCollapsedMap = new Map(
        moduleItems.map(m => [m.id, getModuleCollapsed(m.id) ?? (m.data?.isCollapsed as boolean) ?? defaultCollapsedForLessons])
      );

      // Group lessons by parent module for proper index-based positioning
      const lessonsByParent = new Map<string, typeof lessonItems>();
      lessonItems.forEach(item => {
        if (!item.parentId) return;
        if (!lessonsByParent.has(item.parentId)) {
          lessonsByParent.set(item.parentId, []);
        }
        lessonsByParent.get(item.parentId)!.push(item);
      });

      // Create lesson nodes with calculated positions (relative to parent's top-left)
      lessonsByParent.forEach((lessonsInModule, parentId) => {
        const parentCollapsed = moduleCollapsedMap.get(parentId) ?? false;

        lessonsInModule.forEach((item, indexInModule) => {
          const trace = getTrace(item.id);
          const currentStatus = item.status || getStatus(item.id);
          const attempts = getAttempts(item.id);
          const latestAttempt = attempts[attempts.length - 1];

          // Calculate position based on index within module
          // y = header height + (index * row height)
          const lessonY = LAYOUT_CONFIG.MODULE_HEADER_HEIGHT +
                         (indexInModule * (LAYOUT_CONFIG.LESSON_HEIGHT + LAYOUT_CONFIG.LESSON_GAP));
          const lessonX = LAYOUT_CONFIG.MODULE_PADDING;

          newNodes.push({
            id: item.id,
            type: 'lesson',
            parentId: item.parentId,
            extent: 'parent',
            // Position is RELATIVE to parent's top-left corner (React Flow requirement)
            position: { x: lessonX, y: lessonY },
            hidden: parentCollapsed,
            draggable: false,
            // Explicit dimensions for proper rendering
            style: {
              width: LAYOUT_CONFIG.MODULE_WIDTH - (2 * LAYOUT_CONFIG.MODULE_PADDING),
              height: LAYOUT_CONFIG.LESSON_HEIGHT,
            },
            data: {
              ...config,
              label: item.label,
              status: currentStatus,
              stageNumber: 6 as const,
              lessonId: item.id,
              title: item.label,
              moduleId: item.parentId || '',
              ...item.data,
              currentStep: trace?.step_name,
              duration: trace?.duration_ms,
              tokens: trace?.tokens_used,
              cost: trace?.cost_usd,
              attempts: attempts,
              inputData: latestAttempt?.inputData,
              outputData: latestAttempt?.outputData,
              retryCount: attempts.filter(a => a.status === 'failed').length
            }
          } as AppNode);
        });
      });

      const splitterId = 'stage6_splitter';
      newNodes.push({
        id: splitterId,
        type: 'merge',
        position: getExistingPos(splitterId),
        data: {
          label: 'Split',
          status: 'pending',
          stageNumber: null,
          sourceIds: modules.map(m => m.id),
          color: '#10B981',
          icon: 'GitBranch'
        }
      });

      newEdges.push({
        id: `e${stageKey}-${splitterId}`,
        source: stageKey,
        target: splitterId,
        type: 'animated',
        data: { status: 'idle', animated: false }
      });

      modules.forEach(mod => {
        newEdges.push({
          id: `e${splitterId}-${mod.id}`,
          source: splitterId,
          target: mod.id,
          type: 'animated',
          data: { status: 'idle', animated: false }
        });
      });

      const mergerId = 'stage6_merger';
      newNodes.push({
        id: mergerId,
        type: 'merge',
        position: getExistingPos(mergerId),
        data: {
          label: 'Merge',
          status: 'pending',
          stageNumber: null,
          sourceIds: modules.map(m => m.id),
          color: '#10B981',
          icon: 'GitMerge'
        }
      });

      modules.forEach(mod => {
        newEdges.push({
          id: `e${mod.id}-${mergerId}`,
          source: mod.id,
          target: mergerId,
          type: 'animated',
          data: { status: 'idle', animated: false }
        });
      });

      prevNodeId = mergerId;

    } else if (config.parallelizable && items && items.length > 0) {
      const itemNodes: string[] = [];

      items.forEach(item => {
        if (item.type === 'document' || item.type === 'document-step') return;
        if (item.type === 'lesson' || item.type === 'module') return;
        itemNodes.push(item.id);
      });

      itemNodes.forEach(nodeId => {
        newEdges.push({
          id: `e${prevNodeId}-${nodeId}`,
          source: prevNodeId,
          target: nodeId,
          type: 'animated',
          data: { status: 'idle', animated: false }
        });
      });

      const mergeId = `merge_${stageKey}`;
      newNodes.push({
        id: mergeId,
        type: 'merge',
        position: getExistingPos(mergeId),
        data: {
          label: 'Merge',
          status: 'pending',
          stageNumber: null,
          sourceIds: itemNodes,
          color: '#94a3b8',
          icon: 'GitMerge'
        }
      });

      itemNodes.forEach(nodeId => {
        newEdges.push({
          id: `e${nodeId}-${mergeId}`,
          source: nodeId,
          target: mergeId,
          type: 'animated',
          data: { status: 'idle', animated: false }
        });
      });

      prevNodeId = mergeId;

    } else {
      const trace = getTrace(stageKey);
      const currentStatus = getStatus(stageKey);
      const attempts = getAttempts(stageKey);
      const phases = getPhases(stageKey);
      const latestAttempt = attempts[attempts.length - 1];

      // For Stage 1: use pre-loaded course data if no traces exist yet
      // This allows displaying course info BEFORE generation starts
      const isStage1 = i === 1;
      const hasStage1Preload = isStage1 && stage1CourseData;

      // Stage 1 status: 'completed' if course data exists (course was created)
      // Otherwise fall back to trace status or 'pending'
      const effectiveStatus = hasStage1Preload && currentStatus === 'pending'
        ? 'completed' as NodeStatus
        : currentStatus;

      // Stage 1 data: use preloaded data if no traces, otherwise use trace data
      const effectiveInputData = isStage1
        ? (latestAttempt?.inputData || stage1CourseData?.inputData)
        : latestAttempt?.inputData;
      const effectiveOutputData = isStage1
        ? (latestAttempt?.outputData || stage1CourseData?.outputData)
        : latestAttempt?.outputData;

      newNodes.push({
        id: stageKey,
        type: 'stage',
        position: getExistingPos(stageKey),
        data: {
          ...config,
          status: effectiveStatus,
          stageNumber: i as 1 | 2 | 3 | 4 | 5 | 6,
          label: config.name,
          duration: trace?.duration_ms,
          tokens: trace?.tokens_used,
          cost: trace?.cost_usd,
          currentStep: trace?.step_name,
          attempts: attempts,
          phases: phases.length > 0 ? phases : undefined,
          inputData: effectiveInputData,
          outputData: effectiveOutputData,
          retryCount: attempts.filter(a => a.status === 'failed').length
        }
      });

      if (i > 1) { 
         newEdges.push({
          id: `e${prevNodeId}-${stageKey}`,
          source: prevNodeId,
          target: stageKey,
          type: 'animated',
          data: { status: 'idle', animated: false }
        });
      }
      
      prevNodeId = stageKey;
    }
  }

  // End Node
  newNodes.push({
    id: 'end',
    type: 'end',
    position: getExistingPos('end'),
    data: {
      label: 'Complete',
      icon: 'CheckCircle',
      color: '#10B981',
      status: 'pending',
      stageNumber: null
    }
  });

  newEdges.push({
    id: `e${prevNodeId}-end`,
    source: prevNodeId,
    target: 'end',
    type: 'animated',
    data: { status: 'idle', animated: false }
  });

  return { nodes: newNodes, edges: newEdges };
}