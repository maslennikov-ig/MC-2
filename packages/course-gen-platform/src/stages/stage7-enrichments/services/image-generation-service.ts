/**
 * Image Generation Service
 * @module stages/stage7-enrichments/services/image-generation-service
 *
 * OpenRouter image generation using chat completions API with
 * modalities: ["text", "image"] for image-capable models.
 */

import sharp from 'sharp';
import { logger } from '@/shared/logger';
import {
  createOpenRouterClient,
  createOpenRouterImage,
  type OpenRouterImageResponse,
} from '@/shared/llm/openrouter-client';
import { withGenerationIdCapture, type GenerationIdSlot } from '@/shared/llm/generation-id-capture';
import {
  calculateImageCostUsd,
  recordImageCallCost,
  type LlmCostContext,
} from '@/shared/metrics/llm-cost';
import { createModelConfigService } from '@/shared/llm/model-config-service';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Fallbacks for the two image phases, used when the database cannot be read.
 *
 * These were the only source of truth until 2026-08-22. `llm_model_config` has
 * carried active `stage_7_card` and `stage_7_cover` rows all along, the admin
 * screen showed them as editable, and nothing read them — editing there changed
 * nothing at all. The gap was invisible because the rows happened to name the
 * same models as these constants, and a configuration that agrees with the code
 * by coincidence is a defect waiting for the day somebody changes one of them
 * (mc2-bnm62).
 *
 * They stay as a floor rather than being deleted: a database that will not
 * answer must not stop a course from getting its cover.
 */
/**
 * The banner model, chosen 2026-08-27 by measuring every 16:9-capable model on
 * OpenRouter rather than by reputation.
 *
 * Billed, one prompt each: riverflow $0.013954, flux.2-klein-4b $0.015000,
 * gpt-image-2 $0.032775, seedream-5-0-lite $0.035000, the previous
 * gemini-2.5-flash-image $0.038725 — $0.019247 of that recoverable by pinning
 * flex, which is now done and still leaves it 38% dearer than this. The picture
 * is also the better one: asked for layered translucent planes with a node
 * cluster left of centre in blue and violet, it produced exactly that, text-free.
 */
const DEFAULT_IMAGE_MODEL = 'sourceful/riverflow-v2.5-fast';

/** Model for card images (1:1) - GPT-5 Mini always generates square 1024x1024 */
export const CARD_IMAGE_MODEL = 'openai/gpt-5-image-mini';

/**
 * The model an image phase is configured to use, or its built-in fallback.
 *
 * Same shape as `resolveFallbackModel` in the Stage 7 job processor, and for the
 * same reason: a phase config that cannot be read is a reason to carry on with
 * the built-in model, never a reason to fail the enrichment.
 *
 * Images have no fallback-model path of their own — `fallback_model_id` on these
 * rows is still read by nobody — so only the primary is honoured here, and the
 * row's second column remains a promise this code does not keep.
 */
async function resolveImageModel(
  phaseName: 'stage_7_card' | 'stage_7_cover',
  builtIn: string,
  courseId?: string
): Promise<string> {
  try {
    const config = await createModelConfigService().getModelForPhase(phaseName, courseId);
    if (config.modelId && config.modelId !== builtIn) {
      logger.info(
        { phaseName, courseId, configuredModel: config.modelId, builtIn },
        'Image phase is using the model configured in the database rather than the built-in one'
      );
    }
    return config.modelId || builtIn;
  } catch (error) {
    logger.warn(
      {
        phaseName,
        courseId,
        builtIn,
        error: error instanceof Error ? error.message : String(error),
      },
      'Could not read the configured image model; using the built-in one'
    );
    return builtIn;
  }
}

/**
 * How much detail a card is worth paying for.
 *
 * Measured 2026-08-22 on `openai/gpt-5-image-mini`, one prompt, 1024x1024,
 * billed by the provider rather than estimated:
 *
 * | quality | image tokens | charged   |
 * |---------|--------------|-----------|
 * | low     |          272 | $0.002341 |
 * | medium  |         1056 | $0.008613 |
 * | high    |         4160 | $0.033445 |
 *
 * `low` is not a cheaper picture, it is a worse one — it misspelled the word it
 * rendered. `high` is visibly richer than `medium` at four times the price, and
 * the difference does not survive being displayed as a card. So `medium`, and
 * the knob is here for whoever disagrees.
 */
