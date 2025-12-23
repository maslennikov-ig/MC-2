import { useCallback, useState, useEffect, useRef } from 'react';
import { useNodesState, useEdgesState } from '@xyflow/react';
import { GenerationTrace } from '@/components/generation-celestial/utils';
import { AppNode, AppEdge } from '../types';
import { NodeStatus, TraceAttempt, CourseStructure } from '@megacampus/shared-types';
import { GRAPH_DATA_LIMITS } from './use-graph-data/utils/constants';
import { isUUID } from './use-graph-data/utils/trace-extractors';
import { 
  ParallelItem, 
  DocumentWithSteps, 
  PhaseData,
  UseGraphDataOptions 
} from './use-graph-data/types';
import { 
  updateDocumentSteps, 
  updateParallelItems, 
  updateStageStatuses, 
  updateAttemptsMap, 
  updatePhasesMap 
} from './use-graph-data/utils/state-updaters';
import { buildGraph } from './use-graph-data/utils/graph-builders';

/**
 * Hook for managing graph node data and processing realtime generation traces.
 *
 * Converts incoming generation traces into React Flow nodes and edges, maintaining
 * the state of the entire course generation pipeline. Handles both sequential stages
 * and parallel items (documents in stage 2, modules/lessons in stage 6).
 */
export function useGraphData(options: UseGraphDataOptions = {}) {
  const { getFilename, hasDocuments = true } = options;
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);

  // Ref to store node positions for layout preservation (avoids dependency cycles)
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Ref to store module collapsed states for preservation during trace updates
  const moduleCollapsedRef = useRef<Map<string, boolean>>(new Map());
  const getFilenameRef = useRef(getFilename);

  // Update positions ref and collapsed states when nodes change
  useEffect(() => {
    nodes.forEach(n => {
      if (n.position) {
        nodePositionsRef.current.set(n.id, n.position);
      }
      // Preserve module collapsed state
      if (n.type === 'module' && n.data?.isCollapsed !== undefined) {
        moduleCollapsedRef.current.set(n.id, n.data.isCollapsed as boolean);
      }
    });
  }, [nodes]);

  useEffect(() => {
    getFilenameRef.current = getFilename;
  }, [getFilename]);

  // State of the World
  const [parallelItems, setParallelItems] = useState<Map<number, ParallelItem[]>>(new Map());
  const [stageStatuses, setStageStatuses] = useState<Record<string, NodeStatus>>({});
  // Documents with their processing steps (for stage 2 visualization)
  const [documentSteps, setDocumentSteps] = useState<Map<string, DocumentWithSteps>>(new Map());
  // Use ref for traceMap to avoid circular dependency in processTraces
  const traceMapRef = useRef<Record<string, GenerationTrace>>({});
  // Track attempts by nodeId (for node.data.attempts)
  const [attemptsMap, setAttemptsMap] = useState<Map<string, TraceAttempt[]>>(new Map());
  // Track phases by nodeId (for stages 4, 5 which have phases)
  const [phasesMap, setPhasesMap] = useState<Map<string, PhaseData[]>>(new Map());
  // Track processed trace IDs to avoid reprocessing (with size limit to prevent memory leak)
  const processedTraceIdsRef = useRef<Set<string>>(new Set());

  /**
   * Initialize Stage 6 parallel items from course_structure.
   */
  const initializeFromCourseStructure = useCallback((courseStructure: CourseStructure, completedLessonLabels?: string[]) => {
    if (!courseStructure?.sections || courseStructure.sections.length === 0) {
      return;
    }

    // Convert labels to lesson IDs (e.g., "1.2" → "lesson_1_2")
    const completedIds = new Set(
      (completedLessonLabels || []).map(label => `lesson_${label.replace('.', '_')}`)
    );

    setParallelItems(prevItems => {
      const existingStage6 = prevItems.get(6) || [];
      if (existingStage6.length > 0) return prevItems;

      const stage6Items: ParallelItem[] = [];

      courseStructure.sections.forEach((section: { section_number: number; section_title: string; lessons?: Array<{ lesson_number: number; lesson_title: string }> }, idx: number) => {
        const moduleIndex = idx + 1;
        const modId = `module_${moduleIndex}`;
        const sectionIndex = idx + 1;

        let completedLessonsCount = 0;

        section.lessons?.forEach((lesson: { lesson_number: number; lesson_title: string }, lessonIdx: number) => {
          const lessonIndex = lessonIdx + 1;
          const lessonId = `lesson_${sectionIndex}_${lessonIndex}`;
          const isCompleted = completedIds.has(lessonId);
          const lessonStatus: NodeStatus = isCompleted ? 'completed' : 'pending';

          if (isCompleted) completedLessonsCount++;

          stage6Items.push({
            id: lessonId,
            label: lesson.lesson_title || `Урок ${lessonIdx + 1}`,
            status: lessonStatus,
            type: 'lesson',
            parentId: modId,
            data: {
              lessonOrder: lessonIndex
            }
          });
        });

        const totalLessons = section.lessons?.length || 0;
        let moduleStatus: NodeStatus = 'pending';
        if (totalLessons > 0 && completedLessonsCount === totalLessons) {
          moduleStatus = 'completed';
        } else if (completedLessonsCount > 0) {
          moduleStatus = 'active';
        }

        stage6Items.push({
          id: modId,
          label: section.section_title || `Модуль ${idx + 1}`,
          status: moduleStatus,
          type: 'module',
          data: {
            moduleOrder: moduleIndex,
            totalLessons: totalLessons,
            completedLessons: completedLessonsCount,
            isCollapsed: courseStructure.sections.length > 5
          }
        });
      });

      const nextItems = new Map(prevItems);
      nextItems.set(6, stage6Items);
      return nextItems;
    });
  }, []);

  /**
   * Update lesson statuses from completed lesson IDs.
   */
  const updateLessonStatuses = useCallback((completedLessonLabels: string[]) => {
    if (completedLessonLabels.length === 0) return;

    const completedIds = new Set(
      completedLessonLabels.map(label => `lesson_${label.replace('.', '_')}`)
    );

    setParallelItems(prevItems => {
      const existingStage6 = prevItems.get(6);
      if (!existingStage6 || existingStage6.length === 0) {
        return prevItems;
      }

      let hasChanges = false;
      const updatedItems = existingStage6.map(item => {
        if (item.type === 'lesson' && completedIds.has(item.id) && item.status !== 'completed') {
          hasChanges = true;
          return { ...item, status: 'completed' as NodeStatus };
        }
        return item;
      });

      if (hasChanges) {
        const finalItems = updatedItems.map(item => {
          if (item.type === 'module') {
            const moduleLessons = updatedItems.filter(
              l => l.type === 'lesson' && l.parentId === item.id
            );
            const completedCount = moduleLessons.filter(l => l.status === 'completed').length;
            const totalCount = moduleLessons.length;

            let moduleStatus: NodeStatus = 'pending';
            if (totalCount > 0 && completedCount === totalCount) {
              moduleStatus = 'completed';
            } else if (completedCount > 0) {
              moduleStatus = 'active';
            }

            return {
              ...item,
              status: moduleStatus,
              data: {
                ...item.data,
                completedLessons: completedCount,
              }
            };
          }
          return item;
        });

        const nextItems = new Map(prevItems);
        nextItems.set(6, finalItems);
        return nextItems;
      }

      return prevItems;
    });
  }, []);

  // Process incoming traces to update state
  const processTraces = useCallback((inputTraces: GenerationTrace[]) => {
    if (inputTraces.length === 0) return;

    // BEFORE processing: cleanup old entries
    if (processedTraceIdsRef.current.size > GRAPH_DATA_LIMITS.MAX_PROCESSED_TRACES) {
      const currentTraceIds = new Set(inputTraces.map(t => t.id));
      const validIds = Array.from(processedTraceIdsRef.current)
        .filter(id => currentTraceIds.has(id))
        .slice(-GRAPH_DATA_LIMITS.CLEANUP_RETAIN_COUNT);
      processedTraceIdsRef.current = new Set(validIds);
    }

    // Filter to only process new traces
    const unprocessedTraces = inputTraces.filter(t => !processedTraceIdsRef.current.has(t.id));
    if (unprocessedTraces.length === 0) return;

    // Mark new traces as processed
    unprocessedTraces.forEach(t => processedTraceIdsRef.current.add(t.id));

    const newTraces = [...unprocessedTraces].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Update States using helper functions
    setDocumentSteps(prev => {
      const { nextDocs, attemptsUpdates } = updateDocumentSteps(prev, newTraces, attemptsMap, getFilenameRef.current);
      
      // We also need to update attemptsMap with the updates from document processing
      if (attemptsUpdates.size > 0) {
        setAttemptsMap(prevAttempts => {
          const nextAttempts = new Map(prevAttempts);
          attemptsUpdates.forEach((attempts, key) => {
            nextAttempts.set(key, attempts);
          });
          return nextAttempts;
        });
      }
      
      return nextDocs;
    });

    setParallelItems(prev => updateParallelItems(prev, newTraces));
    setStageStatuses(prev => updateStageStatuses(prev, newTraces));
    setAttemptsMap(prev => updateAttemptsMap(prev, newTraces));
    setPhasesMap(prev => updatePhasesMap(prev, newTraces));

    // Update traceMapRef
    newTraces.forEach(trace => {
        let nodeId: string = trace.stage;
        // Map logic similar to state updaters to identify node ID
        // (Simplified for trace storage)
        if (trace.stage === 'stage_6' && trace.lesson_id) {
             const lessonLabel = trace.input_data?.lessonLabel as string | undefined;
             nodeId = lessonLabel ? `lesson_${lessonLabel.replace('.', '_')}` : `lesson_${trace.lesson_id}`;
        } else if (trace.stage === 'stage_2' && trace.input_data?.document_id) {
             nodeId = `doc_${trace.input_data.document_id.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
        }
        traceMapRef.current[nodeId] = trace;
    });

  }, [attemptsMap]);

  // Rebuild Graph when structure changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildGraph({
      parallelItems,
      stageStatuses,
      documentSteps,
      hasDocuments,
      getTrace: (id) => traceMapRef.current[id],
      getAttempts: (id) => attemptsMap.get(id) || [],
      getPhases: (id) => phasesMap.get(id) || [],
      getExistingPos: (id) => nodePositionsRef.current.get(id) || { x: 0, y: 0 },
      getModuleCollapsed: (id) => moduleCollapsedRef.current.get(id)
    });

    // Update State with Shallow Compare
    setNodes((currentNodes) => {
        if (currentNodes.length !== newNodes.length) return newNodes;
        const hasChanges = newNodes.some((newNode, idx) => {
            const currentNode = currentNodes[idx];
            if (!currentNode) return true;
            return currentNode.id !== newNode.id ||
                   currentNode.type !== newNode.type ||
                   currentNode.parentId !== newNode.parentId ||
                   currentNode.data?.status !== newNode.data?.status ||
                   currentNode.data?.currentStep !== newNode.data?.currentStep ||
                   currentNode.data?.label !== newNode.data?.label;
        });
        return hasChanges ? newNodes : currentNodes;
    });

    setEdges((currentEdges) => {
        if (currentEdges.length !== newEdges.length) return newEdges;
        const hasChanges = newEdges.some((newEdge, idx) => {
            const currentEdge = currentEdges[idx];
            if (!currentEdge) return true;
            return currentEdge.id !== newEdge.id ||
                   currentEdge.source !== newEdge.source ||
                   currentEdge.target !== newEdge.target ||
                   currentEdge.type !== newEdge.type;
        });
        return hasChanges ? newEdges : currentEdges;
    });

  }, [parallelItems, stageStatuses, documentSteps, attemptsMap, phasesMap, hasDocuments, setNodes, setEdges]);

  // Update document names when filenameMap becomes available
  useEffect(() => {
    if (!getFilenameRef.current || documentSteps.size === 0) return;

    let cancelled = false;
    let hasUpdates = false;
    const updatedDocs = new Map<string, DocumentWithSteps>();

    documentSteps.forEach((doc, docId) => {
      const baseName = doc.name.split('.')[0];
      if (doc.name.startsWith('Документ ') || isUUID(baseName)) {
        const realName = getFilenameRef.current?.(docId);
        if (realName && realName !== doc.name) {
          updatedDocs.set(docId, { ...doc, name: realName });
          hasUpdates = true;
        } else {
          updatedDocs.set(docId, doc);
        }
      } else {
        updatedDocs.set(docId, doc);
      }
    });

    if (!cancelled && hasUpdates) {
      setDocumentSteps(updatedDocs);
    }

    return () => {
      cancelled = true;
    };
  }, [documentSteps]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    processTraces,
    initializeFromCourseStructure,
    updateLessonStatuses,
    setNodes,
    setEdges,
    nodePositionsRef
  };
}
