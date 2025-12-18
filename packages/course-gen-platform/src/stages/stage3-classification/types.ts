/**
 * Stage 3: Document Classification Types
 * @module stages/stage3-classification/types
 */

/**
 * Input for Stage 3 Classification
 */
export interface Stage3Input {
  /** Course UUID */
  courseId: string;
  /** Organization UUID */
  organizationId: string;
  /** Optional progress callback */
  onProgress?: (progress: number, message: string) => void;
}

/**
 * Output from Stage 3 Classification
 */
export interface Stage3Output {
  /** Whether classification was successful */
  success: boolean;
  /** Course UUID */
  courseId: string;
  /** Classification results for all documents */
  classifications: Array<{
    fileId: string;
    filename: string;
    priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
    rationale: string;
  }>;
  /** Total number of documents classified */
  totalDocuments: number;
  /** Count of CORE documents (should be 1) */
  coreCount: number;
  /** Count of IMPORTANT documents */
  importantCount: number;
  /** Count of SUPPLEMENTARY documents */
  supplementaryCount: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Internal document metadata for classification
 */
export interface DocumentMetadata {
  id: string;
  filename: string;
  summary: string;
  summaryTokens: number;
}