const DEFAULT_CARD_QUALITY: ImageQuality = 'medium';

const DEFAULT_ASPECT_RATIO = '21:9';
const DEFAULT_IMAGE_SIZE = '1K'; // 1536x672 for 21:9 cinematic - optimal for web covers
const API_TIMEOUT_MS = 300_000; // 5 min — image models can be slow (queues, cold starts, large outputs)

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
 * Whether this model is driven through the dedicated Images API.
 *
 * The split is not a preference, it is what the two endpoints offer. Chat
 * completions takes `image_config` — `aspect_ratio` and `image_size`, Gemini
 * only — and has no way to ask for less detail. `POST /api/v1/images` takes
 * `quality`, and `GET /api/v1/images/models` lists it for every `openai/*` image
 * model and for none of the Google ones (read live 2026-08-22).
 *
 * OpenRouter also warns that the GPT-5 image models "generate images through an
 * LLM, so they don't provide access to the full set of supported parameters and
 * may incur extra inference cost" — and the bill agrees. The same card through
 * chat completions carried 3343-4472 prompt tokens and 5058-5723 completion
 * tokens; through this endpoint, 66 and 4160. The difference is a language model
 * we were paying to hold the picture.
 */
function usesImagesApi(model: string): boolean {
  // Images API unless the model is one chat completions can actually serve.
  //
  // This read `startsWith('openai/')` until 2026-08-27, which is the wrong
  // question and quietly made 37 of the 48 image models unreachable: anything
  // that was not OpenAI went to chat completions, and only 9 image models exist
  // there at all — six Google and three OpenAI. `sourceful/riverflow-v2.5-fast`
  // renders through `/images` perfectly well and would have failed as an unknown
  // chat model, which reads like the model being broken rather than the route.
  //
  // Google is the exception in the other direction. `/images` publishes no tiers
  // for it, chat completions publishes `google-ai-studio/flex` at half price,
  // and `image_config` is a chat-only extension. So Gemini earns its detour;
  // nothing else does.
  return !model.startsWith('google/');
}

/**
 * Whether asking this model for less detail is a thing it understands.
 *
 * Seven of the forty-eight publish `quality`, and they are the OpenAI image
 * models plus `x-ai/grok-imagine-image-2.0`. Sending it to the other
 * forty-one is a 400, so the tier cannot simply follow "went through the Images
 * API" the way it used to — that was true only while OpenAI was the only model
 * on that route.
 */
function supportsQuality(model: string): boolean {
  return model.startsWith('openai/') || model === 'x-ai/grok-imagine-image-2.0';
}

/**
 * Get actual pixel dimensions based on model and settings
 *
 * Gemini supports: 1K, 2K, 4K with various aspect ratios
 * GPT-5 Mini: Always 1024x1024 (square only)
 *
 * 21:9 dimensions: 1K=1536x672 (cinematic, used for covers)
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

  // For 21:9 aspect ratio (cinematic, used for covers)
  if (aspectRatio === '21:9') {
    // Gemini returns 1536x672 for 21:9 @ 1K
    return { width: 1536, height: 672 };
  }
  // For 16:9 aspect ratio
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
  // Default fallback to 21:9 (covers)
  return { width: 1536, height: 672 };
}

// ============================================================================
// TYPES
// ============================================================================

/** What the Images API accepts for `quality`. */
export type ImageQuality = 'auto' | 'low' | 'medium' | 'high';

