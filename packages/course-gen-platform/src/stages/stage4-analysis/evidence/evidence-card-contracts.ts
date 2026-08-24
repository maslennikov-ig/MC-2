/**
 * The contracts of document-evidence card generation: what a source unit is, what the model is
 * asked to return, and what counts as a violation.
 *
 * @module evidence-card-contracts
 *
 * Split out of `card-generator.ts` at 1086 lines of code. The seam is between the SHAPE of the
 * work and the DOING of it: every interface, both error classes and the empty-metrics
 * constructor live here, while the summarization pipeline and the model port live in their own
 * files. Re-exported by `card-generator.ts`, so no import path changes.
 */

import type { LanguageCode } from '@/shared/workspace-utils';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';
import type { DocumentEvidencePreflightSource } from './preflight';

export const EVIDENCE_SCHEMA_VERSION = 'document-evidence-v1';

export interface EvidenceGenerationMetrics {
  modelCalls: number;
  retryCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  mapChunks: number;
  reduceLevels: number;
}

export interface EvidenceSourceUnit {
  unitId: string;
  documentId: string;
  sourceVersionHash: string;
  sourceRef: { document_id: string; version_hash: string; chunk_id: string };
  text: string;
  inputHash: string;
}

export interface StructuredClaim {
  statement: string;
  confidence: number;
  unitIds: string[];
}

export interface ValidatedEvidenceUnit {
  unitId: string;
  inputHash: string;
  summary: string;
  claims: StructuredClaim[];
  terminology: string[];
  constraints: string[];
  limitations: string[];
  courseRelevance: number;
}

export interface ValidatedSummaryReduction {
  unitIds: string[];
  summary: string;
}

export interface PortUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface StructuredEvidencePort {
  /** Production LLM client owns transport retries; caller retries only test/simple ports. */
  retryOwner?: 'port' | 'caller';
  extractMap(input: {
    unit: EvidenceSourceUnit;
    topic: string;
    language: LanguageCode;
    maxOutputTokens: number;
  }): Promise<{ value: ValidatedEvidenceUnit; usage: PortUsage }>;
  reduceSummary(input: {
    units: Array<{ unitId: string; summary: string }>;
    topic: string;
    language: LanguageCode;
    level: number;
    maxOutputTokens: number;
  }): Promise<{ value: ValidatedSummaryReduction; usage: PortUsage }>;
}

export interface EvidenceExtractionResponse extends PortUsage {
  courseRelevance: number;
  claims: Array<{
    statement: string;
    confidence: number;
    sourceRefs?: Array<{
      documentId: string;
      versionHash?: string;
      chunkId?: string;
      pageNumber?: number;
      headingPath?: string;
    }>;
  }>;
  terminology: string[];
  constraints: string[];
  limitations: string[];
}

export interface EvidenceExtractionPort {
  retryOwner?: 'port' | 'caller';
  extract(input: {
    summary: string;
    topic: string;
    language: LanguageCode;
    documentId: string;
    documentName: string;
    sourceVersionHash: string;
    maxInputTokens: number;
    maxOutputTokens: number;
  }): Promise<EvidenceExtractionResponse>;
}

export interface StructuredEvidenceCheckpoint {
  documentId: string;
  sourceVersionHash: string;
  schemaVersion: string;
  modelId: string;
  units: ValidatedEvidenceUnit[];
  reductions: Array<{
    batchKey: string;
    inputHash: string;
    level: number;
    index: number;
    value: ValidatedSummaryReduction;
  }>;
}

export interface EvidenceCheckpointEvent {
  batchKey: string;
  inputHash: string;
  structuredCheckpoint: StructuredEvidenceCheckpoint;
  cursor: { documentId: string; processedUnitIds: string[]; sequence: number };
  usageDelta: EvidenceGenerationMetrics;
}

export interface GenerateEvidenceCardInput {
  source: DocumentEvidencePreflightSource;
  allocatedTokens: number;
  processingMode: DocumentEvidenceCard['processing_mode'];
  reusableSummary?: string;
  topic?: string;
  language?: LanguageCode;
  maxBatchTokens?: number;
  maxRetries?: number;
  structuredPort?: StructuredEvidencePort;
  extractor?: EvidenceExtractionPort;
  initialCheckpoint?: StructuredEvidenceCheckpoint;
  onCheckpoint?: (event: EvidenceCheckpointEvent) => Promise<void>;
  modelId?: string;
}

export interface GeneratedEvidenceCard {
  card: DocumentEvidenceCard;
  metrics: EvidenceGenerationMetrics;
  structuredCheckpoint?: StructuredEvidenceCheckpoint;
}

export class EvidenceExtractionScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceExtractionScopeError';
  }
}

export class EvidenceCheckpointError extends Error {
  constructor(cause: unknown) {
    super(`Evidence checkpoint failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'EvidenceCheckpointError';
  }
}

export const emptyGenerationMetrics = (): EvidenceGenerationMetrics => ({
  modelCalls: 0,
  retryCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalCostUsd: 0,
  mapChunks: 0,
  reduceLevels: 0,
});
