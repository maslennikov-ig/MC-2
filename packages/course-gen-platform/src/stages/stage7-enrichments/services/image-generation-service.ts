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

/** Default model for cover images (16:9) - Gemini supports aspect ratio control */
const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image-preview';

/** Model for card images (1:1) - GPT-5 Mini always generates square 1024x1024 */
export const CARD_IMAGE_MODEL = 'openai/gpt-5-image-mini';

/** Cost per image by model (USD) */
const MODEL_COSTS: Record<string, number> = {
  'google/gemini-2.5-flash-image-preview': 0.038,
  'openai/gpt-5-image-mini': 0.007,
  'openai/gpt-5-image': 0.04,
};

/** Default cost if model not in lookup */
const DEFAULT_COST_USD = 0.04;

const DEFAULT_ASPECT_RATIO = '16:9';
const DEFAULT_IMAGE_SIZE = '1K'; // 1344x768 for 16:9 - optimal for web covers
const API_TIMEOUT_MS = 60000; // 1 minute for image generation

/**
 * Negative prompt to avoid unwanted artifacts in generated images.
 * Gemini renders text well, so we only exclude watermarks/logos.
 */
const DEFAULT_NEGATIVE_PROMPT = 'Do not include any watermarks, logos, or signatures.';

/**
 * Check if model supports image_config parameters (aspect_ratio, image_size)
 * Only Gemini models support these through OpenRouter
 */
function supportsImageConfig(model: string): boolean {
  return model.startsWith('google/');
}

/**
 * Get actual pixel dimensions based on model and settings
 *
 * Gemini supports: 1K, 2K, 4K with various aspect ratios
 * GPT-5 Mini: Always 1024x1024 (square only)
 *
 * 16:9 dimensions: 1K=1344x768, 2K=2688x1536, 4K=5765x3072
 * 1:1 dimensions: 1K=1024x1024, 2K=2048x2048, 4K=4096x4096
 */
function getImageDimensions(
  model: string,
  imageSize: '1K' | '2K' | '4K',
  aspectRatio: string
): { width: number; height: number } {
  // GPT-5 Mini always generates 1024x1024 square images
  if (model.includes('gpt-5-image-mini')) {
    return { width: 1024, height: 1024 };
  }

  // For 16:9 aspect ratio (most common for covers)
  if (aspectRatio === '16:9') {
    if (imageSize === '4K') return { width: 5765, height: 3072 };
    if (imageSize === '2K') return { width: 2688, height: 1536 };
    return { width: 1344, height: 768 }; // 1K default
  }
  // For 1:1 aspect ratio
  if (aspectRatio === '1:1') {
    if (imageSize === '4K') return { width: 4096, height: 4096 };
    if (imageSize === '2K') return { width: 2048, height: 2048 };
    return { width: 1024, height: 1024 }; // 1K default
  }
  // Default fallback to 16:9
  if (imageSize === '4K') return { width: 5765, height: 3072 };
  if (imageSize === '2K') return { width: 2688, height: 1536 };
  return { width: 1344, height: 768 };
}

// ============================================================================
// TYPES
// ============================================================================

export interface ImageGenerationOptions {
  /** Model to use (default: google/gemini-2.5-flash-image-preview) */
  model?: string;
  /** Aspect ratio for image generation (default: '16:9') */
  aspectRatio?: string;
  /** Image size/resolution: '1K', '2K' or '4K' (default: '1K') */
  imageSize?: '1K' | '2K' | '4K';
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
  // Gemini works best with natural language instructions
  const fullPrompt = skipNegativePrompt
    ? prompt
    : `${prompt}\n\n${negativePrompt}`;

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

    // Build request options - only include image_config for models that support it
    // GPT models ignore image_config and always generate 1024x1024
    const requestOptions: Record<string, unknown> = {
      model,
      messages: [
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      modalities: ['text', 'image'],
    };

    // Only add image_config for Gemini models (OpenRouter limitation)
    if (supportsImageConfig(model)) {
      requestOptions.image_config = {
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      };
    }

    // @ts-expect-error - OpenRouter extensions not in OpenAI types
    const response = await client.chat.completions.create(requestOptions, {
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

    // Get actual dimensions based on model and settings
    const actualDimensions = getImageDimensions(model, imageSize, aspectRatio);

    // Get model-specific cost
    const costUsd = MODEL_COSTS[model] ?? DEFAULT_COST_USD;

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
        costUsd,
      },
      'Image generation completed'
    );

    return {
      base64Data,
      mimeType,
      width: actualDimensions.width,
      height: actualDimensions.height,
      costUsd,
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
 * Generate a card image (1:1 square) using GPT-5 Image Mini
 *
 * Convenience wrapper for card generation with optimal settings.
 * GPT-5 Mini is cost-effective ($0.007) and always generates 1024x1024 squares.
 *
 * @param prompt - Card image prompt
 * @returns Generated card image data
 */
export async function generateCardImage(prompt: string): Promise<ImageGenerationResult> {
  return generateImage(prompt, {
    model: CARD_IMAGE_MODEL,
    aspectRatio: '1:1',
    imageSize: '1K',
  });
}

/**
 * Generate a cover image (16:9) using Gemini
 *
 * Convenience wrapper for cover generation with optimal settings.
 * Gemini produces high-quality 16:9 covers at 1344x768.
 *
 * @param prompt - Cover image prompt
 * @returns Generated cover image data
 */
export async function generateCoverImage(prompt: string): Promise<ImageGenerationResult> {
  return generateImage(prompt, {
    model: DEFAULT_IMAGE_MODEL,
    aspectRatio: '16:9',
    imageSize: '1K',
  });
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
