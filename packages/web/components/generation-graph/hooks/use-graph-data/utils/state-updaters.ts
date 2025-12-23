import { GenerationTrace } from '@/components/generation-celestial/utils';
import { NodeStatus, TraceAttempt } from '@megacampus/shared-types';
import { ParallelItem, DocumentWithSteps, DocumentStepData, ModuleStructure, PhaseData } from '../types';
import { extractDocumentId, extractDocumentName } from './trace-extractors';
import { translateStepName } from './step-translations';
import { traceToAttempt, isValidModuleStructure } from './graph-transformers';
import { getPhaseName } from '@/lib/generation-graph/phase-names';

export function updateDocumentSteps(
  prevDocs: Map<string, DocumentWithSteps>,
  newTraces: GenerationTrace[],
  attemptsMap: Map<string, TraceAttempt[]>, // We need this to get existing attempts
  getFilename?: (id: string) => string | undefined
): { nextDocs: Map<string, DocumentWithSteps>; attemptsUpdates: Map<string, TraceAttempt[]> } {
  const nextDocs = new Map(prevDocs);
  const attemptsUpdates = new Map<string, TraceAttempt[]>();
  let hasChanges = false;

  newTraces.forEach(trace => {
    if (trace.stage !== 'stage_2') return;

    const docId = extractDocumentId(trace);
    const docName = extractDocumentName(trace);
    const stepName = trace.step_name || trace.phase || 'Processing';

    if (docId) {
      const existingDoc = nextDocs.get(docId);
      const stepId = `${docId}_${stepName.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
      const stepNodeId = `step_${stepId}`;

      // Build attempt
      const newAttempt = traceToAttempt(trace);
      
      // Update attempts (accumulate updates)
      const existingStepAttempts = attemptsUpdates.get(stepNodeId) || attemptsMap.get(stepNodeId) || [];
      const updatedAttempts = [...existingStepAttempts, newAttempt];
      attemptsUpdates.set(stepNodeId, updatedAttempts);

      // Determine status
      const stepStatus: NodeStatus = trace.error_data
        ? 'error'
        : trace.output_data
          ? 'completed'
          : 'active';

      const newStep: DocumentStepData = {
        id: stepId,
        stepName: translateStepName(stepName),
        status: stepStatus,
        traceId: trace.id,
        timestamp: new Date(trace.created_at).getTime(),
        attempts: updatedAttempts,
        inputData: trace.input_data,
        outputData: trace.output_data
      };

      if (existingDoc) {
        const stepIdx = existingDoc.steps.findIndex(s => s.id === stepId);
        if (stepIdx >= 0) {
          const existingStatus = existingDoc.steps[stepIdx].status;
          const finalStatus = existingStatus === 'completed' ? 'completed' : stepStatus;
          existingDoc.steps[stepIdx] = {
            ...existingDoc.steps[stepIdx],
            status: finalStatus,
            attempts: newStep.attempts,
            inputData: newStep.inputData,
            outputData: newStep.outputData
          };
        } else {
          existingDoc.steps.push(newStep);
          existingDoc.steps.sort((a, b) => a.timestamp - b.timestamp);
        }
        
        const betterName = docName || getFilename?.(docId);
        if (betterName && existingDoc.name.startsWith('Документ ')) {
          existingDoc.name = betterName;
        }
      } else {
        const displayName = docName || getFilename?.(docId) || `Документ ${docId.substring(0, 8)}...`;
        nextDocs.set(docId, {
          id: docId,
          name: displayName,
          steps: [newStep],
          priority: trace.input_data?.priority as any
        });
      }
      hasChanges = true;
    }
  });

  return { nextDocs: hasChanges ? nextDocs : prevDocs, attemptsUpdates };
}

export function updateParallelItems(
  prevItems: Map<number, ParallelItem[]>,
  newTraces: GenerationTrace[]
): Map<number, ParallelItem[]> {
  const nextItems = new Map(prevItems);
  let hasChanges = false;

  newTraces.forEach(trace => {
    // Stage 6: Modules/Lessons from Structure (Stage 5 Output)
    if (trace.stage === 'stage_5') {
      let modules: ModuleStructure[] = [];

      if (trace.output_data?.modules) {
        const rawModules = trace.output_data.modules;
        if (isValidModuleStructure(rawModules)) {
          modules = rawModules;
        }
      } else if (trace.output_data?.course_structure?.sections) {
        const sections = trace.output_data.course_structure.sections as any[];
        modules = sections.map((section, idx) => ({
          id: String(idx + 1),
          title: section.section_title || `Модуль ${idx + 1}`,
          lessons: section.lessons?.map((lesson: any, lessonIdx: number) => ({
            id: `${idx + 1}_${lessonIdx + 1}`,
            title: lesson.lesson_title || `Урок ${lessonIdx + 1}`
          }))
        }));
      }

      const existingStage6 = nextItems.get(6) || [];

      if (existingStage6.length === 0 && modules.length > 0) {
        const stage6Items: ParallelItem[] = [];
        modules.forEach((mod, moduleIndex) => {
          const moduleOrder = moduleIndex + 1;
          const modId = `module_${moduleOrder}`;
          stage6Items.push({
            id: modId,
            label: mod.title,
            status: 'pending',
            type: 'module',
            data: {
              ...mod,
              moduleOrder,
              totalLessons: mod.lessons?.length || 0,
              completedLessons: 0,
              isCollapsed: modules.length > 5
            }
          });

          mod.lessons?.forEach((les, lessonIndex) => {
            const lessonOrder = lessonIndex + 1;
            stage6Items.push({
              id: `lesson_${moduleOrder}_${lessonOrder}`,
              label: les.title,
              status: 'pending',
              type: 'lesson',
              parentId: modId,
              data: { lessonOrder }
            });
          });
        });
        nextItems.set(6, stage6Items);
        hasChanges = true;
      }
    }

    // Stage 6: Lesson Generation Progress
    if (trace.stage === 'stage_6') {
      const lessonLabel = trace.input_data?.lessonLabel as string | undefined;
      const lessonId = lessonLabel
        ? `lesson_${lessonLabel.replace('.', '_')}`
        : trace.lesson_id
          ? `lesson_${trace.lesson_id}`
          : null;

      if (!lessonId) return;

      const existingStage6 = nextItems.get(6) || [];
      const lessonIndex = existingStage6.findIndex(item => item.id === lessonId);
      
      if (lessonIndex >= 0) {
        const lesson = existingStage6[lessonIndex];
        const currentStep = trace.step_name || trace.phase;
        const displayStep = currentStep ? translateStepName(currentStep) : undefined;
        const lessonStatus: NodeStatus = trace.error_data ? 'error' : trace.output_data ? 'completed' : 'active';

        const updatedLesson: ParallelItem = {
          ...lesson,
          status: lessonStatus,
          data: { ...lesson.data, currentStep: displayStep }
        };

        const updatedItems = [...existingStage6];
        updatedItems[lessonIndex] = updatedLesson;

        // Update module status
        const moduleId = lesson.parentId;
        if (moduleId) {
          const moduleIndex = updatedItems.findIndex(item => item.id === moduleId);
          if (moduleIndex >= 0) {
            const moduleItem = updatedItems[moduleIndex];
            const moduleLessons = updatedItems.filter(item => item.type === 'lesson' && item.parentId === moduleId);
            const completedCount = moduleLessons.filter(l => l.status === 'completed').length;

            let moduleStatus: NodeStatus = 'pending';
            if (moduleLessons.some(l => l.status === 'error')) moduleStatus = 'error';
            else if (moduleLessons.some(l => l.status === 'active')) moduleStatus = 'active';
            else if (moduleLessons.every(l => l.status === 'completed')) moduleStatus = 'completed';

            updatedItems[moduleIndex] = {
              ...moduleItem,
              status: moduleStatus,
              data: { ...moduleItem.data, completedLessons: completedCount }
            };
          }
        }

        nextItems.set(6, updatedItems);
        hasChanges = true;
      }
    }
  });

  return hasChanges ? nextItems : prevItems;
}

export function updateStageStatuses(
  prevStatuses: Record<string, NodeStatus>,
  newTraces: GenerationTrace[]
): Record<string, NodeStatus> {
  const next = { ...prevStatuses };
  let hasChanges = false;

  newTraces.forEach(trace => {
    let nodeId: string = trace.stage;

    if (trace.stage === 'stage_2') {
      const docId = extractDocumentId(trace);
      if (docId) nodeId = `doc_${docId.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
    } else if (trace.stage === 'stage_6') {
      if (!trace.lesson_id) return;
      const lessonLabel = trace.input_data?.lessonLabel as string | undefined;
      nodeId = lessonLabel ? `lesson_${lessonLabel.replace('.', '_')}` : `lesson_${trace.lesson_id}`;
    }

    const isError = !!trace.error_data;
    const isFinished = trace.step_name === 'finish';
    const newStatus: NodeStatus = isError ? 'error' : isFinished ? 'completed' : 'active';

    if (next[nodeId] !== newStatus) {
      next[nodeId] = newStatus;
      hasChanges = true;
    }
  });

  return hasChanges ? next : prevStatuses;
}

export function updateAttemptsMap(
  prevAttempts: Map<string, TraceAttempt[]>,
  newTraces: GenerationTrace[]
): Map<string, TraceAttempt[]> {
  const next = new Map(prevAttempts);
  let hasChanges = false;

  const tracesByNode = new Map<string, GenerationTrace[]>();
  newTraces.forEach(trace => {
    let nodeId: string = trace.stage;
    
    if (trace.stage === 'stage_2') {
      const docId = extractDocumentId(trace);
      if (docId) nodeId = `doc_${docId.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
    } else if (trace.stage === 'stage_6') {
      if (!trace.lesson_id) return;
      const lessonLabel = trace.input_data?.lessonLabel as string | undefined;
      nodeId = lessonLabel ? `lesson_${lessonLabel.replace('.', '_')}` : `lesson_${trace.lesson_id}`;
    }

    if (!tracesByNode.has(nodeId)) tracesByNode.set(nodeId, []);
    tracesByNode.get(nodeId)!.push(trace);
  });

  tracesByNode.forEach((traces, nodeId) => {
    const existingAttempts = next.get(nodeId) || [];
    const existingAttemptNums = new Set(existingAttempts.map(a => a.attemptNumber));
    const finishTraces = traces.filter(t => t.step_name === 'finish');
    
    const newAttempts = finishTraces
      .filter(trace => !existingAttemptNums.has((trace.retry_attempt ?? 0) + 1))
      .map(traceToAttempt);

    if (newAttempts.length > 0) {
      next.set(nodeId, [...existingAttempts, ...newAttempts]);
      hasChanges = true;
    }
  });

  return hasChanges ? next : prevAttempts;
}

export function updatePhasesMap(
  prevPhases: Map<string, PhaseData[]>,
  newTraces: GenerationTrace[]
): Map<string, PhaseData[]> {
  const next = new Map(prevPhases);
  let hasChanges = false;

  const tracesByNodeAndPhase = new Map<string, Map<string, GenerationTrace[]>>();
  newTraces.forEach(trace => {
    if (trace.stage !== 'stage_4' && trace.stage !== 'stage_5') return;
    
    const nodeId = trace.stage;
    const phaseId = trace.phase || 'unknown';
    
    if (!tracesByNodeAndPhase.has(nodeId)) tracesByNodeAndPhase.set(nodeId, new Map());
    const phaseMap = tracesByNodeAndPhase.get(nodeId)!;
    if (!phaseMap.has(phaseId)) phaseMap.set(phaseId, []);
    phaseMap.get(phaseId)!.push(trace);
  });

  tracesByNodeAndPhase.forEach((phaseMap, nodeId) => {
    const existingPhases = next.get(nodeId) || [];
    const phaseDataArray: PhaseData[] = [];

    phaseMap.forEach((traces, phaseId) => {
      const sortedTraces = [...traces].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const latestTrace = sortedTraces[sortedTraces.length - 1];
      const phaseName = getPhaseName(nodeId, phaseId, 'ru');
      const phaseStatus: NodeStatus = latestTrace.error_data ? 'error' : latestTrace.output_data ? 'completed' : 'active';
      const retryAttempts = sortedTraces.filter(t => (t.retry_attempt ?? 0) > 0).map(traceToAttempt);

      phaseDataArray.push({
        phaseId,
        phaseName,
        status: phaseStatus,
        timestamp: new Date(latestTrace.created_at),
        inputData: latestTrace.input_data || undefined,
        outputData: latestTrace.output_data || undefined,
        processMetrics: {
          model: latestTrace.model_used || 'unknown',
          tokens: latestTrace.tokens_used || 0,
          duration: latestTrace.duration_ms || 0,
          cost: latestTrace.cost_usd || 0,
        },
        attempts: retryAttempts.length > 0 ? retryAttempts : undefined,
      });
    });

    // Determine if we need to update
    const existingPhasesJson = JSON.stringify(existingPhases.map(p => p.phaseId).sort());
    const newPhasesJson = JSON.stringify(phaseDataArray.map(p => p.phaseId).sort());

    if (existingPhasesJson !== newPhasesJson || phaseDataArray.length > 0) {
      const mergedPhases = [...existingPhases];
      phaseDataArray.forEach(newPhase => {
        const idx = mergedPhases.findIndex(p => p.phaseId === newPhase.phaseId);
        if (idx >= 0) mergedPhases[idx] = newPhase;
        else mergedPhases.push(newPhase);
      });
      next.set(nodeId, mergedPhases);
      hasChanges = true;
    }
  });

  return hasChanges ? next : prevPhases;
}
