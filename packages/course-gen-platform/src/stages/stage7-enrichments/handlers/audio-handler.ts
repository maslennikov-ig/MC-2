/**
 * Audio Enrichment Handler
 * @module stages/stage7-enrichments/handlers/audio-handler
 *
 * Single-stage handler for audio narration generation using OpenAI TTS API.
 * Preprocesses lesson content using audio-prompt.ts functions,
 * generates audio via OpenAI TTS, and uploads to Supabase Storage.
 *
 * Unlike presentation/video which have two-stage flows (draft → final),
 * audio generation is direct: lesson content → audio file.
 *
 * Uses OpenAI TTS API directly (NOT OpenRouter).
 */

import { logger } from '@/shared/logger';
import OpenAI from 'openai';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type {
  EnrichmentHandlerInput,
  GenerateResult,
} from '../types';
import type { AudioEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import {
  prepareAudioScript,
  getDefaultVoice,
  validateTTSSettings,
  type TTSVoice,
  type TTSFormat,
} from '../prompts/audio-prompt';
import { AUDIO_CONFIG } from '../config';
import { uploadEnrichmentAsset } from '../services/storage-service';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * OpenAI TTS API pricing (as of 2025)
 * - tts-1: $15 per 1M characters (standard quality)
 * - tts-1-hd: $30 per 1M characters (high quality)
 */
const TTS_PRICING = {
  'tts-1': 15,
  'tts-1-hd': 30,
} as const;

/**
 * OpenAI client initialization
 * Uses OPENAI_API_KEY environment variable
 */
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    openaiClient = new OpenAI({
      apiKey,
    });
  }

  return openaiClient;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate OpenAI TTS cost in USD
 *
 * @param charCount - Number of characters in the script
 * @param model - TTS model used (tts-1 or tts-1-hd)
 * @returns Estimated cost in USD
 */
function calculateTTSCost(charCount: number, model: string = AUDIO_CONFIG.TTS_MODEL): number {
  const pricePerMillion = TTS_PRICING[model as keyof typeof TTS_PRICING] || TTS_PRICING['tts-1-hd'];
  return (charCount / 1_000_000) * pricePerMillion;
}

/**
 * Concatenate multiple audio buffers into a single buffer
 *
 * @param buffers - Array of audio buffers to concatenate
 * @returns Single concatenated buffer
 */
function concatenateAudioBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error('No audio buffers to concatenate');
  }

  if (buffers.length === 1) {
    return buffers[0];
  }

  // For MP3 files, simple concatenation works
  // For other formats, might need more sophisticated merging
  return Buffer.concat(buffers);
}

/**
 * Get MIME type for audio format
 *
 * @param format - Audio format (mp3, opus, aac, flac, wav)
 * @returns MIME type string
 */
function getMimeType(format: TTSFormat): string {
  const mimeTypes: Record<TTSFormat, string> = {
    mp3: 'audio/mpeg',
    opus: 'audio/opus',
    aac: 'audio/aac',
    flac: 'audio/flac',
    wav: 'audio/wav',
  };

  return mimeTypes[format] || 'audio/mpeg';
}

// ============================================================================
// SINGLE-STAGE GENERATION
// ============================================================================

/**
 * Generate audio narration directly from lesson
 *
 * This is a single-stage flow: lesson content → audio file.
 * No draft phase required - audio is generated and ready for playback.
 *
 * Steps:
 * 1. Preprocess lesson content using audio-prompt.ts
 * 2. Check if chunking needed (OpenAI TTS has 4096 char limit)
 * 3. Generate audio for each chunk via OpenAI TTS
 * 4. Concatenate audio buffers if multiple chunks
 * 5. Upload to Supabase Storage
 * 6. Return AudioEnrichmentContent with metadata
 *
 * @param input - Enrichment handler input with context and settings
 * @returns Generate result with audio content and metadata
 */
