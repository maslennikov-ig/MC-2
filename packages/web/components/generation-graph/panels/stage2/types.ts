/**
 * Stage 2 "Document Processing" Types
 *
 * Stage 2 is where documents are processed through AI pipeline.
 * User is an OBSERVER watching the "Data Refinery" at work.
 */

// ============================================================================
// INPUT DATA
// ============================================================================

/**
 * Stage 2 input data structure
 * Contains document metadata and processing configuration
 */
export interface Stage2InputData {
  /** File UUID */
  fileId: string;
  /** Original filename (what user uploaded) */
  originalFilename: string;
  /** File path in storage */
  filePath?: string;
  /** MIME type (application/pdf, etc.) */
  mimeType: string;
  /** File size in bytes */
  fileSize?: number;
  /** Organization ID for tier lookup */
  organizationId?: string;
  /** Subscription tier determines available features */
  tier: 'basic' | 'standard' | 'premium';
  /** Number of pages (if document) */
  pageCount?: number;
}

/**
 * Tier-based feature availability
 */
export interface TierFeatures {
  /** Docling document conversion */
  doclingConversion: boolean;
  /** OCR text extraction from images */
  ocrExtraction: boolean;
  /** Image and table analysis */
  visualAnalysis: boolean;
  /** Enhanced image processing */
  enhancedVisuals: boolean;
}

/**
 * Get tier features based on subscription level.
 * Uses Record type to ensure exhaustiveness checking at compile time.
 */
export function getTierFeatures(tier: Stage2InputData['tier']): TierFeatures {
  const tierMap: Record<Stage2InputData['tier'], TierFeatures> = {
    basic: {
      doclingConversion: false,
      ocrExtraction: false,
      visualAnalysis: false,
      enhancedVisuals: false,
    },
    standard: {
      doclingConversion: true,
      ocrExtraction: true,
      visualAnalysis: true,
      enhancedVisuals: false,
    },
    premium: {
      doclingConversion: true,
      ocrExtraction: true,
      visualAnalysis: true,
      enhancedVisuals: true,
    },
  };
  return tierMap[tier] ?? tierMap.basic;
}

// ============================================================================
// OUTPUT DATA
// ============================================================================

/**
 * Stage 2 output data structure
 * Contains processed document results
 */
export interface Stage2OutputData {
  /** Processed markdown content */
  markdownContent?: string;
  /** Vector indexing status */
  vectorStatus: 'pending' | 'indexing' | 'indexed' | 'failed';
  /** Document summarization results */
  summarization?: {
    /** Whether summarization succeeded */
    success: boolean;
    /** Method used for summarization */
    method: 'full_text' | 'hierarchical';
    /** Summary text */
    summaryText?: string;
    /** Summary token count */
    summaryTokens: number;
    /** Quality score (0-1, where 1 is 100%) */
    qualityScore: number;
  };
  /** Processing statistics */
  stats?: DocumentStats;
}

/**
 * Document processing statistics
 */
export interface DocumentStats {
  /** Number of pages processed */
  pages: number;
  /** Number of images extracted */
  images: number;
  /** Number of tables detected */
  tables: number;
  /** Number of sections identified */
  sections: number;
  /** Length of processed markdown */
  markdownLength: number;
  /** Number of chunks created */
  chunksCreated: number;
  /** Total tokens embedded */
  tokensEmbedded: number;
  /** Total processing time in ms */
  processingTimeMs: number;
}

// ============================================================================
// PROCESS TAB (PIPELINE PHASES)
// ============================================================================

/**
 * Processing phase IDs (7 phases in pipeline)
 */
export type ProcessingPhaseId =
  | 'docling'      // Phase 1: Docling conversion
  | 'markdown'     // Phase 2: Markdown processing
  | 'images'       // Phase 3: Image extraction
  | 'chunking'     // Phase 4: Hierarchical chunking
  | 'embedding'    // Phase 5: Embedding generation
  | 'qdrant'       // Phase 6: Qdrant upload
  | 'summarization'; // Phase 7: Document summarization

/**
 * Processing phase status
 */
export type ProcessingPhaseStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'error';

/**
 * Single processing phase in the pipeline
 */
export interface ProcessingPhase {
  /** Phase identifier */
  id: ProcessingPhaseId;
  /** Phase display name (translated) */
  name: string;
  /** Phase description (live status text) */
  description?: string;
  /** Phase status */
  status: ProcessingPhaseStatus;
  /** Execution time in milliseconds */
  durationMs?: number;
  /** Progress percentage (0-100) for active phase */
  progress?: number;
  /** Metrics specific to this phase */
  metrics?: Record<string, number | string>;
  /** Error message if status is 'error' */
  errorMessage?: string;
}

/**
 * Terminal log entry for live console effect
 */
export interface TerminalLogEntry {
  /** Entry timestamp */
  timestamp: Date;
  /** Log level */
  level: 'info' | 'success' | 'warning' | 'error';
  /** Phase that generated this log */
  phase: ProcessingPhaseId;
  /** Log message */
  message: string;
}

// ============================================================================
// ACTIVITY TAB (GROUPED TIMELINE)
// ============================================================================

/**
 * Activity event grouped by processing phase
 */
export interface ActivityPhaseGroup {
  /** Phase identifier */
  phaseId: ProcessingPhaseId;
  /** Phase display name */
  phaseName: string;
  /** Total duration of this phase */
  totalDurationMs: number;
  /** Number of events in this group */
  eventCount: number;
  /** Events in this phase (collapsed by default) */
  events: ActivityEvent[];
}

/**
 * Single activity event
 */
export interface ActivityEvent {
  /** Event UUID */
  id: string;
  /** Event timestamp */
  timestamp: Date;
  /** Who performed the action */
  actor: 'user' | 'system' | 'ai';
  /** Event type for styling */
  type: 'info' | 'success' | 'warning' | 'error';
  /** Event message */
  message: string;
  /** Delta time from previous event (for +120ms display) */
  deltaMs?: number;
  /** Additional details */
  details?: Record<string, unknown>;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface Stage2InputTabProps {
  /** Input data from trace */
  inputData?: Stage2InputData | unknown;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}

export interface Stage2ProcessTabProps {
  /** Processing phases with status */
  phases?: ProcessingPhase[];
  /** Terminal log entries for live console */
  terminalLogs?: TerminalLogEntry[];
  /** Current status */
  status?: 'pending' | 'active' | 'completed' | 'error';
  /** Total progress (0-100) */
  totalProgress?: number;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}

export interface Stage2OutputTabProps {
  /** Output data from trace */
  outputData?: Stage2OutputData | unknown;
  /** Course ID for markdown inspection */
  courseId?: string;
  /** Document ID for markdown inspection */
  documentId?: string;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}

export interface Stage2ActivityTabProps {
  /** Node ID (document node) */
  nodeId: string | null;
  /** Document ID for filtering traces */
  documentId?: string;
  /** Course ID for context */
  courseId?: string;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}
