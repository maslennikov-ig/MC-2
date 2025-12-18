/**
 * Embeddings module
 *
 * This module provides clients and utilities for generating text embeddings,
 * document processing, markdown conversion, and image extraction.
 *
 * @module shared/embeddings
 */

// Jina embeddings client
export {
  generateEmbedding,
  generateEmbeddings,
  healthCheck,
  JinaEmbeddingError,
  type JinaEmbeddingRequest,
  type JinaEmbeddingResponse,
  type JinaErrorResponse,
} from './jina-client';

// Markdown conversion pipeline
export {
  convertDocumentToMarkdown,
  convertDoclingDocumentToMarkdown,
  MarkdownConversionError,
  type ConversionResult,
  type ImageMetadata,
  type DocumentStructure,
  type DocumentSection,
  type ConversionMetadata,
  type MarkdownConversionOptions,
} from './markdown-converter';

// Document structure extraction
export {
  extractSectionBoundaries,
  findSectionAtOffset,
  getMostSpecificSection,
  extractSectionContent,
  enrichChunkWithContext,
  splitBySections,
  calculateSectionStatistics,
  buildTableOfContents,
  validateSectionBoundaries,
  type SectionBoundary,
  type ChunkMetadata,
} from './structure-extractor';

// Image processing
export {
  processImages,
  extractImageReferences,
  linkImagesToSections,
  generateImageSummary,
  filterImagesByQuality,
  createImageIndex,
  type ImageProcessingOptions,
  type ProcessedImage,
  type ImageProcessingResult,
} from './image-processor';

// Hierarchical chunking (T075)
export {
  chunkMarkdown,
  getAllChunks,
  getChildrenForParent,
  getParentForChild,
  DEFAULT_CHUNKING_CONFIG,
  type TextChunk,
  type ChunkLevel,
  type ChunkingConfig,
  type ChunkingResult,
} from './markdown-chunker';

// Metadata enrichment (T075)
export {
  enrichChunk,
  enrichChunks,
  toQdrantPayload,
  filterChunks,
  type EnrichedChunk,
  type ImageReference,
  type TableReference,
  type EnrichmentOptions,
} from './metadata-enricher';

// Embedding generation with late chunking (T075)
export {
  generateEmbeddingsWithLateChunking,
  generateQueryEmbedding,
  separateChunksByLevel,
  type EmbeddingResult,
  type BatchEmbeddingResult,
} from './generate';
