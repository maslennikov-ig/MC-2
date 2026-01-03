/**
 * Image Generation Service
 * @module stages/stage7-enrichments/services/image-generation-service
 *
 * OpenRouter image generation using chat completions API with
 * modalities: ["text", "image"] for image-capable models.
 */

import OpenAI from 'openai';
import sharp from 'sharp';
import { logger } from '@/shared/logger';
import { getApiKey } from '@/shared/services/api-key-service';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_IMAGE_MODEL = 'bytedance-seed/seedream-4.5';
const COST_PER_IMAGE_USD = 0.04;
const DEFAULT_ASPECT_RATIO = '16:9';
const DEFAULT_IMAGE_SIZE = '4K'; // Seedream 4.5 supports 4K at same cost
const API_TIMEOUT_MS = 60000; // 1 minute for image generation

/**
 * Negative prompt to avoid text, watermarks, and artifacts in generated images.
 * Used to strengthen "no text" instructions.
 */
const DEFAULT_NEGATIVE_PROMPT = 'text, letters, words, numbers, typography, watermark, logo, signature, title, label, caption, subtitle, handwriting, characters, alphabet, digits, inscriptions, writings, printed text, written text, fonts, typeface';

/**
 * Get actual pixel dimensions from image size preset
 * Seedream 4.5 supports: 2K (2048x1152 for 16:9) and 4K (3840x2160 for 16:9)
 */
function getImageDimensions(imageSize: '2K' | '4K', aspectRatio: string): { width: number; height: number } {
  // For 16:9 aspect ratio (most common for covers)
  if (aspectRatio === '16:9') {
    return imageSize === '4K'
      ? { width: 3840, height: 2160 }
      : { width: 2048, height: 1152 };
  }
  // For other aspect ratios, use approximations
  if (aspectRatio === '1:1') {
    return imageSize === '4K'
      ? { width: 2160, height: 2160 }
      : { width: 1024, height: 1024 };
  }
  // Default fallback
  return imageSize === '4K'
    ? { width: 3840, height: 2160 }
    : { width: 2048, height: 1152 };
}

// ============================================================================
// TYPES
// ============================================================================

export interface ImageGenerationOptions {
  /** Model to use (default: bytedance-seed/seedream-4.5) */
  model?: string;
  /** Aspect ratio for image generation (default: '16:9') */
  aspectRatio?: string;
  /** Image size/resolution: '2K' or '4K' (default: '4K') */
  imageSize?: '2K' | '4K';
  /** Negative prompt to avoid unwanted elements (default: text-related terms) */
  negativePrompt?: string;
  /** Whether to skip negative prompt (default: false) */
  skipNegativePrompt?: boolean;
}

export interface ImageGenerationResult {
  /** Base64 encoded image data (without data URL prefix) */
  base64Data: string;
  /** MIME type (e.g., "image/png") */
  mimeType: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Cost in USD */
  costUsd: number;
  /** Model used */
  modelUsed: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate an image using OpenRouter's image generation API
 *
 * @param prompt - Image generation prompt
 * @param options - Generation options
 * @returns Generated image data
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult> {
  const model = options.model ?? DEFAULT_IMAGE_MODEL;
  const aspectRatio = options.aspectRatio ?? DEFAULT_ASPECT_RATIO;
  const imageSize = options.imageSize ?? DEFAULT_IMAGE_SIZE;
  const negativePrompt = options.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT;
  const skipNegativePrompt = options.skipNegativePrompt ?? false;

  // Append negative prompt to strengthen text avoidance
  const fullPrompt = skipNegativePrompt
    ? prompt
    : `${prompt}\n\nNegative: ${negativePrompt}`;

  logger.info({
    model,
    promptLength: prompt.length,
    aspectRatio,
    imageSize,
    hasNegativePrompt: !skipNegativePrompt,
  }, 'Starting image generation');

  const apiKey = await getApiKey('openrouter');

  if (!apiKey) {
    throw new Error('OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or configure in admin panel.');
  }

  const startTime = Date.now();

  // Create AbortController for graceful cancellation
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, API_TIMEOUT_MS);