export interface ImageGenerationOptions {
  /**
   * Where to charge the picture. Without it the image is generated and paid
   * for, and the course total never learns of it (mc2-acjgd).
   */
  costContext?: LlmCostContext;
  /** Model to use (default: google/gemini-2.5-flash-image) */
  model?: string;
  /** Aspect ratio for image generation (default: '21:9' cinematic) */
  aspectRatio?: string;
  /** Image size/resolution: '1K', '2K' or '4K' (default: '1K') */
  imageSize?: '1K' | '2K' | '4K';
  /**
   * How much detail to pay for. Only reaches models on the Images API; a Gemini
   * cover through chat completions has no such control and ignores it.
   */
  quality?: ImageQuality;
  /** Negative prompt to avoid unwanted elements (default: text-related terms) */
  negativePrompt?: string;
  /** Whether to skip negative prompt (default: false) */
  skipNegativePrompt?: boolean;
  /**
   * Pictures for the model to match, as `data:` URLs.
   *
   * Until now a course held its look together by describing it: `visual_style`
   * became four lines of prose — "blue and purple gradients with subtle
   * accents", "abstract geometric shapes, flowing lines" — and every card was
   * drawn from that description alone, never having seen its siblings. Two cards
   * from one course could satisfy every word of it and still look unrelated.
   *
   * A reference image is the same instruction in the medium the model actually
   * works in. Both endpoints take them, by different names: `input_references`
   * on the Images API, ordinary `image_url` content parts on chat completions.
   */
  referenceImages?: string[];
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
  /**
   * Estimated cost in USD, from `MODEL_CATALOG`'s image rate and the tokens the
   * response reported.
   *
   * `undefined` when neither is available — an absence, deliberately not a
   * number. The estimate that used to stand here came from a private price table
   * and read $0.007 against a real $0.045080 (mc2-5mhlb). The figure to trust is
   * the one `GET /api/v1/generation` writes onto the trace row via
   * {@link generationId} about ten seconds later.
   */
  costUsd?: number;
  /** Model used */
  modelUsed: string;
  /** Prompt tokens the response reported, when it reported any. */
  inputTokens?: number;
  /** Image output tokens the response reported, when it reported any. */
  outputTokens?: number;
  /**
   * OpenRouter's `x-generation-id` for this call.
   *
   * The key to what the picture actually cost. A caller that has no
   * `generation_trace` row to settle — the Career Playbook cover, which belongs
   * to no course — uses it to collect the receipt itself.
   */
  generationId?: string;
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
/**
 * Two endpoints, two shapes.
 *
 * `/images` answers with `data[0].b64_json`; chat completions puts base64 data URLs in
 * `message.images`. Both are funnelled into one array so the format handling below stays in one
 * place, and the log line reports the same fields whichever endpoint was used.
 */
interface OpenRouterMessage {
  images?: unknown[];
  content?: string | null;
}

function resolveResponseImages(
  response: unknown,
  viaImagesApi: boolean
): { images: unknown[] | undefined; messageWithImages: OpenRouterMessage | undefined } {
  if (viaImagesApi) {
    return { images: (response as OpenRouterImageResponse).data, messageWithImages: undefined };
  }

  const message = (response as { choices?: Array<{ message?: unknown }> }).choices?.[0]?.message;
  const messageWithImages = message as OpenRouterMessage | undefined;
  return { images: messageWithImages?.images, messageWithImages };
}

/**
 * Get a `data:` URL out of whatever OpenRouter returned for one image.
 *
 * Four shapes have been observed in production and all four are handled:
 *
 *   1. `{ type: "image_url", image_url: { url: "data:..." } }` — chat completion format
 *   2. `{ url: string }` — a direct URL, which is only usable when it is itself a data URL
 *   3. `{ b64_json: string }` — base64 with no data-URL prefix
 *   4. `{ data: string }` — already a data URL
 *
 * A plain string is taken as the URL. Anything else throws WITH the payload in the message,
 * because a fifth shape appearing is exactly the thing the next person needs to see.
 */
function extractImageDataUrl(imageData: unknown): string {
  if (typeof imageData === 'string') return imageData;

  if (!imageData || typeof imageData !== 'object') {
    throw new Error(`Unexpected image data type: ${typeof imageData}`);
  }

  const imgObj = imageData as {
    type?: string;
    image_url?: { url?: string };
    url?: string;
    b64_json?: string;
    data?: string;
  };

  if (imgObj.type === 'image_url' && imgObj.image_url?.url) return imgObj.image_url.url;
  if (imgObj.url?.startsWith('data:')) return imgObj.url;
  if (imgObj.url) throw new Error(`External image URL not supported yet: ${imgObj.url}`);
  if (imgObj.b64_json) return `data:image/png;base64,${imgObj.b64_json}`;
  if (imgObj.data) return imgObj.data;

  throw new Error(`Unknown image object format: ${JSON.stringify(imgObj).substring(0, 200)}`);
}

/** Split `data:image/png;base64,...` into its two halves, or say it was not one. */
function parseImageDataUrl(imageDataUrl: string): { mimeType: string; base64Data: string } {
  const dataUrlMatch = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!dataUrlMatch) {
    throw new Error('Invalid image data URL format');
  }
  return { mimeType: dataUrlMatch[1], base64Data: dataUrlMatch[2] };
}

