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
 * Valid tier keys matching database tier enum
 */
export type TierKey = 'trial' | 'free' | 'basic' | 'standard' | 'premium';

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
  tier: TierKey;
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
 * Default tier features (fallback when DB unavailable).
 *
 * ⚠️ IMPORTANT: These defaults must match the values seeded in:
 *    - Migration: 20251221120000_create_tier_settings.sql
 *    - Migration: add_document_processing_features_to_tier_settings (Supabase MCP)
 *
 * When updating tier features in the database via /admin/pricing,
 * consider updating these defaults accordingly for consistency.
 *
 * Uses Record type to ensure exhaustiveness checking at compile time.
 */
export const DEFAULT_TIER_FEATURES: Record<TierKey, TierFeatures> = {
  trial: {
    doclingConversion: true,
    ocrExtraction: true,
    visualAnalysis: true,
    enhancedVisuals: false,
  },
  free: {
    doclingConversion: false,
    ocrExtraction: false,
    visualAnalysis: false,
    enhancedVisuals: false,
  },
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

/**
 * Get default tier features based on subscription level.
 * For DB-driven features, use parseTierFeaturesFromDB instead.
 */
export function getTierFeatures(tier: TierKey): TierFeatures {
  return DEFAULT_TIER_FEATURES[tier] ?? DEFAULT_TIER_FEATURES.basic;
}

/**
 * Parse tier features from database JSONB features column.
 * Extracts document processing features with type-safe fallback to defaults.
 *
 * This function is defensive against:
 * - Null/undefined features
 * - Missing fields (falls back to tier defaults)
 * - Invalid types (falls back to tier defaults with console warning)
 *
 * @param features - JSONB features object from tier_settings.features column
 * @param tier - Tier key used for fallback defaults if features are missing/invalid
 * @returns Typed TierFeatures object with all required boolean fields
 *
 * @example
 * ```typescript
 * const dbFeatures = { doclingConversion: true, ocrExtraction: false };
 * const parsed = parseTierFeaturesFromDB(dbFeatures, 'standard');
 * // Returns: { doclingConversion: true, ocrExtraction: false, visualAnalysis: true, enhancedVisuals: false }
 * ```
 *
 * @example
 * ```typescript
 * // Missing features - falls back to tier defaults
 * const parsed = parseTierFeaturesFromDB(null, 'premium');
 * // Returns: DEFAULT_TIER_FEATURES.premium
 * ```
 */
export function parseTierFeaturesFromDB(
  features: Record<string, unknown> | null | undefined,
  tier: TierKey
): TierFeatures {
  const defaults = DEFAULT_TIER_FEATURES[tier] ?? DEFAULT_TIER_FEATURES.basic;

  if (!features || typeof features !== 'object') {
    return defaults;
  }

  // Helper to validate and warn on invalid types
  const getBooleanField = (
    key: keyof TierFeatures,
    value: unknown,
    defaultValue: boolean
  ): boolean => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value !== undefined) {
      console.warn(
        `[parseTierFeaturesFromDB] Invalid type for "${key}": expected boolean, got ${typeof value}. Using default: ${defaultValue}`
      );
    }
    return defaultValue;
  };

  return {
    doclingConversion: getBooleanField('doclingConversion', features.doclingConversion, defaults.doclingConversion),
    ocrExtraction: getBooleanField('ocrExtraction', features.ocrExtraction, defaults.ocrExtraction),
    visualAnalysis: getBooleanField('visualAnalysis', features.visualAnalysis, defaults.visualAnalysis),
    enhancedVisuals: getBooleanField('enhancedVisuals', features.enhancedVisuals, defaults.enhancedVisuals),
  };
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
  /** Document ID to fetch data from Zustand store */
  documentId?: string;
  /** Input data from trace (fallback if documentId not provided) */
  inputData?: Stage2InputData | unknown;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}

export interface Stage2ProcessTabProps {
  /** Document ID to fetch phases from Zustand store */
  documentId?: string;
  /** Processing phases with status (override, will use Zustand if not provided) */
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