async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
      lessonTitle: enrichmentContext.lesson.title,
    },
    'Audio handler: generating audio narration'
  );

  try {
    // 1. Validate and extract settings
    const language = (enrichmentContext.course.language || 'en') as 'en' | 'ru';
    const rawVoice = (settings.voice as TTSVoice) || getDefaultVoice(language);
    const rawFormat = (settings.format as TTSFormat) || AUDIO_CONFIG.DEFAULT_FORMAT;
    const rawSpeed = (settings.speed as number) || 1.0;

    // Validate settings using audio-prompt utility
    const validatedSettings = validateTTSSettings({
      voice: rawVoice,
      format: rawFormat,
      speed: rawSpeed,
    });

    const { voice, format, speed } = validatedSettings;

    // 2. Preprocess lesson content using audio-prompt.ts
    const processedScript = prepareAudioScript({
      lessonTitle: enrichmentContext.lesson.title,
      lessonContent: enrichmentContext.lesson.content || '',
      language,
      settings: {
        voice,
        format,
        speed,
      },
    });

    logger.debug(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        charCount: processedScript.charCount,
        wordCount: processedScript.wordCount,
        estimatedDurationSeconds: processedScript.estimatedDurationSeconds,
        chunkCount: processedScript.chunks?.length || 1,
      },
      'Audio script preprocessed'
    );

    // 3. Check if chunking needed (OpenAI TTS has 4096 char limit)
    const chunks = processedScript.chunks || [processedScript.script];

    if (chunks.length > 10) {
      logger.warn(
        {
          enrichmentId: enrichmentContext.enrichment.id,
          chunkCount: chunks.length,
          charCount: processedScript.charCount,
        },
        'Audio script requires many chunks - this may take a while'
      );
    }

    // 4. Generate audio for each chunk via OpenAI TTS
    const openai = getOpenAIClient();
    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      logger.debug(
        {
          enrichmentId: enrichmentContext.enrichment.id,
          chunkIndex: i + 1,
          totalChunks: chunks.length,
          chunkLength: chunk.length,
        },
        'Generating audio for chunk'
      );

      try {
        const response = await openai.audio.speech.create({
          model: AUDIO_CONFIG.TTS_MODEL,
          voice: voice,
          input: chunk,
          response_format: format,
          speed: speed,
        });

        const buffer = Buffer.from(await response.arrayBuffer());
        audioBuffers.push(buffer);

        logger.debug(
          {
            enrichmentId: enrichmentContext.enrichment.id,
            chunkIndex: i + 1,
            bufferSize: buffer.length,
          },
          'Audio chunk generated'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          {
            enrichmentId: enrichmentContext.enrichment.id,
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            error: errorMessage,
          },
          'Failed to generate audio for chunk'
        );

        throw new Error(`OpenAI TTS API error (chunk ${i + 1}/${chunks.length}): ${errorMessage}`);
      }
    }

    // 5. Concatenate buffers if multiple chunks
    const finalBuffer = concatenateAudioBuffers(audioBuffers);

    logger.info(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        chunkCount: chunks.length,
        totalBufferSize: finalBuffer.length,
      },
      'Audio buffers concatenated'
    );

    // 6. Upload to Supabase Storage
    const assetPath = await uploadEnrichmentAsset(
      enrichmentContext.course.id,
      enrichmentContext.lesson.id,
      enrichmentContext.enrichment.id,
      finalBuffer,
      getMimeType(format),
      format
    );

    logger.info(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        assetPath,
        fileSize: finalBuffer.length,
      },
      'Audio file uploaded to Supabase Storage'
    );

    // 7. Build content
    const content: AudioEnrichmentContent = {
      type: 'audio',
      voice_id: voice,
      script: processedScript.script,
      duration_seconds: processedScript.estimatedDurationSeconds,
      format: format,
    };

    // 8. Calculate metrics
    const durationMs = Date.now() - startTime;
    const estimatedCost = calculateTTSCost(processedScript.charCount, AUDIO_CONFIG.TTS_MODEL);

    // 9. Build metadata
    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: durationMs,
      estimated_cost_usd: estimatedCost,
      model_used: AUDIO_CONFIG.TTS_MODEL,
      quality_score: 1.0, // Default - TTS doesn't have quality scoring
      retry_attempts: 0,
      additional_info: {
        word_count: processedScript.wordCount,
        char_count: processedScript.charCount,
        chunk_count: chunks.length,
        voice: voice,
        speed: speed,
        format: format,
        language: language,
        estimated_duration_seconds: processedScript.estimatedDurationSeconds,
        file_size_bytes: finalBuffer.length,
        storage_path: assetPath,
      },
    };

    logger.info(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        durationMs,
        estimatedCostUsd: estimatedCost,
        durationSeconds: processedScript.estimatedDurationSeconds,
      },
      'Audio handler: audio narration generated successfully'
    );

    return {
      content,
      metadata,
      assetBuffer: finalBuffer,
      assetMimeType: getMimeType(format),
      assetExtension: format,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        lessonId: enrichmentContext.lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Audio handler: audio narration generation failed'
    );

    throw new Error(`Audio generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// HANDLER EXPORT
// ============================================================================

/**
 * Audio enrichment handler implementing single-stage flow
 *
 * Generates audio narration directly from lesson content using OpenAI TTS.
 * No draft phase - audio is ready for immediate playback after generation.
 *
 * The handler preprocesses markdown content to TTS-friendly text,
 * handles chunking for long content (>4096 chars), and uploads
 * the generated audio to Supabase Storage.
 */
export const audioHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
  // No generateDraft or generateFinal for single-stage
};