/**
 * Ask for the cheaper endpoint when the model publishes one.
 *
 * `google/gemini-2.5-flash-image` serves the same picture from
 * `google-ai-studio/flex` at exactly half price, and **OpenRouter does not pick
 * it on its own**. Measured 2026-08-27 on one prompt, billed by the provider:
 * no pin $0.038553, flex pinned $0.019247, base pinned $0.038469. The route
 * makes no difference — the same call through the Images API billed $0.038807 —
 * so the flex pin is the entire saving (mc2-6qwia).
 *
 * `allow_fallbacks` stays **true** and the base tier is listed behind flex on
 * purpose. Flex refuses rather than queues when capacity is short, and this
 * repository has already paid for learning that a hard pin turns a busy tier
 * into a failed call rather than a dearer one. A banner that costs full price is
 * a worse outcome than one that costs half, and a much better one than no banner.
 *
 * Only Gemini publishes tiers here; every OpenAI image model has a single
 * endpoint, so for them this is correctly absent rather than merely unset.
 */
function preferredEndpoints(model: string): string[] {
  if (!model.startsWith('google/')) return [];
  return [
    'google-ai-studio/flex',
    'google-vertex/global/flex',
    'google-ai-studio',
    'google-vertex/global',
  ];
}

/** `image_config` is a Gemini-only extension; sending it to other models is an OpenRouter error. */
function buildChatImageRequest(
  model: string,
  fullPrompt: string,
  aspectRatio: string,
  imageSize: string,
  referenceImages: string[] = []
): Record<string, unknown> {
  // Chat completions has no `input_references`; a reference here is an ordinary
  // `image_url` content part, and the text part has to survive alongside it —
  // which is why `content` becomes an array only when there is something to add.
  const content =
    referenceImages.length > 0
      ? [
          { type: 'text', text: fullPrompt },
          ...referenceImages.map(url => ({ type: 'image_url', image_url: { url } })),
        ]
      : fullPrompt;

  const requestOptions: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content }],
    modalities: ['text', 'image'],
  };

  if (supportsImageConfig(model)) {
    requestOptions.image_config = { aspect_ratio: aspectRatio, image_size: imageSize };
  }

  const order = preferredEndpoints(model);
  if (order.length > 0) {
    requestOptions.provider = { order, allow_fallbacks: true };
  }

  return requestOptions;
}

