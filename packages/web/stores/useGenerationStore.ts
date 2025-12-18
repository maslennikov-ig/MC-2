import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { logger } from '@/lib/logger';
import { GenerationTrace } from '@/components/generation-monitoring/realtime-provider';
import {
  NodeStatus,
  TraceAttempt,
  DocumentStageData
} from '@megacampus/shared-types';

// Enable Immer support for Map and Set
enableMapSet();

// ============================================================================
// CONSTANTS
// ============================================================================

const TOTAL_DOCUMENT_STEPS = 7;

/**
 * Map phase names to step indices (0-6).
 * Stage 2 document processing phases:
 * - init/start → 0
 * - processing → 1
 * - chunking → 2
 * - embedding → 3
 * - indexing → 4
 * - summarization → 5
 * - complete/finish → 6
 */
const PHASE_TO_STEP_INDEX: Record<string, number> = {
  'init': 0,
  'start': 0,
  'processing': 1,
  'chunking': 2,
  'embedding': 3,
  'indexing': 4,
  'summarization': 5,
  'complete': 6,
  'finish': 6
};

/**
 * Step names translation (Russian)
 */
const STEP_NAME_TRANSLATIONS: Record<string, string> = {
  'init': 'Инициализация',
  'start': 'Начало',
  'processing': 'Обработка',
  'chunking': 'Разбиение',
  'embedding': 'Эмбеддинги',
  'indexing': 'Индексация',
  'summarization': 'Саммаризация',
  'complete': 'Завершено',
  'finish': 'Готово'
};

// ============================================================================
// TYPES
// ============================================================================

type StageId = 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';

/**
 * Document state for Stage 2 parallel processing.
 * Contains both progress tracking and full stage data for modal display.
 */
interface DocumentState {
  /** Document UUID */
  id: string;
  /** Human-readable filename */
  name: string;
  /** Current processing status */
  status: NodeStatus;
  /** Processing priority */
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  /** Number of completed steps (0-based index, 0-6) */
  completedSteps: number;
  /** Total number of steps (always 7) */
  totalSteps: number;
  /** Current phase name */
  currentPhase: string;
  /** All processing stages for modal display */
  stages: DocumentStageData[];
}

/**
 * Simple stage state (Stages 1, 3, 4, 5)
 */
interface SimpleStageState {
  id: StageId;
  status: NodeStatus;
  currentStep?: string;
  attempts: TraceAttempt[];
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Module state for Stage 6
 */
interface ModuleState {
  id: string;
  title: string;
  status: NodeStatus;
  totalLessons: number;
  completedLessons: number;
  isCollapsed: boolean;
}

/**
 * Lesson state for Stage 6
 */
interface LessonState {
  id: string;
  moduleId: string;
  title: string;
  status: NodeStatus;
  currentStep?: string;
  attempts: TraceAttempt[];
}

/**
 * Module structure from Stage 5 output
 */
interface ModuleStructure {
  id?: string;
  title: string;
  lessons?: Array<{ id: string; title: string }>;
}

// ============================================================================
// STORE STATE & ACTIONS
// ============================================================================

interface GenerationState {
  // === Identifiers ===
  courseId: string | null;
  hasDocuments: boolean;

  // === Stage-level state ===
  stages: Map<StageId, SimpleStageState>;

  // === Stage 2: Documents (parallel) ===
  documents: Map<string, DocumentState>;

  // === Stage 6: Modules & Lessons (parallel) ===
  modules: Map<string, ModuleState>;
  lessons: Map<string, LessonState>;

  // === Workflow metadata ===
  workflowStartedAt?: Date;
  workflowCompletedAt?: Date;

  // ========== ACTIONS ==========

  // Initialization
  setCourseId: (id: string, hasDocuments?: boolean) => void;
  initializeDocuments: (files: Array<{id: string, name: string}>) => void;
  reset: () => void;

