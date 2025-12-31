/**
 * Image Generation Service
 * @module stages/stage7-enrichments/services/image-generation-service
 *
 * OpenRouter image generation using chat completions API with
 * modalities: ["text", "image"] for image-capable models.
 */

import OpenAI from 'openai';
import { logger } from '@/shared/logger';
import { getApiKey } from '@/shared/services/api-key-service';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_IMAGE_MODEL = 'bytedance-seed/seedream-4.5';
const COST_PER_IMAGE_USD = 0.04;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const API_TIMEOUT_MS = 60000; // 1 minute for image generation

// ============================================================================
// TYPES
// ============================================================================

export interface ImageGenerationOptions {
  /** Model to use (default: bytedance-seed/seedream-4.5) */
  model?: string;
  /** Image width (default: 1280) */
  width?: number;
  /** Image height (default: 720) */
  height?: number;
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
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;

  logger.info({ model, promptLength: prompt.length }, 'Starting image generation');

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
          content: prompt,
        },
      ],
      // @ts-expect-error - OpenRouter extension not in OpenAI types
      modalities: ['text', 'image'],
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
    const images = (message as any)?.images as string[] | undefined;

    if (!images || images.length === 0) {
      throw new Error('No image generated in response');
    }

    const imageDataUrl = images[0];

    // Parse data URL: data:image/png;base64,{base64_data}
    const dataUrlMatch = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);

    if (!dataUrlMatch) {
      throw new Error('Invalid image data URL format');
    }

    const mimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];

    logger.info(
      {
        model,
        durationMs,
        mimeType,
        base64Length: base64Data.length,
      },
      'Image generation completed'
    );

    return {
      base64Data,
      mimeType,
      width,
      height,
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