export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult> {
  const model = options.model ?? DEFAULT_IMAGE_MODEL;
  const aspectRatio = options.aspectRatio ?? DEFAULT_ASPECT_RATIO;
  const imageSize = options.imageSize ?? DEFAULT_IMAGE_SIZE;
  const negativePrompt = options.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT;
  const skipNegativePrompt = options.skipNegativePrompt ?? false;
  const referenceImages = options.referenceImages ?? [];
  const viaImagesApi = usesImagesApi(model);
  const quality =
    viaImagesApi && supportsQuality(model) ? (options.quality ?? DEFAULT_CARD_QUALITY) : undefined;

  // Append negative prompt to strengthen text avoidance
  // Gemini works best with natural language instructions
  const fullPrompt = skipNegativePrompt ? prompt : `${prompt}\n\n${negativePrompt}`;

  logger.info(
    {
      model,
      promptLength: prompt.length,
      aspectRatio,
      imageSize,
      quality,
      endpoint: viaImagesApi ? 'images' : 'chat.completions',
      hasNegativePrompt: !skipNegativePrompt,
    },
    'Starting image generation'
  );

  const startTime = Date.now();

  // Create AbortController for graceful cancellation
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, API_TIMEOUT_MS);

  // Hoisted so the id survives the throw: the header arrives before the body,
  // so an attempt that goes on to fail still has one, and it is the only thing
  // that identifies what the provider charged for it.
  let slotRef: GenerationIdSlot | undefined;

  try {
    // The capture has to wrap the call, not the parsed result: the slot is
    // filled from the response headers via `AsyncLocalStorage`, so reading it
    // outside this scope reads nothing.
    const { response, generationId } = await withGenerationIdCapture(async slot => {
      slotRef = slot;
      // cost-exempt: an image is billed per image token, not per text token, so
      // this call prices itself with `recordImageCallCost` below rather than
      // through either LLM wrapper — and then replaces that estimate with the
      // provider's own figure.
      if (viaImagesApi) {
        const image = await createOpenRouterImage({
          model,
          prompt: fullPrompt,
          ...(quality ? { quality } : {}),
          ...(referenceImages.length > 0 ? { inputReferences: referenceImages } : {}),
          aspectRatio,
          signal: abortController.signal,
        });
        return { response: image, generationId: slot.generationId };
      }

      // The shared factory, not a local `new OpenAI`: it is what wraps the
      // transport so `x-generation-id` reaches `withGenerationIdCapture`.
      // Without it this call could never learn what it cost, and its price
      // stayed an invented constant for as long as the service existed
      // (mc2-l17v5).
      const client = await createOpenRouterClient({ timeoutMs: API_TIMEOUT_MS });
      const requestOptions = buildChatImageRequest(
        model,
        fullPrompt,
        aspectRatio,
        imageSize,
        referenceImages
      );
      // cost-exempt: an image is billed per image token, not per text token, so
      // this call prices itself with `recordImageCallCost` below rather than
      // through either LLM wrapper — and then replaces that estimate with the
      // provider's own figure.
      // @ts-expect-error - OpenRouter extensions not in OpenAI types
      const completion = await client.chat.completions.create(requestOptions, {
        signal: abortController.signal,
      });
      return { response: completion, generationId: slot.generationId };
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;
    const { images, messageWithImages } = resolveResponseImages(response, viaImagesApi);

    // Log the actual response structure for debugging
    logger.info(
      {
        hasImages: !!images,
        imagesLength: images?.length,
        imagesType: images ? typeof images[0] : 'none',
        firstImagePreview:
          images && images[0]
            ? typeof images[0] === 'string'
              ? images[0].substring(0, 100)
              : JSON.stringify(images[0]).substring(0, 200)
            : 'none',
        messageContent: messageWithImages?.content?.substring(0, 100) || 'none',
      },
      'Image generation response structure'
    );

    if (!images || images.length === 0) {
      throw new Error('No image generated in response');
    }

    const { mimeType, base64Data } = parseImageDataUrl(extractImageDataUrl(images[0]));

    // Get actual dimensions based on model and settings
    const actualDimensions = getImageDimensions(model, imageSize, aspectRatio);

    // The output tokens of an image call are image tokens; the catalogue prices
    // them at the model's `image_output` rate. This is a placeholder for the ten
    // seconds until the provider's own charge lands on the trace row.
    // Both endpoints report usage the same way; on `/images` the completion
    // tokens are the image tokens `quality` decides the number of.
    const reportedUsage = (
      response as { usage?: { prompt_tokens?: number; completion_tokens?: number } }
    ).usage;
    const usage = {
      model,
      inputTokens: reportedUsage?.prompt_tokens,
      outputTokens: reportedUsage?.completion_tokens,
      ...(generationId ? { generationId } : {}),
    };
    const costUsd = calculateImageCostUsd(usage);

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
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: costUsd,
        generationId,
      },
      'Image generation completed'
    );

    await recordImageCallCost(
      usage,
      options.costContext ? { durationMs, ...options.costContext } : undefined
    );

    return {
      base64Data,
      mimeType,
      width: actualDimensions.width,
      height: actualDimensions.height,
      ...(costUsd === undefined ? {} : { costUsd }),
      modelUsed: model,
      ...(usage.inputTokens === undefined ? {} : { inputTokens: usage.inputTokens }),
      ...(usage.outputTokens === undefined ? {} : { outputTokens: usage.outputTokens }),
      ...(generationId ? { generationId } : {}),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    await recordFailedImageSpend({
      model,
      generationId: slotRef?.generationId,
      durationMs,
      costContext: options.costContext,
    });

    // Check if it was a timeout/abort
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error({ model, durationMs }, 'Image generation timed out');
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
 * Write down what a failed image generation spent.
 *
 * A provider that has started work has been paid whether or not a picture comes
 * back, and until this existed the failure left no row anywhere — the same hole
 * `recordFailedAttempt` closed for text calls (mc2-ietzn).
 *
 * There are no token counts to estimate from, so the row is written without a
 * price and says so; `settleTraceCostFromProvider` replaces that with the real
 * charge as soon as the generation record is readable. Accounting must not be
 * able to fail a generation, so nothing is thrown from here — the caller is
 * about to rethrow the actual error, which is the one worth having.
 */
async function recordFailedImageSpend(params: {
  model: string;
  generationId: string | undefined;
  durationMs: number;
  costContext?: LlmCostContext;
}): Promise<void> {
  const { model, generationId, durationMs, costContext } = params;
  if (!generationId || !costContext) return;

  try {
    await recordImageCallCost(
      { model, generationId },
      { ...costContext, durationMs, stepName: 'image_call_failed' }
    );
  } catch (recordError) {
    logger.warn(
      {
        model,
        generationId,
        error: recordError instanceof Error ? recordError.message : String(recordError),
      },
      'Could not record the spend of a failed image generation'
    );
  }
}

/**
 * Generate a card image (1:1 square) using GPT-5 Image Mini
 *
 * Convenience wrapper for card generation with optimal settings.
 * GPT-5 Mini always generates 1024x1024 squares. It is not as cheap as this
 * comment used to claim: the $0.007 quoted here came from the private price
 * table this service kept, and one measured card was billed $0.045080
 * (mc2-5mhlb).
 *
 * @param prompt - Card image prompt
 * @returns Generated card image data
 */
export async function generateCardImage(
  prompt: string,
  costContext?: LlmCostContext,
  referenceImages: string[] = []
): Promise<ImageGenerationResult> {
  return generateImage(prompt, {
    model: await resolveImageModel('stage_7_card', CARD_IMAGE_MODEL, costContext?.courseId),
    aspectRatio: '1:1',
    imageSize: '1K',
    costContext,
    ...(referenceImages.length > 0 ? { referenceImages } : {}),
  });
}

/**
 * Generate a wide lesson banner.
 *
 * **16:9, not 21:9.** Both cover templates in `prompt_templates` tell the model
 * it is composing a "16:9 hero banner" — `stage7_cover_system` under Style
 * Guidelines and `stage7_cover_user` in its closing instruction — while this
 * function asked the API for 21:9. The model laid out for one frame and was
 * rendered into a wider one. The owner's requirement is a widescreen banner
 * rather than that exact ratio, so the code now agrees with the prompt instead
 * of the prompt being rewritten to excuse the code.
 *
 * It also widens the field considerably: 43 of the 48 image models publish 16:9,
 * against 19 that publish 21:9.
 *
 * @param prompt - Cover image prompt
 * @returns Generated image data
 */
export async function generateCoverImage(
  prompt: string,
  costContext?: LlmCostContext,
  referenceImages: string[] = []
): Promise<ImageGenerationResult> {
  return generateImage(prompt, {
    model: await resolveImageModel('stage_7_cover', DEFAULT_IMAGE_MODEL, costContext?.courseId),
    aspectRatio: '16:9',
    imageSize: '1K',
    costContext,
    ...(referenceImages.length > 0 ? { referenceImages } : {}),
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

  logger.info({ originalSizeBytes, quality }, 'Starting WebP conversion');

  const webpBuffer = await sharp(imageBuffer).webp({ quality, effort: 6 }).toBuffer();

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