  try {
    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'https://megacampus.ai',
        'X-Title': 'MegaCampus Course Generator',
      },
      timeout: API_TIMEOUT_MS,
    });

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      // @ts-expect-error - OpenRouter extensions not in OpenAI types
      modalities: ['text', 'image'],
      // OpenRouter image_config for aspect ratio and resolution control
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      },
    }, {
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;

    // Extract image from response
    // OpenRouter returns images as base64 data URLs in message.images array
    const message = response.choices[0]?.message;

    // Check for images array (OpenRouter format)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageAny = message as any;
    const images = messageAny?.images as unknown[] | undefined;

    // Log the actual response structure for debugging
    logger.info({
      hasImages: !!images,
      imagesLength: images?.length,
      imagesType: images ? typeof images[0] : 'none',
      firstImagePreview: images && images[0]
        ? (typeof images[0] === 'string'
            ? images[0].substring(0, 100)
            : JSON.stringify(images[0]).substring(0, 200))
        : 'none',
      messageContent: messageAny?.content?.substring?.(0, 100) || 'none',
    }, 'Image generation response structure');

    if (!images || images.length === 0) {
      throw new Error('No image generated in response');
    }

    const imageData = images[0];

    // Handle different response formats
    let imageDataUrl: string;

    if (typeof imageData === 'string') {
      imageDataUrl = imageData;
    } else if (imageData && typeof imageData === 'object') {
      // OpenRouter can return various formats:
      // 1. { type: "image_url", image_url: { url: "data:..." } } - chat completion format
      // 2. { url: string } - direct URL
      // 3. { b64_json: string } - base64 without data URL prefix
      // 4. { data: string } - data URL
      const imgObj = imageData as {
        type?: string;
        image_url?: { url?: string };
        url?: string;
        b64_json?: string;
        data?: string;
      };

      if (imgObj.type === 'image_url' && imgObj.image_url?.url) {
        // Chat completion format: { type: "image_url", image_url: { url: "data:..." } }
        imageDataUrl = imgObj.image_url.url;
      } else if (imgObj.url?.startsWith('data:')) {
        // Direct data URL
        imageDataUrl = imgObj.url;
      } else if (imgObj.url) {
        // External URL - not supported yet
        throw new Error(`External image URL not supported yet: ${imgObj.url}`);
      } else if (imgObj.b64_json) {
        imageDataUrl = `data:image/png;base64,${imgObj.b64_json}`;
      } else if (imgObj.data) {
        imageDataUrl = imgObj.data;
      } else {
        throw new Error(`Unknown image object format: ${JSON.stringify(imgObj).substring(0, 200)}`);
      }
    } else {
      throw new Error(`Unexpected image data type: ${typeof imageData}`);
    }

    // Parse data URL: data:image/png;base64,{base64_data}
    const dataUrlMatch = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);

    if (!dataUrlMatch) {
      throw new Error('Invalid image data URL format');
    }

    const mimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];

    // Get actual dimensions based on image_size preset
    const actualDimensions = getImageDimensions(imageSize, aspectRatio);

    logger.info(
      {
        model,
        durationMs,
        mimeType,
        base64Length: base64Data.length,
        aspectRatio,
        imageSize,
        actualWidth: actualDimensions.width,
        actualHeight: actualDimensions.height,
      },
      'Image generation completed'
    );

    return {
      base64Data,
      mimeType,
      width: actualDimensions.width,
      height: actualDimensions.height,
      costUsd: COST_PER_IMAGE_USD,
      modelUsed: model,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    // Check if it was a timeout/abort
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error(
        { model, durationMs },
        'Image generation timed out'
      );
      throw new Error(`Image generation timed out after ${API_TIMEOUT_MS / 1000} seconds`);
    }

    logger.error(
      {
        model,
        durationMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Image generation failed'
    );

    throw error;
  }
}

/**
 * Convert base64 image data to Buffer for upload
 */
export function base64ToBuffer(base64Data: string): Buffer {
  return Buffer.from(base64Data, 'base64');
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return extensions[mimeType] ?? 'png';
}

// ============================================================================
// WEBP CONVERSION
// ============================================================================

export interface WebPConversionResult {
  /** Converted image buffer in WebP format */
  buffer: Buffer;
  /** MIME type (always "image/webp") */
  mimeType: 'image/webp';
  /** File size in bytes */
  sizeBytes: number;
  /** Original size before conversion */
  originalSizeBytes: number;
  /** Compression ratio (0.0 - 1.0, lower is better) */
  compressionRatio: number;
}

/**
 * Convert image buffer to WebP format for smaller file sizes
 *
 * @param imageBuffer - Original image buffer (PNG/JPEG)
 * @param quality - WebP quality (1-100, default 85)
 * @returns Converted WebP buffer with metadata
 */
export async function convertToWebP(
  imageBuffer: Buffer,
  quality: number = 85
): Promise<WebPConversionResult> {
  const originalSizeBytes = imageBuffer.length;

  logger.info(
    { originalSizeBytes, quality },
    'Starting WebP conversion'
  );

  const webpBuffer = await sharp(imageBuffer)
    .webp({ quality, effort: 6 })
    .toBuffer();

  const sizeBytes = webpBuffer.length;
  const compressionRatio = sizeBytes / originalSizeBytes;

  logger.info(
    {
      originalSizeBytes,
      sizeBytes,
      compressionRatio: compressionRatio.toFixed(2),
      savedBytes: originalSizeBytes - sizeBytes,
    },
    'WebP conversion completed'
  );

  return {
    buffer: webpBuffer,
    mimeType: 'image/webp',
    sizeBytes,
    originalSizeBytes,
    compressionRatio,
  };
}