  // Trace processing
  addTrace: (trace: GenerationTrace) => void;
  loadFromTraces: (traces: GenerationTrace[]) => void;

  // Stage 6 structure
  setModuleStructure: (modules: ModuleStructure[]) => void;

  // ========== SELECTORS ==========

  // Stage selectors
  getStageStatus: (stageId: StageId) => NodeStatus;
  isStageComplete: (stageId: StageId) => boolean;

  // Document selectors (Stage 2)
  getDocument: (docId: string) => DocumentState | undefined;
  getDocuments: () => DocumentState[];
  getDocumentProgress: (docId: string) => { completed: number; total: number };
  getDocumentStatus: (docId: string) => NodeStatus;
  getDocumentStages: (docId: string) => DocumentStageData[];
  areAllDocumentsComplete: () => boolean;

  // Module/Lesson selectors (Stage 6)
  getModule: (moduleId: string) => ModuleState | undefined;
  getModules: () => ModuleState[];
  getLesson: (lessonId: string) => LessonState | undefined;
  getLessonsByModule: (moduleId: string) => LessonState[];
  getLessonStatus: (lessonId: string) => NodeStatus;
  areAllLessonsComplete: () => boolean;

  // Workflow selectors
  getCurrentStage: () => StageId | null;
  getWorkflowProgress: () => { current: number; total: number };
  isWorkflowComplete: () => boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractDocumentId(trace: GenerationTrace): string | null {
  const inputData = trace.input_data;
  if (!inputData) return null;
  return inputData.document_id || inputData.documentId || inputData.fileId || inputData.file_id || null;
}

function extractDocumentName(trace: GenerationTrace): string | null {
  const inputData = trace.input_data;
  if (!inputData) return null;
  return inputData.originalFilename || inputData.original_filename ||
         inputData.originalName || inputData.original_name ||
         inputData.file_name || inputData.filename || inputData.fileName || null;
}

function translateStepName(phase: string): string {
  const lower = phase.toLowerCase();
  return STEP_NAME_TRANSLATIONS[lower] || phase;
}

function traceToAttempt(trace: GenerationTrace, attemptNumber: number): TraceAttempt {
  return {
    attemptNumber,
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
    errorMessage: trace.error_data?.message
  };
}

function calculateDocumentStatus(stages: DocumentStageData[], completedSteps: number): NodeStatus {
  // Error takes priority
  if (stages.some(s => s.status === 'error')) return 'error';

  // All 7 steps completed = completed
  // completedSteps is 0-indexed (0-6), so step 6 means all 7 steps are done
  if (completedSteps >= TOTAL_DOCUMENT_STEPS - 1) {
    // Check if the last stage (complete/finish) exists
    const lastStage = stages.find(s => s.stageNumber === TOTAL_DOCUMENT_STEPS);
    // If last stage exists (regardless of its internal status), document is completed
    if (lastStage) return 'completed';
  }

  // Has active stages = active
  if (stages.some(s => s.status === 'active')) return 'active';

  // Has completed stages but not all = active (still processing)
  if (stages.some(s => s.status === 'completed')) return 'active';

  return 'pending';
}

function isStageCompletePhase(phase?: string): boolean {
  if (!phase) return false;
  const lower = phase.toLowerCase();
  return lower === 'complete' || lower === 'finish' || lower === 'done';
}

function isLessonCompletePhase(phase?: string): boolean {
  return isStageCompletePhase(phase);
}

function initializeStages(hasDocuments: boolean): Map<StageId, SimpleStageState> {
  const stages = new Map<StageId, SimpleStageState>();
  const stageIds: StageId[] = ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6'];

  stageIds.forEach((id) => {
    const isSkipped = !hasDocuments && (id === 'stage_2' || id === 'stage_3');
    stages.set(id, {
      id,
      status: isSkipped ? 'skipped' : 'pending',
      attempts: []
    });
  });

  return stages;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useGenerationStore = create<GenerationState>()(
  immer((set, get) => ({
    courseId: null,
    hasDocuments: true,
    stages: new Map(),
    documents: new Map(),
    modules: new Map(),
    lessons: new Map(),

    // ========== INITIALIZATION ==========

    setCourseId: (id, hasDocuments = true) => {
      set((state) => {
        if (state.courseId !== id) {
          logger.devLog('[GenerationStore] Setting courseId:', id, 'hasDocuments:', hasDocuments);
          state.courseId = id;
          state.hasDocuments = hasDocuments;
          state.stages = initializeStages(hasDocuments);
          state.documents = new Map();
          state.modules = new Map();
          state.lessons = new Map();
          state.workflowStartedAt = new Date();
          state.workflowCompletedAt = undefined;
        }
      });
    },

    initializeDocuments: (files) => {
      set((state) => {
        // Only initialize if documents map is empty (prevent overwriting progress)
        if (state.documents.size > 0) return;

        files.forEach((file) => {
          state.documents.set(file.id, {
            id: file.id,
            name: file.name,
            status: 'pending',
            completedSteps: -1, // -1 means not started
            totalSteps: TOTAL_DOCUMENT_STEPS,
            currentPhase: '',
            stages: []
          });
        });

        logger.devLog('[GenerationStore] Initialized documents:', files.length);
      });
    },

    reset: () => {
      set((state) => {
        logger.devLog('[GenerationStore] Resetting all state');
        state.courseId = null;
        state.hasDocuments = true;
        state.stages = new Map();
        state.documents = new Map();
        state.modules = new Map();
        state.lessons = new Map();
        state.workflowStartedAt = undefined;
        state.workflowCompletedAt = undefined;
      });
    },

    // ========== TRACE PROCESSING ==========

    addTrace: (trace) => {
      set((state) => {
        const attempt = traceToAttempt(trace, 1);

        switch (trace.stage) {
          case 'stage_1':
          case 'stage_3':
          case 'stage_4':
          case 'stage_5': {
            // Simple stage update
            const stage = state.stages.get(trace.stage);
            if (!stage) break;

            stage.attempts.push(attempt);
            stage.currentStep = trace.step_name;

            if (trace.error_data) {
              stage.status = 'error';
            } else if (isStageCompletePhase(trace.phase)) {
              stage.status = 'completed';
              stage.completedAt = new Date();
            } else {
              stage.status = 'active';
              if (!stage.startedAt) stage.startedAt = new Date();
            }
            break;
          }

          case 'stage_2': {
            // Document processing
            const docId = extractDocumentId(trace);
            if (!docId) break;

            const phase = (trace.phase || trace.step_name || 'unknown').toLowerCase();
            const stepIndex = PHASE_TO_STEP_INDEX[phase] ?? -1;
            if (stepIndex === -1) {
              logger.devLog('[GenerationStore] Unknown phase:', phase, 'for doc:', docId);
              break;
            }

            const existing = state.documents.get(docId);
            const docName = extractDocumentName(trace);

            // Determine step status:
            // - error_data = error
            // - init/start/complete/finish phases = completed (these are markers, not processing steps)
            // - output_data = completed (successful processing)
            // - otherwise = active
            const isMarkerPhase = phase === 'init' || phase === 'start' || phase === 'complete' || phase === 'finish';
            const stepStatus: NodeStatus = trace.error_data
              ? 'error'
              : (isMarkerPhase || trace.output_data)
                ? 'completed'
                : 'active';

            const stageId = `${docId}_${phase}`;
            const newStage: DocumentStageData = {
              stageId,
              stageName: translateStepName(phase),
              stageNumber: stepIndex + 1,
              status: stepStatus,
              attempts: [attempt],
              inputData: trace.input_data,
              outputData: trace.output_data
            };

            if (existing) {
              const stageIdx = existing.stages.findIndex(s => s.stageId === stageId);

              if (stageIdx >= 0) {
                existing.stages[stageIdx].attempts.push(attempt);
                existing.stages[stageIdx].status = stepStatus;
                existing.stages[stageIdx].inputData = trace.input_data;
                existing.stages[stageIdx].outputData = trace.output_data;
              } else {
                existing.stages.push(newStage);
                existing.stages.sort((a, b) => a.stageNumber - b.stageNumber);
              }

              existing.completedSteps = Math.max(existing.completedSteps, stepIndex);
              existing.currentPhase = phase;
              existing.status = calculateDocumentStatus(existing.stages, existing.completedSteps);

              if (docName && existing.name.startsWith('Документ ')) {
                existing.name = docName;
              }
            } else {
              state.documents.set(docId, {
                id: docId,
                name: docName || `Документ ${docId.substring(0, 8)}...`,
                status: stepStatus === 'error' ? 'error' : 'active',
                completedSteps: stepIndex,
                totalSteps: TOTAL_DOCUMENT_STEPS,
                currentPhase: phase,
                priority: trace.input_data?.priority as 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY' | undefined,
                stages: [newStage]
              });
            }

            // Update Stage 2 overall status
            const stage2 = state.stages.get('stage_2');
            if (stage2) {
              const allDocs = Array.from(state.documents.values());
              if (allDocs.some(d => d.status === 'error')) {
                stage2.status = 'error';
              } else if (allDocs.every(d => d.status === 'completed')) {
                stage2.status = 'completed';
                stage2.completedAt = new Date();
              } else {
                stage2.status = 'active';
                if (!stage2.startedAt) stage2.startedAt = new Date();
              }
            }

            logger.devLog('[GenerationStore] Updated document:', {
              docId: docId.substring(0, 8),
              phase,
              stepIndex,
              stagesCount: state.documents.get(docId)?.stages.length
            });
            break;
          }

          case 'stage_6': {
            // Lesson generation
            if (!trace.lesson_id) break;

            const lessonId = trace.lesson_id;
            const existing = state.lessons.get(lessonId);

            if (existing) {
              existing.attempts.push(attempt);
              existing.currentStep = trace.step_name;

              if (trace.error_data) {
                existing.status = 'error';
              } else if (isLessonCompletePhase(trace.phase)) {
                existing.status = 'completed';

                // Update module progress
                const courseModule = state.modules.get(existing.moduleId);
                if (courseModule) {
                  const moduleLessons = Array.from(state.lessons.values())
                    .filter(l => l.moduleId === existing.moduleId);
                  courseModule.completedLessons = moduleLessons.filter(l => l.status === 'completed').length;

                  if (courseModule.completedLessons === courseModule.totalLessons) {
                    courseModule.status = 'completed';
                  }
                }
              } else {
                existing.status = 'active';
              }
            }

            // Update Stage 6 overall status
            const stage6 = state.stages.get('stage_6');
            if (stage6) {
              const allLessons = Array.from(state.lessons.values());
              if (allLessons.some(l => l.status === 'error')) {
                stage6.status = 'error';
              } else if (allLessons.length > 0 && allLessons.every(l => l.status === 'completed')) {
                stage6.status = 'completed';
                stage6.completedAt = new Date();
                state.workflowCompletedAt = new Date();
              } else if (allLessons.some(l => l.status === 'active')) {
                stage6.status = 'active';
                if (!stage6.startedAt) stage6.startedAt = new Date();
              }
            }
            break;
          }
        }
      });
    },

    loadFromTraces: (traces) => {
      const sorted = [...traces].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      logger.devLog('[GenerationStore] Loading', sorted.length, 'traces');

      set((state) => {
        // Reset parallel items but keep stages
        state.documents = new Map();

        for (const trace of sorted) {
          const attempt = traceToAttempt(trace, 1);

          switch (trace.stage) {
            case 'stage_1':
            case 'stage_3':
            case 'stage_4':
            case 'stage_5': {
              const stage = state.stages.get(trace.stage);
              if (!stage) break;

              stage.attempts.push(attempt);
              stage.currentStep = trace.step_name;

              if (trace.error_data) {
                stage.status = 'error';
              } else if (isStageCompletePhase(trace.phase)) {
                stage.status = 'completed';
                stage.completedAt = new Date(trace.created_at);
              } else {
                stage.status = 'active';
                if (!stage.startedAt) stage.startedAt = new Date(trace.created_at);
              }
              break;
            }

            case 'stage_2': {
              const docId = extractDocumentId(trace);
              if (!docId) continue;

              const phase = (trace.phase || trace.step_name || 'unknown').toLowerCase();
              const stepIndex = PHASE_TO_STEP_INDEX[phase] ?? -1;
              if (stepIndex === -1) continue;

              const docName = extractDocumentName(trace);
              // Marker phases (init, start, complete, finish) are always 'completed' - they don't have output_data
              const isMarkerPhase = phase === 'init' || phase === 'start' || phase === 'complete' || phase === 'finish';
              const stepStatus: NodeStatus = trace.error_data
                ? 'error'
                : (isMarkerPhase || trace.output_data)
                  ? 'completed'
                  : 'active';

              const stageId = `${docId}_${phase}`;
              const newStage: DocumentStageData = {
                stageId,
                stageName: translateStepName(phase),
                stageNumber: stepIndex + 1,
                status: stepStatus,
                attempts: [attempt],
                inputData: trace.input_data,
                outputData: trace.output_data
              };

              const existing = state.documents.get(docId);

              if (existing) {
                const stageIdx = existing.stages.findIndex(s => s.stageId === stageId);

                if (stageIdx >= 0) {
                  existing.stages[stageIdx].attempts.push(attempt);
                  existing.stages[stageIdx].status = stepStatus;
                  existing.stages[stageIdx].inputData = trace.input_data;
                  existing.stages[stageIdx].outputData = trace.output_data;
                } else {
                  existing.stages.push(newStage);
                  existing.stages.sort((a, b) => a.stageNumber - b.stageNumber);
                }

                existing.completedSteps = Math.max(existing.completedSteps, stepIndex);
                existing.currentPhase = phase;
                existing.status = calculateDocumentStatus(existing.stages, existing.completedSteps);

                if (docName && existing.name.startsWith('Документ ')) {
                  existing.name = docName;
                }
              } else {
                state.documents.set(docId, {
                  id: docId,
                  name: docName || `Документ ${docId.substring(0, 8)}...`,
                  status: stepStatus === 'error' ? 'error' : 'active',
                  completedSteps: stepIndex,
                  totalSteps: TOTAL_DOCUMENT_STEPS,
                  currentPhase: phase,
                  priority: trace.input_data?.priority as 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY' | undefined,
                  stages: [newStage]
                });
              }
              break;
            }

            case 'stage_6': {
              if (!trace.lesson_id) continue;

              const lessonId = trace.lesson_id;
              const existing = state.lessons.get(lessonId);

              if (existing) {
                existing.attempts.push(attempt);
                existing.currentStep = trace.step_name;

                if (trace.error_data) {
                  existing.status = 'error';
                } else if (isLessonCompletePhase(trace.phase)) {
                  existing.status = 'completed';
                } else {
                  existing.status = 'active';
                }
              }
              break;
            }
          }
        }

        // Update Stage 2 overall status after loading all traces
        const stage2 = state.stages.get('stage_2');
        if (stage2 && state.documents.size > 0) {
          const allDocs = Array.from(state.documents.values());
          if (allDocs.some(d => d.status === 'error')) {
            stage2.status = 'error';
          } else if (allDocs.every(d => d.status === 'completed')) {
            stage2.status = 'completed';
          } else if (allDocs.some(d => d.status === 'active' || d.status === 'completed')) {
            stage2.status = 'active';
          }
        }

        // Update Stage 6 overall status
        const stage6 = state.stages.get('stage_6');
        if (stage6 && state.lessons.size > 0) {
          const allLessons = Array.from(state.lessons.values());
          if (allLessons.some(l => l.status === 'error')) {
            stage6.status = 'error';
          } else if (allLessons.every(l => l.status === 'completed')) {
            stage6.status = 'completed';
          } else if (allLessons.some(l => l.status === 'active')) {
            stage6.status = 'active';
          }
        }

        logger.devLog('[GenerationStore] Loaded', state.documents.size, 'documents');
      });
    },

    setModuleStructure: (modulesData) => {
      set((state) => {
        state.modules = new Map();
        state.lessons = new Map();

        modulesData.forEach((mod, idx) => {
          const moduleId = mod.id || `module_${idx}`;

          state.modules.set(moduleId, {
            id: moduleId,
            title: mod.title,
            status: 'pending',
            totalLessons: mod.lessons?.length || 0,
            completedLessons: 0,
            isCollapsed: modulesData.length > 5
          });

          mod.lessons?.forEach((les) => {
            state.lessons.set(les.id, {
              id: les.id,
              moduleId,
              title: les.title,
              status: 'pending',
              attempts: []
            });
          });
        });

        logger.devLog('[GenerationStore] Set module structure:', state.modules.size, 'modules,', state.lessons.size, 'lessons');
      });
    },

    // ========== SELECTORS ==========

    getStageStatus: (stageId) => {
      return get().stages.get(stageId)?.status || 'pending';
    },

    isStageComplete: (stageId) => {
      const stage = get().stages.get(stageId);
      return stage?.status === 'completed' || stage?.status === 'skipped';
    },

    getDocument: (docId) => get().documents.get(docId),

    getDocuments: () => Array.from(get().documents.values()),

    getDocumentProgress: (docId) => {
      const doc = get().documents.get(docId);
      return {
        completed: doc ? doc.completedSteps + 1 : 0,
        total: TOTAL_DOCUMENT_STEPS
      };
    },

    getDocumentStatus: (docId) => {
      return get().documents.get(docId)?.status || 'pending';
    },

    getDocumentStages: (docId) => {
      return get().documents.get(docId)?.stages || [];
    },

    areAllDocumentsComplete: () => {
      const { documents, hasDocuments } = get();
      if (!hasDocuments) return true;
      if (documents.size === 0) return false;
      return Array.from(documents.values()).every(d => d.status === 'completed');
    },

    getModule: (moduleId) => get().modules.get(moduleId),

    getModules: () => Array.from(get().modules.values()),

    getLesson: (lessonId) => get().lessons.get(lessonId),

    getLessonsByModule: (moduleId) => {
      return Array.from(get().lessons.values()).filter(l => l.moduleId === moduleId);
    },

    getLessonStatus: (lessonId) => {
      return get().lessons.get(lessonId)?.status || 'pending';
    },

    areAllLessonsComplete: () => {
      const { lessons } = get();
      if (lessons.size === 0) return false;
      return Array.from(lessons.values()).every(l => l.status === 'completed');
    },

    getCurrentStage: () => {
      const { stages } = get();
      for (const [stageId, stage] of stages) {
        if (stage.status === 'active' || stage.status === 'awaiting') {
          return stageId;
        }
      }
      return null;
    },

    getWorkflowProgress: () => {
      const { stages, hasDocuments } = get();
      const total = hasDocuments ? 6 : 4;
      let completed = 0;

      for (const stage of stages.values()) {
        if (stage.status === 'completed' || stage.status === 'skipped') {
          completed++;
        }
      }

      return { current: completed, total };
    },

    isWorkflowComplete: () => {
      const { stages } = get();
      if (stages.size === 0) return false;
      return Array.from(stages.values()).every(
        s => s.status === 'completed' || s.status === 'skipped'
      );
    }
  }))
);
