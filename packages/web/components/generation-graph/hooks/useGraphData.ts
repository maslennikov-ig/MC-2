import { useCallback, useState, useEffect, useRef } from 'react';
import { useNodesState, useEdgesState } from '@xyflow/react';
import { GenerationTrace } from '@/components/generation-celestial/utils';
import { AppNode, AppEdge } from '../types';
import { GRAPH_STAGE_CONFIG } from '@/lib/generation-graph/constants';
import { NodeStatus, TraceAttempt, CourseStructure } from '@megacampus/shared-types';
import { getPhaseName } from '@/lib/generation-graph/phase-names';

/**
 * Configuration limits for graph data processing.
 * Prevents unbounded memory growth from trace processing.
 */
const GRAPH_DATA_LIMITS = {
  /** Maximum number of processed trace IDs to track before cleanup */
  MAX_PROCESSED_TRACES: 1000,
  /** Number of recent trace IDs to retain during cleanup */
  CLEANUP_RETAIN_COUNT: 500,
} as const;

/**
 * Extracts document ID for deduplication (UUID-based).
 * Used to identify unique documents across multiple trace steps.
 */
function extractDocumentId(trace: GenerationTrace): string | null {
  const inputData = trace.input_data;
  if (!inputData) return null;

  // Priority: document_id fields for deduplication
  return inputData.document_id ||
         inputData.documentId ||
         inputData.fileId ||
         inputData.file_id ||
         null;
}

/**
 * Extracts human-readable document name from a stage 2 trace.
 * Returns the original filename for display, not the UUID.
 */
function extractDocumentName(trace: GenerationTrace): string | null {
  const inputData = trace.input_data;
  if (!inputData) return null;

  // Priority order: human-readable names first
  // 1. Original filename (what user uploaded)
  const originalName = inputData.originalFilename ||
                       inputData.original_filename ||
                       inputData.originalName ||
                       inputData.original_name;
  if (originalName && typeof originalName === 'string') {
    return originalName;
  }

  // 2. File name fields
  const fileName = inputData.file_name ||
                   inputData.filename ||
                   inputData.fileName ||
                   inputData.name;
  if (fileName && typeof fileName === 'string') {
    // Check base name without extension - UUID filenames like "abc123...def.pdf" are not valid
    const baseName = fileName.split('.')[0];
    if (!isUUID(baseName)) {
      return fileName;
    }
  }

  // 3. Extract from path (last segment)
  const path = inputData.filePath ||
               inputData.file_path ||
               inputData.path ||
               inputData.source_file;
  if (path && typeof path === 'string' && path.includes('/')) {
    const filename = path.split('/').pop();
    if (filename) {
      // Check base name without extension
      const baseName = filename.split('.')[0];
      if (!isUUID(baseName)) {
        return filename;
      }
    }
  }

  return null;
}

/**
 * Check if a string looks like a UUID.
 */
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Map technical step names to user-friendly Russian labels.
 */
const STEP_NAME_TRANSLATIONS: Record<string, string> = {
  // Document processing steps (Stage 2)
  'Docling Conversion': 'Распознавание текста',
  'docling_conversion': 'Распознавание текста',
  'Qdrant Upload': 'Загрузка в базу знаний',
  'qdrant_upload': 'Загрузка в базу знаний',
  'Finish': 'Готово',
  'finish': 'Готово',
  'Complete': 'Завершено',
  'complete': 'Завершено',
  'Processing': 'Обработка',
  'processing': 'Обработка',
  'parse': 'Парсинг документа',
  'Parse': 'Парсинг документа',
  'chunk': 'Разбиение на части',
  'Chunk': 'Разбиение на части',
  'chunking': 'Разбиение на части',
  'Chunking': 'Разбиение на части',
  'embed': 'Создание эмбеддингов',
  'Embed': 'Создание эмбеддингов',
  'embedding': 'Создание эмбеддингов',
  'Embedding': 'Создание эмбеддингов',
  'index': 'Индексация',
  'Index': 'Индексация',
  'indexing': 'Индексация',
  'Indexing': 'Индексация',
  'extract': 'Извлечение данных',
  'Extract': 'Извлечение данных',
  'analyze': 'Анализ',
  'Analyze': 'Анализ',
  'summarize': 'Создание саммари',
  'Summarize': 'Создание саммари',
  'summary': 'Создание саммари',
  'Summary': 'Создание саммари',
  'upload': 'Загрузка',
  'Upload': 'Загрузка',
  'save': 'Сохранение',
  'Save': 'Сохранение',
  'validate': 'Проверка',
  'Validate': 'Проверка',
  'start': 'Начало',
  'Start': 'Начало',
  'init': 'Инициализация',
  'Init': 'Инициализация',
  'initialize': 'Инициализация',
  'Initialize': 'Инициализация',

  // Stage 6 lesson generation steps (LangGraph nodes)
  'planner': 'Планирование',
  'Planner': 'Планирование',
  'expander': 'Расширение',
  'Expander': 'Расширение',
  'assembler': 'Сборка',
  'Assembler': 'Сборка',
  'smoother': 'Полировка',
  'Smoother': 'Полировка',
  'judge': 'Оценка качества',
  'Judge': 'Оценка качества',
};

/**
 * Translate technical step name to user-friendly label.
 */
