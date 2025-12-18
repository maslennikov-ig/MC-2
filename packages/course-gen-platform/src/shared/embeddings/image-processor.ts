/**
 * Image Processor
 *
 * Handles image extraction, OCR text processing, and image metadata management.
 * Supports both basic image extraction (FREE) and premium semantic descriptions.
 *
 * Basic Features (T074.3):
 * - Extract images from DoclingDocument
 * - Process OCR text from images (Docling built-in)
 * - Generate image references for chunks
 * - Link images to document sections
 *
 * Premium Features (T074.5 - deferred):
 * - Generate semantic image descriptions using Vision API
 * - Advanced image classification
 * - Image-to-text retrieval enhancement
 *
 * @module shared/embeddings/image-processor
 */

import { DoclingPicture, DoclingDocument } from '../../stages/stage2-document-processing/docling/types.js';
import { ImageMetadata } from './markdown-converter.js';
import { logger } from '../logger/index.js';

/**
 * Image processing options
 */
export interface ImageProcessingOptions {
  /** Extract image data (base64) - can be large (default: false) */
  extract_data?: boolean;

  /** Include OCR text from images (default: true) */
  include_ocr?: boolean;

  /** Minimum OCR text length to include (default: 10) */
  min_ocr_length?: number;

  /** Maximum image data size in bytes (default: 5MB) */
  max_data_size?: number;

  /** Generate semantic descriptions (PREMIUM - deferred to T074.5) */
  generate_descriptions?: boolean;
}

/**
 * Default image processing options
 */
const DEFAULT_OPTIONS: Required<ImageProcessingOptions> = {
  extract_data: false,
  include_ocr: true,
  min_ocr_length: 10,
  max_data_size: 5 * 1024 * 1024, // 5MB
  generate_descriptions: false,
};

/**
 * Enhanced image metadata with processing results
 */
export interface ProcessedImage extends ImageMetadata {
  /** Processing status */
  status: 'success' | 'skipped' | 'error';

  /** Processing error message (if status is error) */
  error?: string;

  /** Image data size in bytes (if extracted) */
  data_size?: number;

  /** OCR confidence score (0-1) if available */
  ocr_confidence?: number;

  /** Semantic description (PREMIUM feature) */
  description?: string;

  /** Image keywords/tags (PREMIUM feature) */
  tags?: string[];
}

/**
 * Image processing result
 */
export interface ImageProcessingResult {
  /** Successfully processed images */
  images: ProcessedImage[];

  /** Total images processed */
  total: number;

  /** Images with OCR text */
  with_ocr: number;

  /** Images with descriptions (PREMIUM) */
  with_descriptions: number;

  /** Images skipped due to size limits */
  skipped: number;

  /** Processing errors */
  errors: number;

  /** Processing metadata */
  metadata: {
    processing_time_ms: number;
    timestamp: string;
  };
}

/**
 * Process images from a DoclingDocument
 *
 * Extracts and enriches image metadata, including OCR text processing
 * and optional semantic descriptions (PREMIUM).
 *
 * NOTE: This function is currently synchronous but returns a Promise for future async features.
 * When premium features (T074.5) are implemented, this will become truly async.
 *
 * @param document - DoclingDocument with images
 * @param options - Processing options
 * @returns Image processing result
 */
