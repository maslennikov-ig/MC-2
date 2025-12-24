/**
 * Stage 4 "Deep Analysis" Types
 *
 * Stage 4 is "The Architect's Studio" - where raw materials
 * become a structured blueprint for course generation.
 *
 * Color scheme: Violet/Purple (wisdom, synthesis, strategy)
 */

// ============================================================================
// INPUT DATA
// ============================================================================

export interface Stage4InputData {
  /** Course context from Stage 1 */
  courseContext: {
    topic: string;
    description: string;
    style?: string;
    targetAudience?: string;
    lessonsRange?: { min: number; max: number };
  };
  /** Document classifications from Stage 3 */
  classifications: Stage4DocumentClassification[];
  /** Document summaries from Stage 2 */
  documentSummaries?: {
    fileId: string;
    summary: string;
    tokens: number;
  }[];
  /** Analysis parameters */
  parameters?: {
    tokenBudget?: number;
    model?: string;
  };
}

export interface Stage4DocumentClassification {
  fileId: string;
  filename: string;
  priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  rationale: string;
  importanceScore: number;
}

// ============================================================================
// PROCESS TAB
// ============================================================================

export type Stage4PhaseId =
  | 'phase_0' // Audit - Data integrity check
  | 'phase_1' // Classify - Domain classification
  | 'phase_2' // Scoping - Volume calculation
  | 'phase_3' // Strategy - Pedagogical strategy (Main phase!)
  | 'phase_4' // Synthesis - Content extraction
  | 'phase_5' // Blueprint - Plan assembly
  | 'phase_6'; // Mapping - RAG connections

export type Stage4PhaseStatus = 'pending' | 'active' | 'completed' | 'error' | 'skipped';

export interface Stage4Phase {
  id: Stage4PhaseId;
  name: string;
  description?: string;
  status: Stage4PhaseStatus;
  durationMs?: number;
  message?: string;
}

export interface Stage4TelemetryData {
  processingTimeMs: number;
  totalTokens: number;
  /** Model used (deprecated - use tier) */
  model?: string;
  /** Organization tier for tier-based model naming */
  tier?: string;
  confidence?: number; // From course_category.confidence
  complexity?: string; // From topic_analysis.complexity
}

/** Synthetic insight message for InsightTerminal */
export interface InsightMessage {
  id: string;
  timestamp: Date;
  type: 'info' | 'decision' | 'warning';
  message: string;
  phase?: Stage4PhaseId;
}

// ============================================================================
// ACTIVITY TAB
// ============================================================================

export type ActivityPhaseGroup =
  | 'preparation' // phase_0
  | 'classification' // phase_1
  | 'planning' // phase_2, phase_3
  | 'synthesis' // phase_4, phase_5
  | 'mapping'; // phase_6

export type ActivityActor = 'system' | 'ai' | 'user';

export interface Stage4ActivityEvent {
  id: string;
  timestamp: Date;
  actor: ActivityActor;
  type: 'info' | 'success' | 'warning' | 'error' | 'decision';
  message: string;
  phase: ActivityPhaseGroup;
  details?: Record<string, unknown>;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface Stage4InputTabProps {
  /** Course ID to fetch data */
  courseId?: string;
  /** Input data from trace (fallback) */
  inputData?: Stage4InputData | unknown;
  /** Locale */
  locale?: 'ru' | 'en';
}

export interface Stage4ProcessTabProps {
  /** Course ID */
  courseId?: string;
  /** Processing phases */
  phases?: Stage4Phase[];
  /** Telemetry data */
  telemetry?: Stage4TelemetryData;
  /** Output data for synthetic insights */
  outputData?: unknown;
  /** Current status */
  status?: 'pending' | 'active' | 'completed' | 'error';
  /** Locale */
  locale?: 'ru' | 'en';
}

export interface Stage4OutputTabProps {
  /** Output data (AnalysisResult) */
  outputData?: unknown;
  /** Course ID for editing */
  courseId?: string;
  /** Enable edit mode */
  editable?: boolean;
  /** Auto-focus first editable field */
  autoFocus?: boolean;
  /** View-only mode */
  readOnly?: boolean;
  /** Locale */
  locale?: 'ru' | 'en';
  /** Callback when stage is approved */
  onApproved?: () => void;
}

export interface Stage4ActivityTabProps {
  /** Node ID for filtering traces */
  nodeId: string | null;
  /** Course ID */
  courseId?: string;
  /** Locale */
  locale?: 'ru' | 'en';
}

// ============================================================================
// HELPER COMPONENT PROPS
// ============================================================================

export interface KnowledgeStackProps {
  classifications: Stage4DocumentClassification[];
  locale?: 'ru' | 'en';
}

export interface AnalysisHeroProps {
  category: string;
  confidence: number;
  totalLessons: number;
  totalSections: number;
  lessonDuration: number;
  teachingStyle: string;
  locale?: 'ru' | 'en';
}

export interface InsightTerminalProps {
  messages: InsightMessage[];
  locale?: 'ru' | 'en';
}