function translateStepName(stepName: string): string {
  // Check exact match first
  if (STEP_NAME_TRANSLATIONS[stepName]) {
    return STEP_NAME_TRANSLATIONS[stepName];
  }

  // Check lowercase
  const lower = stepName.toLowerCase();
  if (STEP_NAME_TRANSLATIONS[lower]) {
    return STEP_NAME_TRANSLATIONS[lower];
  }

  // Check if contains known keywords
  for (const [key, translation] of Object.entries(STEP_NAME_TRANSLATIONS)) {
    if (lower.includes(key.toLowerCase())) {
      return translation;
    }
  }

  // Return original with basic formatting
  return stepName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Calculate overall document status from all stages.
 * Priority: failed > active > completed > pending
 */
function calculateDocumentStatus(steps: DocumentStepData[]): NodeStatus {
  if (steps.length === 0) return 'pending';

  if (steps.some(s => s.status === 'error')) return 'error';
  if (steps.some(s => s.status === 'active')) return 'active';
  if (steps.every(s => s.status === 'completed')) return 'completed';

  return 'pending';
}

/**
 * Convert GenerationTrace to TraceAttempt for node.data.attempts.
 * Maps flat trace structure to structured attempt with metrics.
 * Uses retry_attempt from trace, NOT sequential numbering.
 */
function traceToAttempt(trace: GenerationTrace): TraceAttempt {
  return {
    attemptNumber: (trace.retry_attempt ?? 0) + 1, // retry_attempt is 0-based, attemptNumber is 1-based
    timestamp: new Date(trace.created_at),
    inputData: trace.input_data || {},
    outputData: trace.output_data || {},
    processMetrics: {
      model: trace.model_used || 'unknown',
      tokens: trace.tokens_used || 0,
      duration: trace.duration_ms || 0,
      cost: trace.cost_usd || 0,
      wasCached: trace.was_cached,
      temperature: trace.temperature,
      qualityScore: trace.quality_score
    },
    status: trace.error_data ? 'failed' : 'success',
    errorMessage: trace.error_data?.message || (trace.error_data ? JSON.stringify(trace.error_data) : undefined),
    // DO NOT set refinementMessage from prompt_text - that's the LLM prompt, not user refinement
    refinementMessage: undefined
  };
}

/**
 * Represents a phase within a multi-phase stage (stages 4, 5).
 * Phases are sequential steps within a stage, NOT retries.
 */
interface PhaseData {
  /** Phase identifier (e.g., 'phase_0', 'phase_1') */
  phaseId: string;
  /** Translated phase name for display */
  phaseName: string;
  /** Current phase status */
  status: NodeStatus;
  /** Phase start timestamp */
  timestamp: Date;
  /** Input data for this phase */
  inputData?: Record<string, unknown>;
  /** Output data from this phase */
  outputData?: Record<string, unknown>;
  /** Processing metrics for this phase */
  processMetrics?: {
    model: string;
    tokens: number;
    duration: number;
    cost: number;
  };
  /** Actual retry attempts within THIS phase (only if retry_attempt > 0) */
  attempts?: TraceAttempt[];
}

/**
 * Represents a lesson within a module structure from trace output data.
 */
interface LessonStructure {
  /** Unique identifier for the lesson */
  id: string;
  /** Display title of the lesson */
  title: string;
}

/**
 * Represents a module structure from trace output data.
 * Contains module metadata and nested lessons.
 */
interface ModuleStructure {
  /** Unique identifier for the module */
  id: string;
  /** Display title of the module */
  title: string;
  /** Optional array of lessons within this module */
  lessons?: LessonStructure[];
}

/**
 * Represents a step in document processing pipeline (for grouping).
 */
interface DocumentStepData {
  /** Unique step ID (docId_stepName) */
  id: string;
  /** Step name for display (e.g., "Docling Conversion") */
  stepName: string;
  /** Processing status */
  status: NodeStatus;
  /** Original trace ID */
  traceId: string;
  /** Timestamp for ordering */
  timestamp: number;
  /** All attempts for this step */
  attempts: TraceAttempt[];
  /** Input data */
  inputData?: unknown;
  /** Output data */
  outputData?: unknown;
}

/**
 * Represents a document with all its processing steps (internal grouping structure).
 */
interface DocumentWithSteps {
  /** Document UUID */
  id: string;
  /** Human-readable filename */
  name: string;
  /** Ordered list of processing steps */
  steps: DocumentStepData[];
  /** Processing priority */
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
}

/**
 * Represents a parallelizable item in the graph (document, module, or lesson).
 * Used to track items that can be processed concurrently in specific stages.
 */
interface ParallelItem {
  /** Unique identifier for the item */
  id: string;
  /** Display label for the item */
  label: string;
  /** Current processing status of the item */
  status: NodeStatus;
  /** Type of item (document for stage 2, module/lesson for stage 6) */
  type: 'document' | 'module' | 'lesson' | 'document-step';
  /** Parent item ID (used for lessons within modules, or steps within documents) */
  parentId?: string;
  /** Additional data specific to the item type */
  data?: Record<string, unknown>;
}

/**
 * Type guard to validate that data conforms to ModuleStructure array format.
 * Ensures data from trace.output_data.modules is properly shaped before use.
 *
 * @param data - Unknown data to validate
 * @returns True if data is a valid array of ModuleStructure objects
 *
 * @example
 * ```ts
 * const rawData = trace.output_data.modules;
 * if (isValidModuleStructure(rawData)) {
 *   // Safe to use rawData as ModuleStructure[]
 *   rawData.forEach(module => console.log(module.title));
 * }
 * ```
 */
function isValidModuleStructure(data: unknown): data is ModuleStructure[] {
  if (!Array.isArray(data)) return false;
  return data.every(mod =>
    typeof mod === 'object' &&
    mod !== null &&
    typeof mod.title === 'string' &&
    (mod.id === undefined || typeof mod.id === 'string') &&
    (mod.lessons === undefined || Array.isArray(mod.lessons))
  );
}

/**
 * Options for the useGraphData hook.
 */
interface UseGraphDataOptions {
  /**
   * Function to look up filename by fileId from file_catalog.
   * Used to display original filenames instead of UUIDs for document nodes.
   */
  getFilename?: (fileId: string) => string | undefined;
  /**
   * Whether the course has documents.
   * When false, Stage 2 (Document Processing) and Stage 3 (Classification)
   * are marked as 'skipped' in the graph visualization.
   * @default true
   */
  hasDocuments?: boolean;
}

/**
 * Hook for managing graph node data and processing realtime generation traces.
 *
 * Converts incoming generation traces into React Flow nodes and edges, maintaining
 * the state of the entire course generation pipeline. Handles both sequential stages
 * and parallel items (documents in stage 2, modules/lessons in stage 6).
 *
 * Key features:
 * - Automatic graph structure rebuild when traces update
 * - Position preservation during layout changes
 * - Deduplication of processed traces to prevent memory leaks
 * - Fan-out/fan-in patterns for parallel processing stages
 * - Type-safe module structure validation
 *
 * @returns Object containing:
 * - `nodes` - Current graph nodes (stages, documents, modules, lessons, merge, end)
 * - `edges` - Current graph edges connecting the nodes
 * - `onNodesChange` - Handler for React Flow node changes (drag, select, etc.)
 * - `onEdgesChange` - Handler for React Flow edge changes
 * - `processTraces` - Function to process new generation traces and update graph state
 * - `setNodes` - Direct node state setter (used by layout hook)
 * - `setEdges` - Direct edge state setter
 *
 * @example
 * ```tsx
 * function GraphView({ courseId }) {
 *   const {
 *     nodes,
 *     edges,
 *     processTraces,
 *     onNodesChange,
 *     onEdgesChange
 *   } = useGraphData();
 *
 *   const { traces } = useGenerationRealtime();
 *
 *   useEffect(() => {
 *     if (traces.length > 0) {
 *       processTraces(traces);
 *     }
 *   }, [traces, processTraces]);
 *
 *   return (
 *     <ReactFlow
 *       nodes={nodes}
 *       edges={edges}
 *       onNodesChange={onNodesChange}
 *       onEdgesChange={onEdgesChange}
 *     />
 *   );
 * }
 * ```
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
  // NOTE: documentSteps kept for graph building. Zustand store used for progress counter in DocumentNode.
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
   * This ensures modules/lessons appear immediately when opening graph after Stage 5 completion,
   * even on page refresh (not dependent on realtime traces).
   *
   * @param courseStructure - The course structure from courses.course_structure column
   * @param completedLessonLabels - Optional array of completed lesson labels in "section.lesson" format (e.g., ["1.1", "1.2"])
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
      const nextItems = new Map(prevItems);
      const existingStage6 = nextItems.get(6) || [];

      // Only initialize if we don't already have Stage 6 items
      if (existingStage6.length > 0) {
        return prevItems;
      }

      const stage6Items: ParallelItem[] = [];

      // Map sections to modules
      // Use 1-based index for module IDs to match backend's sequential numbering
      courseStructure.sections.forEach((section: { section_number: number; section_title: string; lessons?: Array<{ lesson_number: number; lesson_title: string }> }, idx: number) => {
        const moduleIndex = idx + 1; // Always use index-based, not section_number from data
        const modId = `module_${moduleIndex}`;
        const sectionIndex = idx + 1;

        // Count completed lessons in this module
        let completedLessonsCount = 0;
        const lessonStatuses: NodeStatus[] = [];

        // Map lessons within this section
        // Use 1-based indices (idx+1, lessonIdx+1) for globally unique lesson IDs
        // This MUST match backend lessonLabel format "section.lesson" (e.g., "1.2")
        section.lessons?.forEach((lesson: { lesson_number: number; lesson_title: string }, lessonIdx: number) => {
          const lessonIndex = lessonIdx + 1; // Always use index-based
          const lessonId = `lesson_${sectionIndex}_${lessonIndex}`;
          const isCompleted = completedIds.has(lessonId);
          const lessonStatus: NodeStatus = isCompleted ? 'completed' : 'pending';

          if (isCompleted) completedLessonsCount++;
          lessonStatuses.push(lessonStatus);

          stage6Items.push({
            id: lessonId,
            label: lesson.lesson_title || `Урок ${lessonIdx + 1}`,
            status: lessonStatus,
            type: 'lesson',
            parentId: modId,
            data: {
              lessonOrder: lessonIndex // Store lesson index for display (1, 2, 3... within module)
            }
          });
        });

        // Determine module status based on lesson statuses
        const totalLessons = section.lessons?.length || 0;
        let moduleStatus: NodeStatus = 'pending';
        if (totalLessons > 0 && completedLessonsCount === totalLessons) {
          moduleStatus = 'completed';
        } else if (completedLessonsCount > 0) {
          moduleStatus = 'active'; // Partially completed
        }

        stage6Items.push({
          id: modId,
          label: section.section_title || `Модуль ${idx + 1}`,
          status: moduleStatus,
          type: 'module',
          data: {
            moduleOrder: moduleIndex, // Use moduleOrder instead of section_number
            totalLessons: totalLessons,
            completedLessons: completedLessonsCount,
            isCollapsed: courseStructure.sections.length > 5
          }
        });
      });

      nextItems.set(6, stage6Items);
      return nextItems;
    });
  }, []);

  /**
   * Update lesson statuses from completed lesson IDs.
   * Called after fetching lesson_contents from the database to sync
   * the visual status with actual completion state.
   *
   * @param completedLessonLabels - Array of completed lesson labels in "section.lesson" format (e.g., ["1.1", "1.2", "2.1"])
   */
  const updateLessonStatuses = useCallback((completedLessonLabels: string[]) => {
    if (completedLessonLabels.length === 0) return;

    // Convert labels to lesson IDs (e.g., "1.2" → "lesson_1_2")
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

      // Update module statuses based on lesson completion
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
              moduleStatus = 'active'; // Partially completed
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

    // BEFORE processing: cleanup old entries if set is too large
    // Keep only IDs that still exist in current input traces to prevent unbounded growth
    if (processedTraceIdsRef.current.size > GRAPH_DATA_LIMITS.MAX_PROCESSED_TRACES) {
      const currentTraceIds = new Set(inputTraces.map(t => t.id));
      const validIds = Array.from(processedTraceIdsRef.current)
        .filter(id => currentTraceIds.has(id))
        .slice(-GRAPH_DATA_LIMITS.CLEANUP_RETAIN_COUNT);
      processedTraceIdsRef.current = new Set(validIds);
    }

    // Filter to only process new traces (not already processed)
    const unprocessedTraces = inputTraces.filter(t => !processedTraceIdsRef.current.has(t.id));
    if (unprocessedTraces.length === 0) return;

    // Mark new traces as processed
    unprocessedTraces.forEach(t => processedTraceIdsRef.current.add(t.id));

    const newTraces = [...unprocessedTraces].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    setParallelItems(prevItems => {
        const nextItems = new Map(prevItems);
        let hasChanges = false;

        newTraces.forEach(trace => {
            // Stage 2: Documents - collect all steps for each document
            if (trace.stage === 'stage_2') {
                const docId = extractDocumentId(trace);
                const docName = extractDocumentName(trace);
                const stepName = trace.step_name || trace.phase || 'Processing';

                // Need document ID
                if (docId) {
                    // Update documentSteps state
                    setDocumentSteps(prevDocs => {
                        const nextDocs = new Map(prevDocs);
                        const existingDoc = nextDocs.get(docId);

                        const stepId = `${docId}_${stepName.replace(/[^a-zA-Z0-9-_]/g, '_')}`;

                        // Build attempt for this trace
                        const stepNodeId = `step_${stepId}`;
                        const existingStepAttempts = attemptsMap.get(stepNodeId) || [];
                        const newAttempt = traceToAttempt(trace);

                        // Update attempts map
                        setAttemptsMap(prev => {
                            const next = new Map(prev);
                            next.set(stepNodeId, [...existingStepAttempts, newAttempt]);
                            return next;
                        });

                        // Determine status: error > completed (has output) > active
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
                            attempts: [...existingStepAttempts, newAttempt],
                            inputData: trace.input_data,
                            outputData: trace.output_data
                        };

                        if (existingDoc) {
                            // Check if step already exists
                            const stepIdx = existingDoc.steps.findIndex(s => s.id === stepId);
                            if (stepIdx >= 0) {
                                // Update existing step with new attempt
                                // Keep completed status if already completed (don't downgrade)
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
                                // Add new step
                                existingDoc.steps.push(newStep);
                                // Sort by timestamp
                                existingDoc.steps.sort((a, b) => a.timestamp - b.timestamp);
                            }
                            // Update name if we have a better one (from trace or file_catalog)
                            const betterName = docName || getFilenameRef.current?.(docId);
                            if (betterName && existingDoc.name.startsWith('Документ ')) {
                                existingDoc.name = betterName;
                            }
                        } else {
                            // Create new document entry with translated step name
                            // Priority: trace data > file_catalog > truncated UUID fallback
                            const displayName = docName || getFilenameRef.current?.(docId) || `Документ ${docId.substring(0, 8)}...`;
                            nextDocs.set(docId, {
                                id: docId,
                                name: displayName,
                                steps: [newStep],
                                priority: trace.input_data?.priority as 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY' | undefined
                            });
                        }

                        return nextDocs;
                    });
                    hasChanges = true;
                }
            }

            // Stage 6: Modules/Lessons from Structure (Stage 5 Output)
            // Supports both legacy format (output_data.modules) and current format (course_structure.sections)
            // See FUTURE-006 for full sections → modules refactoring plan
            if (trace.stage === 'stage_5') {
                let modules: ModuleStructure[] = [];

                // Option 1: Legacy format with modules directly in output_data
                if (trace.output_data?.modules) {
                    const rawModules = trace.output_data.modules;
                    if (isValidModuleStructure(rawModules)) {
                        modules = rawModules;
                    } else {
                        console.warn('[useGraphData] Invalid module structure received:', rawModules);
                    }
                }
                // Option 2: Current format with course_structure.sections (map sections → modules)
                else if (trace.output_data?.course_structure?.sections) {
                    const sections = trace.output_data.course_structure.sections as Array<{
                        section_number?: number;
                        section_title?: string;
                        lessons?: Array<{ lesson_number?: number; lesson_title?: string }>;
                    }>;

                    // Use 1-based indices for IDs to match backend's sequential numbering
                    modules = sections.map((section, idx) => {
                        const moduleIndex = idx + 1; // Always use index-based
                        return {
                            id: String(moduleIndex),
                            title: section.section_title || `Модуль ${idx + 1}`,
                            lessons: section.lessons?.map((lesson, lessonIdx) => ({
                                // Use index-based IDs to match backend lessonLabel format
                                id: `${moduleIndex}_${lessonIdx + 1}`,
                                title: lesson.lesson_title || `Урок ${lessonIdx + 1}`
                            }))
                        };
                    });
                }

                const existingStage6 = nextItems.get(6) || [];

                // Check if we already have these modules to avoid duplicates/re-renders
                // Simple check: if count matches. Robust check: IDs.
                if (existingStage6.length === 0 && modules.length > 0) {
                    const stage6Items: ParallelItem[] = [];
                    // Process modules in order (index = display order)
                    // Use 1-based indices for IDs to match backend's sequential numbering
                    modules.forEach((mod, moduleIndex) => {
                        const moduleOrder = moduleIndex + 1; // 1-based display order
                        const modId = `module_${moduleOrder}`; // Always use index-based ID
                        stage6Items.push({
                            id: modId,
                            label: mod.title,
                            status: 'pending',
                            type: 'module',
                            data: {
                                ...mod,
                                moduleOrder, // Store order for sorting (1, 2, 3...)
                                totalLessons: mod.lessons?.length || 0,
                                completedLessons: 0,
                                isCollapsed: modules.length > 5
                            }
                        });

                        mod.lessons?.forEach((les, lessonIndex) => {
                            const lessonOrder = lessonIndex + 1;
                            // Use index-based ID: lesson_{moduleOrder}_{lessonOrder}
                            // This MUST match backend lessonLabel format "section.lesson" → "lesson_1_2"
                            stage6Items.push({
                                id: `lesson_${moduleOrder}_${lessonOrder}`,
                                label: les.title,
                                status: 'pending',
                                type: 'lesson',
                                parentId: modId,
                                data: {
                                    lessonOrder // Store order for sorting within module
                                }
                            });
                        });
                    });
                    nextItems.set(6, stage6Items);
                    hasChanges = true;
                }
            }

            // Stage 6: Lesson Generation Progress (Real-time updates)
            // Update lesson status and current step from trace data
            // Use lessonLabel from input_data (e.g., "1.2") to match parallel items (lesson_1_2)
            // because trace.lesson_id is a UUID, but parallel items use section_lesson format
            if (trace.stage === 'stage_6') {
                const lessonLabel = trace.input_data?.lessonLabel as string | undefined;
                // Convert "1.2" format to "lesson_1_2" format for matching
                const lessonId = lessonLabel
                    ? `lesson_${lessonLabel.replace('.', '_')}`
                    : trace.lesson_id
                        ? `lesson_${trace.lesson_id}`
                        : null;

                if (!lessonId) {
                    return; // Skip traces without lesson identification
                }

                const existingStage6 = nextItems.get(6) || [];

                // Find the lesson item
                const lessonIndex = existingStage6.findIndex(item => item.id === lessonId);
                if (lessonIndex >= 0) {
                    const lesson = existingStage6[lessonIndex];

                    // Extract current step from trace
                    const currentStep = trace.step_name || trace.phase;

                    // Translate step name to user-friendly Russian label
                    const displayStep = currentStep ? translateStepName(currentStep) : undefined;

                    // Determine lesson status
                    const lessonStatus: NodeStatus = trace.error_data
                        ? 'error'
                        : trace.output_data
                            ? 'completed'
                            : 'active';

                    // Update lesson with new status and current step
                    const updatedLesson: ParallelItem = {
                        ...lesson,
                        status: lessonStatus,
                        data: {
                            ...lesson.data,
                            currentStep: displayStep,
                        }
                    };

                    // Create updated items array
                    const updatedItems = [...existingStage6];
                    updatedItems[lessonIndex] = updatedLesson;

                    // Update module's completedLessons count
                    const moduleId = lesson.parentId;
                    if (moduleId) {
                        const moduleIndex = updatedItems.findIndex(item => item.id === moduleId);
                        if (moduleIndex >= 0) {
                            const moduleItem = updatedItems[moduleIndex];
                            const moduleLessons = updatedItems.filter(
                                item => item.type === 'lesson' && item.parentId === moduleId
                            );
                            const completedCount = moduleLessons.filter(
                                l => l.status === 'completed'
                            ).length;

                            // Determine module status based on lessons
                            let moduleStatus: NodeStatus = 'pending';
                            if (moduleLessons.some(l => l.status === 'error')) {
                                moduleStatus = 'error';
                            } else if (moduleLessons.some(l => l.status === 'active')) {
                                moduleStatus = 'active';
                            } else if (moduleLessons.every(l => l.status === 'completed')) {
                                moduleStatus = 'completed';
                            }

                            updatedItems[moduleIndex] = {
                                ...moduleItem,
                                status: moduleStatus,
                                data: {
                                    ...moduleItem.data,
                                    completedLessons: completedCount,
                                }
                            };
                        }
                    }

                    nextItems.set(6, updatedItems);
                    hasChanges = true;
                }
            }
        });

        return hasChanges ? nextItems : prevItems;
    });

    // Update Node Statuses & Traces (using ref for traceMap to avoid cycles)
    setStageStatuses(prev => {
        const next = { ...prev };
        let hasChanges = false;

        newTraces.forEach(trace => {
            // nodeId can be stage_*, doc_*, or lesson_* - use string type
            let nodeId: string = trace.stage;

            // Map trace to specific node ID if parallel
            if (trace.stage === 'stage_2') {
                const docId = extractDocumentId(trace);
                if (docId) {
                    nodeId = `doc_${docId.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
                }
            } else if (trace.stage === 'stage_6') {
                // Only process traces with lesson_id (ignore old test traces with null lesson_id)
                if (!trace.lesson_id) {
                    return; // Skip traces without lesson_id
                }
                // Use lessonLabel from input_data (e.g., "1.2") to match parallel items (lesson_1_2)
                const lessonLabel = trace.input_data?.lessonLabel as string | undefined;
                if (lessonLabel) {
                    nodeId = `lesson_${lessonLabel.replace('.', '_')}`;
                } else {
                    nodeId = `lesson_${trace.lesson_id}`;
                }
            }

            const isError = !!trace.error_data;
            const isFinished = trace.step_name === 'finish';
            const newStatus: NodeStatus = isError ? 'error' : isFinished ? 'completed' : 'active';

            // Store latest trace for this node (mutate ref directly)
            traceMapRef.current[nodeId] = trace;

            if (next[nodeId] !== newStatus) {
                next[nodeId] = newStatus;
                hasChanges = true;
            }
        });

        return hasChanges ? next : prev;
    });

    // Build attempts map from traces
    setAttemptsMap(prev => {
        const next = new Map(prev);
        let hasChanges = false;

        // Group traces by nodeId
        const tracesByNode = new Map<string, GenerationTrace[]>();
        newTraces.forEach(trace => {
            let nodeId: string = trace.stage;

            // Map trace to specific node ID if parallel
            if (trace.stage === 'stage_2') {
                const docId = extractDocumentId(trace);
                if (docId) {
                    nodeId = `doc_${docId.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
                }
            } else if (trace.stage === 'stage_6') {
                // Only process traces with lesson_id (ignore old test traces with null lesson_id)
                if (!trace.lesson_id) {
                    return; // Skip traces without lesson_id - they are old test data
                }
                // Use lessonLabel from input_data (e.g., "1.2") to match parallel items (lesson_1_2)
                const lessonLabel = trace.input_data?.lessonLabel as string | undefined;
                if (lessonLabel) {
                    nodeId = `lesson_${lessonLabel.replace('.', '_')}`;
                } else {
                    nodeId = `lesson_${trace.lesson_id}`;
                }
            }

            if (!tracesByNode.has(nodeId)) {
                tracesByNode.set(nodeId, []);
            }
            tracesByNode.get(nodeId)!.push(trace);
        });

        // Convert trace groups to attempts
        // Only 'finish' traces represent completed attempts (not 'start')
        // Multiple attempts only exist when retry_attempt > 0
        tracesByNode.forEach((traces, nodeId) => {
            // Get existing attempts for this node
            const existingAttempts = next.get(nodeId) || [];
            const existingAttemptNums = new Set(existingAttempts.map(a => a.attemptNumber));

            // Filter to only 'finish' traces (completed attempts)
            // Group by retry_attempt to avoid duplicates
            const finishTraces = traces.filter(t => t.step_name === 'finish');

            // Create new attempts only from finish traces we haven't seen
            const newAttempts = finishTraces
                .filter(trace => !existingAttemptNums.has((trace.retry_attempt ?? 0) + 1))
                .map((trace) => traceToAttempt(trace));

            if (newAttempts.length > 0) {
                next.set(nodeId, [...existingAttempts, ...newAttempts]);
                hasChanges = true;
            }
        });

        return hasChanges ? next : prev;
    });

    // Build phases map for stages 4 and 5 (multi-phase stages)
    setPhasesMap(prev => {
        const next = new Map(prev);
        let hasChanges = false;

        // Group traces by nodeId and phase for stages 4, 5
        const tracesByNodeAndPhase = new Map<string, Map<string, GenerationTrace[]>>();
        newTraces.forEach(trace => {
            // Only process stages 4 and 5
            if (trace.stage !== 'stage_4' && trace.stage !== 'stage_5') return;

            const nodeId = trace.stage;
            const phaseId = trace.phase || 'unknown';

            if (!tracesByNodeAndPhase.has(nodeId)) {
                tracesByNodeAndPhase.set(nodeId, new Map());
            }
            const phaseMap = tracesByNodeAndPhase.get(nodeId)!;
            if (!phaseMap.has(phaseId)) {
                phaseMap.set(phaseId, []);
            }
            phaseMap.get(phaseId)!.push(trace);
        });

        // Convert phase groups to PhaseData
        tracesByNodeAndPhase.forEach((phaseMap, nodeId) => {
            const existingPhases = next.get(nodeId) || [];
            const phaseDataArray: PhaseData[] = [];

            phaseMap.forEach((traces, phaseId) => {
                // Sort traces by timestamp
                const sortedTraces = [...traces].sort((a, b) =>
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );

                const latestTrace = sortedTraces[sortedTraces.length - 1];
                const phaseName = getPhaseName(nodeId, phaseId, 'ru');

                // Determine phase status
                const phaseStatus: NodeStatus = latestTrace.error_data
                    ? 'error'
                    : latestTrace.output_data
                        ? 'completed'
                        : 'active';

                // Collect retry attempts (traces with retry_attempt > 0)
                const retryAttempts = sortedTraces
                    .filter(t => (t.retry_attempt ?? 0) > 0)
                    .map(t => traceToAttempt(t));

                const phaseData: PhaseData = {
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
                };

                phaseDataArray.push(phaseData);
            });

            // Check if phases changed for this node
            const existingPhasesJson = JSON.stringify(existingPhases.map(p => p.phaseId).sort());
            const newPhasesJson = JSON.stringify(phaseDataArray.map(p => p.phaseId).sort());

            if (existingPhasesJson !== newPhasesJson || phaseDataArray.length > 0) {
                // Merge with existing, preserving order
                const mergedPhases = [...existingPhases];
                phaseDataArray.forEach(newPhase => {
                    const idx = mergedPhases.findIndex(p => p.phaseId === newPhase.phaseId);
                    if (idx >= 0) {
                        mergedPhases[idx] = newPhase;
                    } else {
                        mergedPhases.push(newPhase);
                    }
                });

                next.set(nodeId, mergedPhases);
                hasChanges = true;
            }
        });

        return hasChanges ? next : prev;
    });

  }, [attemptsMap]);

  // Rebuild Graph when structure changes
  useEffect(() => {
    const newNodes: AppNode[] = [];
    const newEdges: AppEdge[] = [];
    
    let prevNodeId = 'stage_1'; 
    
    // Helper to get status & position
    const getStatus = (id: string) => stageStatuses[id] || 'pending';
    const getTrace = (id: string) => traceMapRef.current[id];
    const getAttempts = (id: string) => attemptsMap.get(id) || [];
    const getPhases = (id: string) => phasesMap.get(id) || [];
    // Use ref for position preservation (avoids dependency on nodes)
    const getExistingPos = (id: string) => nodePositionsRef.current.get(id) || { x: 0, y: 0 };

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

            // Connect edge from previous node
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
            continue; // Skip to next stage
        }

        // Special handling for Stage 2: Documents (consolidated single node per document)
        if (i === 2 && documentSteps.size > 0) {
            const documentNodeIds: string[] = []; // Track document nodes for merge

            // For each document, create a SINGLE node with all stages embedded
            documentSteps.forEach((doc) => {
                const docNodeId = `doc_${doc.id.replace(/[^a-zA-Z0-9-_]/g, '_')}`;

                // Calculate overall document status from all stages
                const overallStatus = calculateDocumentStatus(doc.steps);

                // Count completed stages
                const completedStages = doc.steps.filter(s => s.status === 'completed').length;
                const totalStages = doc.steps.length;

                // All attempts across all stages (for backwards compatibility with modal)
                const allAttempts = doc.steps.flatMap(s => s.attempts);

                // Convert internal DocumentStepData to DocumentStageData (shared-types format)
                const stages = doc.steps.map((step, idx) => ({
                    stageId: step.id,
                    stageName: step.stepName,
                    stageNumber: idx + 1,
                    status: step.status,
                    attempts: step.attempts,
                    inputData: step.inputData as Record<string, unknown> | undefined,
                    outputData: step.outputData as Record<string, unknown> | undefined
                }));

                // Single document node with all stages
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
                        attempts: allAttempts, // For backwards compatibility
                        inputData: stages[0]?.inputData, // First stage input
                        outputData: stages[stages.length - 1]?.outputData, // Last stage output
                        retryCount: allAttempts.filter(a => a.status === 'failed').length
                    }
                } as AppNode);

                // Edge from previous stage to document node
                newEdges.push({
                    id: `e${prevNodeId}-${docNodeId}`,
                    source: prevNodeId,
                    target: docNodeId,
                    type: 'animated',
                    data: { status: 'idle', animated: false }
                });

                // Track document node for merge
                documentNodeIds.push(docNodeId);
            });

            // Merge node after all documents
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

            // Edges to merge
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
            continue; // Skip default handling for stage 2
        }

        // Special handling for Stage 6: Add Stage 6 node before modules
        if (i === 6 && config.parallelizable && items && items.length > 0) {
            const modules = items.filter(item => item.type === 'module');
            const lessons = items.filter(item => item.type === 'lesson');

            // Calculate Stage 6 overall status from lessons
            // Use item.status from parallelItems for consistency
            let stage6Status: NodeStatus = 'pending';
            if (lessons.some(l => (l.status || getStatus(l.id)) === 'error')) {
                stage6Status = 'error';
            } else if (lessons.some(l => (l.status || getStatus(l.id)) === 'active')) {
                stage6Status = 'active';
            } else if (lessons.length > 0 && lessons.every(l => (l.status || getStatus(l.id)) === 'completed')) {
                stage6Status = 'completed';
            }

            // Calculate aggregate metrics across all lessons
            const allLessonAttempts = lessons.flatMap(l => getAttempts(l.id));
            const totalTokens = allLessonAttempts.reduce((sum, a) => sum + (a.processMetrics?.tokens || 0), 0);
            const totalCost = allLessonAttempts.reduce((sum, a) => sum + (a.processMetrics?.cost || 0), 0);
            const totalDuration = allLessonAttempts.reduce((sum, a) => sum + (a.processMetrics?.duration || 0), 0);
            // Use item.status from parallelItems for consistency
            const completedLessons = lessons.filter(l => (l.status || getStatus(l.id)) === 'completed').length;

            // Add Stage 6 node
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
                    // Store lesson progress in outputData for UI consumption
                    outputData: {
                        completedLessons,
                        totalLessons: lessons.length
                    }
                }
            });

            // Edge from previous node to Stage 6
            newEdges.push({
                id: `e${prevNodeId}-${stageKey}`,
                source: prevNodeId,
                target: stageKey,
                type: 'animated',
                data: { status: 'idle', animated: false }
            });

            // Create module and lesson nodes
            // IMPORTANT: React Flow requires parent nodes to be in array BEFORE children
            // So we process modules first, then lessons

            // Helper to extract number from ID (e.g., "module_7" -> 7, "lesson_2_3" -> 2003)
            const extractSortKey = (id: string): number => {
                const numbers = id.match(/\d+/g);
                if (!numbers) return 0;
                // For lessons: combine section and lesson numbers (e.g., 2_3 -> 2003)
                if (numbers.length >= 2) {
                    return parseInt(numbers[0]) * 1000 + parseInt(numbers[1]);
                }
                return parseInt(numbers[0]);
            };

            // Sort modules by moduleOrder (from data) > section_number > extracted from ID
            const moduleItems = items
                .filter(item => item.type === 'module')
                .sort((a, b) => {
                    const aNum = (a.data?.moduleOrder as number) ?? (a.data?.section_number as number) ?? extractSortKey(a.id);
                    const bNum = (b.data?.moduleOrder as number) ?? (b.data?.section_number as number) ?? extractSortKey(b.id);
                    return aNum - bNum;
                });

            // Sort lessons by lessonOrder (from data) > extracted from ID
            const lessonItems = items
                .filter(item => item.type === 'lesson')
                .sort((a, b) => {
                    const aNum = (a.data?.lessonOrder as number) ?? extractSortKey(a.id);
                    const bNum = (b.data?.lessonOrder as number) ?? extractSortKey(b.id);
                    return aNum - bNum;
                });

            // First: add all module nodes (parents)
            moduleItems.forEach(item => {
                const trace = getTrace(item.id);
                const attempts = getAttempts(item.id);
                const latestAttempt = attempts[attempts.length - 1];

                // Compute children from lessonItems (lessons with this module as parent)
                const childLessons = lessonItems.filter(lesson => lesson.parentId === item.id);
                const childIds = childLessons.map(lesson => lesson.id);

                // Compute module status from its lessons' statuses
                // Use item.status from parallelItems instead of stageStatuses for consistency
                const childStatuses = childLessons.map(lesson => lesson.status || getStatus(lesson.id));
                const completedLessons = childStatuses.filter(s => s === 'completed').length;
                const totalLessons = childIds.length;

                // Derive module status from children
                let moduleStatus: NodeStatus = 'pending';
                if (childStatuses.some(s => s === 'error')) {
                    moduleStatus = 'error';
                } else if (childStatuses.some(s => s === 'active')) {
                    moduleStatus = 'active';
                } else if (totalLessons > 0 && completedLessons === totalLessons) {
                    moduleStatus = 'completed';
                } else if (completedLessons > 0) {
                    moduleStatus = 'active'; // Partially completed
                }

                // Default to collapsed if > 5 modules (better UX for large courses)
                const defaultCollapsed = modules.length > 5;
                // Use preserved state from ref (set by user clicks), then item.data, then default
                const isCollapsed = moduleCollapsedRef.current.get(item.id) ?? (item.data?.isCollapsed as boolean) ?? defaultCollapsed;

                newNodes.push({
                    id: item.id,
                    type: 'module',
                    position: getExistingPos(item.id),
                    data: {
                        ...config,
                        ...item.data, // Spread item.data FIRST, then override with computed values
                        label: item.label,
                        status: moduleStatus,
                        stageNumber: 6 as const,
                        moduleId: item.id,
                        title: item.label,
                        totalLessons: totalLessons,
                        completedLessons: completedLessons,
                        isCollapsed: isCollapsed, // Explicit override AFTER spread
                        childIds: childIds, // Now always correctly populated from lessonItems
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

            // Second: add all lesson nodes (children)
            // Build lookup for module isCollapsed state using preserved state from ref
            const defaultCollapsedForLessons = modules.length > 5;
            const moduleCollapsedMap = new Map(
                moduleItems.map(m => [m.id, moduleCollapsedRef.current.get(m.id) ?? (m.data?.isCollapsed as boolean) ?? defaultCollapsedForLessons])
            );

            lessonItems.forEach(item => {
                const trace = getTrace(item.id);
                // Use item.status from parallelItems (set from trace.output_data)
                // instead of stageStatuses (set from step_name==='finish')
                // This ensures consistency between parallel items and graph nodes
                const currentStatus = item.status || getStatus(item.id);
                const attempts = getAttempts(item.id);
                const latestAttempt = attempts[attempts.length - 1];

                // Hide lesson if parent module is collapsed
                const parentCollapsed = item.parentId ? moduleCollapsedMap.get(item.parentId) : false;

                newNodes.push({
                    id: item.id,
                    type: 'lesson',
                    parentId: item.parentId,
                    extent: 'parent',
                    position: getExistingPos(item.id),
                    hidden: parentCollapsed, // Hide when parent module is collapsed
                    draggable: false, // Lessons are fixed within their parent module
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

            // Add Stage 6 Splitter node (after Stage 6, before modules)
            const splitterId = 'stage6_splitter';
            newNodes.push({
                id: splitterId,
                type: 'merge', // Reuse merge node type for consistency
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

            // Edge from Stage 6 to Splitter
            newEdges.push({
                id: `e${stageKey}-${splitterId}`,
                source: stageKey,
                target: splitterId,
                type: 'animated',
                data: { status: 'idle', animated: false }
            });

            // Fan-out edges from Splitter to modules
            modules.forEach(mod => {
                newEdges.push({
                    id: `e${splitterId}-${mod.id}`,
                    source: splitterId,
                    target: mod.id,
                    type: 'animated',
                    data: { status: 'idle', animated: false }
                });
            });

            // REMOVED: Fan-out edges from modules to lessons
            // Lessons are now nested inside module containers with parentId
            // ELK will NOT layout edges between different hierarchy levels

            // Add Stage 6 Merger node (after all modules, before End)
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

            // Fan-in edges from modules to Merger
            modules.forEach(mod => {
                newEdges.push({
                    id: `e${mod.id}-${mergerId}`,
                    source: mod.id,
                    target: mergerId,
                    type: 'animated',
                    data: { status: 'idle', animated: false }
                });
            });

            // Set prevNodeId to Merger for End node connection
            prevNodeId = mergerId;

        // Branching Logic for other parallelizable stages (not Stage 6)
        } else if (config.parallelizable && items && items.length > 0) {
            const itemNodes: string[] = [];

            items.forEach(item => {
                // Skip document items - they're handled by the new Stage 2 special handling
                if (item.type === 'document' || item.type === 'document-step') {
                    console.warn('[useGraphData] Skipping document item in parallelItems path - should use Stage 2 special handling instead:', item.id);
                    return;
                }

                // This path should no longer be reached for Stage 6 or modules/lessons
                // Skip any lesson or module items (they should be handled by Stage 6 special case)
                if (item.type === 'lesson' || item.type === 'module') {
                    console.warn('[useGraphData] Skipping lesson/module item in general parallelizable path - should use Stage 6 special handling instead:', item.id);
                    return;
                }

                // For future parallelizable stages only (currently none)
                itemNodes.push(item.id);
            });

            // Edges (Fan Out)
            itemNodes.forEach(nodeId => {
                newEdges.push({
                    id: `e${prevNodeId}-${nodeId}`,
                    source: prevNodeId,
                    target: nodeId,
                    type: 'animated',
                    data: { status: 'idle', animated: false }
                });
            });

            // Fan In (Merge)
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
            // Standard Node
            const trace = getTrace(stageKey);
            const currentStatus = getStatus(stageKey);
            const attempts = getAttempts(stageKey);
            const phases = getPhases(stageKey);
            const latestAttempt = attempts[attempts.length - 1];

            newNodes.push({
                id: stageKey,
                type: 'stage',
                position: getExistingPos(stageKey),
                data: {
                    ...config,
                    status: currentStatus,
                    stageNumber: i as 1 | 2 | 3 | 4 | 5 | 6, // Stage nodes require non-null stage number
                    label: config.name,
                    duration: trace?.duration_ms,
                    tokens: trace?.tokens_used,
                    cost: trace?.cost_usd,
                    currentStep: trace?.step_name,
                    attempts: attempts,
                    phases: phases.length > 0 ? phases : undefined, // Add phases for stages 4, 5
                    inputData: latestAttempt?.inputData,
                    outputData: latestAttempt?.outputData,
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

    // Connect End (always from prevNodeId - now stage6_merger for Stage 6)
    newEdges.push({
        id: `e${prevNodeId}-end`,
        source: prevNodeId,
        target: 'end',
        type: 'animated',
        data: { status: 'idle', animated: false }
    });

    // Update State with Shallow Compare (O(n) instead of O(n²) JSON.stringify)
    // This avoids including nodes/edges in dependencies which could cause loops
    setNodes((currentNodes) => {
        // Quick length check first
        if (currentNodes.length !== newNodes.length) {
            return newNodes;
        }

        // Shallow comparison - check if any node changed
        const hasChanges = newNodes.some((newNode, idx) => {
            const currentNode = currentNodes[idx];
            if (!currentNode) return true;

            // Compare key properties (excluding position which changes during layout)
            return currentNode.id !== newNode.id ||
                   currentNode.type !== newNode.type ||
                   currentNode.parentId !== newNode.parentId ||
                   // For data, compare status which is the most frequently changing field
                   currentNode.data?.status !== newNode.data?.status ||
                   currentNode.data?.currentStep !== newNode.data?.currentStep ||
                   currentNode.data?.label !== newNode.data?.label;
        });

        return hasChanges ? newNodes : currentNodes;
    });

    setEdges((currentEdges) => {
        // Quick length check first
        if (currentEdges.length !== newEdges.length) {
            return newEdges;
        }

        // Shallow comparison for edges
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

  }, [parallelItems, stageStatuses, documentSteps, attemptsMap, phasesMap, hasDocuments, setNodes, setEdges]); // traceMapRef is stable ref, not needed in deps

  // Update document names when filenameMap becomes available
  // This handles the race condition where traces arrive before file_catalog is loaded
  useEffect(() => {
    if (!getFilenameRef.current || documentSteps.size === 0) return;

    let cancelled = false;
    let hasUpdates = false;
    const updatedDocs = new Map<string, DocumentWithSteps>();

    documentSteps.forEach((doc, docId) => {
      // If name is still a UUID fallback, try to get real name from file_catalog
      const baseName = doc.name.split('.')[0];
      if (doc.name.startsWith('Документ ') || isUUID(baseName)) {
        const realName = getFilenameRef.current?.(docId);
        if (realName && realName !== doc.name) {
          // Create new object reference to trigger React re-render
          updatedDocs.set(docId, { ...doc, name: realName });
          hasUpdates = true;
        } else {
          updatedDocs.set(docId, doc);
        }
      } else {
        updatedDocs.set(docId, doc);
      }
    });

    // Only update state if not cancelled (component still mounted)
    if (!cancelled && hasUpdates) {
      setDocumentSteps(updatedDocs);
    }

    // Cleanup function to prevent state updates on unmounted component
    return () => {
      cancelled = true;
    };
  }, [documentSteps]); // getFilenameRef is stable, documentSteps triggers re-check

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