export function processImages(
  document: DoclingDocument,
  options?: ImageProcessingOptions
): ImageProcessingResult {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info({
    total_images: document.pictures.length,
    options: opts,
  }, 'Processing document images');

  const images: ProcessedImage[] = [];
  let with_ocr = 0;
  let with_descriptions = 0;
  let skipped = 0;
  let errors = 0;

  for (const picture of document.pictures) {
    try {
      const processed = processSingleImage(picture, opts);
      images.push(processed);

      if (processed.status === 'skipped') {
        skipped++;
      } else if (processed.status === 'error') {
        errors++;
      } else {
        if (processed.ocr_text) {
          with_ocr++;
        }
        if (processed.description) {
          with_descriptions++;
        }
      }
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error), image_id: picture.id }, 'Failed to process image');
      errors++;
      images.push({
        id: picture.id,
        page_no: picture.page_no,
        bbox: picture.bbox,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const processingTime = Date.now() - startTime;

  logger.info({
    total: document.pictures.length,
    processed: images.length,
    with_ocr,
    with_descriptions,
    skipped,
    errors,
    processing_time_ms: processingTime,
  }, 'Image processing completed');

  return {
    images,
    total: document.pictures.length,
    with_ocr,
    with_descriptions,
    skipped,
    errors,
    metadata: {
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Process a single image
 *
 * Note: This function is currently synchronous. It may become async in the future
 * when premium features (T074.5) requiring Vision API calls are implemented.
 */
function processSingleImage(
  picture: DoclingPicture,
  options: Required<ImageProcessingOptions>
): ProcessedImage {
  const image: ProcessedImage = {
    id: picture.id,
    page_no: picture.page_no,
    bbox: picture.bbox,
    caption: picture.caption,
    format: picture.format,
    status: 'success',
  };

  // Process OCR text
  if (options.include_ocr && picture.ocr_text) {
    const ocr_text = picture.ocr_text.trim();
    if (ocr_text.length >= options.min_ocr_length) {
      image.ocr_text = ocr_text;
      // Note: Docling doesn't provide OCR confidence by default
      // Could be added with custom OCR implementation
    }
  }

  // Extract image data if requested
  if (options.extract_data && picture.data) {
    const data_size = estimateBase64Size(picture.data);

    if (data_size <= options.max_data_size) {
      image.data = picture.data;
      image.data_size = data_size;
    } else {
      logger.warn({
        image_id: picture.id,
        size: data_size,
        limit: options.max_data_size,
      }, 'Image data exceeds size limit');
      image.status = 'skipped';
      image.error = `Image data too large: ${formatBytes(data_size)} > ${formatBytes(options.max_data_size)}`;
    }
  }

  // Generate semantic description (PREMIUM feature - deferred to T074.5)
  if (options.generate_descriptions) {
    logger.warn({
      image_id: picture.id,
    }, 'Semantic image descriptions are a PREMIUM feature (T074.5)');
    // Placeholder for future implementation
    // image.description = await generateImageDescription(picture);
    // image.tags = await generateImageTags(picture);
  }

  return image;
}

/**
 * Extract image references from markdown text
 *
 * Parses markdown to find all image references and their positions.
 *
 * @param markdown - Markdown text
 * @returns Array of image references with offsets
 */
export function extractImageReferences(markdown: string): Array<{
  alt: string;
  url: string;
  offset: number;
  length: number;
}> {
  const references: Array<{
    alt: string;
    url: string;
    offset: number;
    length: number;
  }> = [];

  // Match markdown image syntax: ![alt text](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    references.push({
      alt: match[1],
      url: match[2],
      offset: match.index,
      length: match[0].length,
    });
  }

  return references;
}

/**
 * Link images to sections based on their page numbers
 *
 * Associates images with document sections for contextual retrieval.
 *
 * @param images - Processed images
 * @param sections - Document sections with page numbers
 * @returns Map of section headings to images
 */
export function linkImagesToSections(
  images: ProcessedImage[],
  sections: Array<{ heading: string; page_no: number }>
): Map<string, ProcessedImage[]> {
  const sectionImages = new Map<string, ProcessedImage[]>();

  for (const image of images) {
    // Find the section that contains this image's page
    const section = sections.find(s => s.page_no === image.page_no);

    if (section) {
      const existing = sectionImages.get(section.heading) || [];
      existing.push(image);
      sectionImages.set(section.heading, existing);
    }
  }

  return sectionImages;
}

/**
 * Generate image summaries for chunks
 *
 * Creates concise summaries of images within a text chunk,
 * useful for embedding metadata enrichment.
 *
 * @param images - Images in the chunk
 * @returns Summary text
 */
export function generateImageSummary(images: ProcessedImage[]): string {
  if (images.length === 0) {
    return '';
  }

  const parts: string[] = [];

  parts.push(`[${images.length} image(s) in this section]`);

  for (const image of images) {
    const details: string[] = [];

    if (image.caption) {
      details.push(`Caption: "${image.caption}"`);
    }

    if (image.ocr_text && image.ocr_text.trim()) {
      const preview = image.ocr_text.substring(0, 100);
      details.push(`OCR: "${preview}${image.ocr_text.length > 100 ? '...' : ''}"`);
    }

    if (image.description) {
      details.push(`Description: "${image.description}"`);
    }

    if (details.length > 0) {
      parts.push(`- ${details.join(', ')}`);
    }
  }

  return parts.join('\n');
}

/**
 * Filter images by quality criteria
 *
 * Filters out low-quality images based on size, OCR confidence, etc.
 *
 * @param images - Images to filter
 * @param criteria - Filter criteria
 * @returns Filtered images
 */
export function filterImagesByQuality(
  images: ProcessedImage[],
  criteria: {
    min_ocr_length?: number;
    min_ocr_confidence?: number;
    require_caption?: boolean;
    max_size?: number;
  }
): ProcessedImage[] {
  return images.filter(image => {
    // Skip error/skipped images
    if (image.status !== 'success') {
      return false;
    }

    // Check OCR length
    if (criteria.min_ocr_length && (!image.ocr_text || image.ocr_text.length < criteria.min_ocr_length)) {
      return false;
    }

    // Check OCR confidence
    if (criteria.min_ocr_confidence && (!image.ocr_confidence || image.ocr_confidence < criteria.min_ocr_confidence)) {
      return false;
    }

    // Check caption requirement
    if (criteria.require_caption && !image.caption) {
      return false;
    }

    // Check size
    if (criteria.max_size && image.data_size && image.data_size > criteria.max_size) {
      return false;
    }

    return true;
  });
}

/**
 * Create image index for fast lookup
 *
 * Builds an index for efficient image retrieval by various keys.
 *
 * @param images - Images to index
 * @returns Image index
 */
export function createImageIndex(images: ProcessedImage[]): {
  by_id: Map<string, ProcessedImage>;
  by_page: Map<number, ProcessedImage[]>;
  with_ocr: ProcessedImage[];
  with_descriptions: ProcessedImage[];
} {
  const by_id = new Map<string, ProcessedImage>();
  const by_page = new Map<number, ProcessedImage[]>();
  const with_ocr: ProcessedImage[] = [];
  const with_descriptions: ProcessedImage[] = [];

  for (const image of images) {
    // Index by ID
    by_id.set(image.id, image);

    // Index by page
    const pageImages = by_page.get(image.page_no) || [];
    pageImages.push(image);
    by_page.set(image.page_no, pageImages);

    // Index by features
    if (image.ocr_text) {
      with_ocr.push(image);
    }
    if (image.description) {
      with_descriptions.push(image);
    }
  }

  return {
    by_id,
    by_page,
    with_ocr,
    with_descriptions,
  };
}

/**
 * Estimate the size of base64 encoded data
 */
function estimateBase64Size(base64: string): number {
  // Base64 encoding increases size by ~33%
  // Remove data URL prefix if present
  const data = base64.replace(/^data:image\/[^;]+;base64,/, '');
  return Math.ceil((data.length * 3) / 4);
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
}

// NOTE: Premium image processing features (semantic descriptions, tagging) are
// deferred to T074.5. These features will use Vision API (Jina/OpenRouter/GPT-4o)
// for generating semantic image descriptions and keyword tags.
// Implementation will be added in future when PREMIUM tier features are developed.
