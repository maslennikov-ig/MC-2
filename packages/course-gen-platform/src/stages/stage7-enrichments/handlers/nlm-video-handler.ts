/**
 * NotebookLM Video Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-video-handler
 *
 * Two-stage flow:
 * - Phase 1: Generate/edit script draft (reuses existing video draft generation)
 * - Phase 2: Generate final video artifact through NotebookLM bridge
 */

import { logger } from '@/shared/logger';
import type { EnrichmentMetadata, VideoEnrichmentContent } from '@megacampus/shared-types';
import { videoScriptOutputSchema, type VideoScriptOutput } from '../prompts/video-prompt';
import { getLessonContent } from '../services/database-service';
import {
  notebookLmBridgeClient,
  type NotebookLMSourceInput,
  type NotebookLMVideoFormatPreset,
  type NotebookLMVideoStylePreset,
} from '../services/notebooklm-bridge-client';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { DraftResult, EnrichmentHandlerInput, GenerateResult } from '../types';
import { videoHandler } from './video-handler';

interface ParsedVideoDraft {
  fullScript: string;
  estimatedDurationSeconds?: number;
  sectionCount?: number;
  tone?: string;
  pacing?: string;
}

type NlmSourceStrategy = 'script_only' | 'raw_only' | 'hybrid';

const NLM_SOURCE_STRATEGIES: NlmSourceStrategy[] = ['script_only', 'raw_only', 'hybrid'];
const NLM_VIDEO_FORMAT_PRESETS: NotebookLMVideoFormatPreset[] = ['explainer', 'brief'];
const NLM_VIDEO_STYLE_PRESETS: NotebookLMVideoStylePreset[] = [
  'auto_select',
  'custom',
  'classic',
  'whiteboard',
  'kawaii',
  'anime',
  'watercolor',
  'retro_print',
  'heritage',
  'paper_craft',
];
const NLM_DEFAULT_SOURCE_STRATEGY: NlmSourceStrategy = 'hybrid';
const NLM_DEFAULT_VIDEO_FORMAT: NotebookLMVideoFormatPreset = 'explainer';
const NLM_DEFAULT_VIDEO_STYLE: NotebookLMVideoStylePreset = 'auto_select';

function buildFullScript(scriptOutput: VideoScriptOutput): string {
  const scriptParts: string[] = [];

  scriptParts.push(scriptOutput.script.intro.text);
  scriptParts.push('');

  for (const section of scriptOutput.script.sections) {
    scriptParts.push(`[${section.title}]`);
    scriptParts.push(section.narration);
    scriptParts.push('');
  }

  scriptParts.push(scriptOutput.script.conclusion.text);

  return scriptParts.join('\n\n').trim();
}

function parseDraft(rawDraft: unknown): ParsedVideoDraft {
  if (!rawDraft || typeof rawDraft !== 'object') {
    throw new Error('Invalid draft content for NotebookLM video generation');
  }

  const value = rawDraft as Record<string, unknown>;
  const candidate =
    value.draft && typeof value.draft === 'object'
      ? (value.draft as Record<string, unknown>)
      : value;

  // Preferred: structured video script output
  const structured = videoScriptOutputSchema.safeParse(candidate);
  if (structured.success) {
    return {
      fullScript: buildFullScript(structured.data),
      estimatedDurationSeconds: structured.data.metadata.total_duration_seconds,
      sectionCount: structured.data.script.sections.length,
      tone: structured.data.metadata.tone,
      pacing: structured.data.metadata.pacing,
    };
  }

  // Fallback: plain script draft (for manual editing scenarios)
  const plainScript = candidate.script;
  if (typeof plainScript === 'string' && plainScript.trim()) {
    const durationValue = candidate.estimated_duration_seconds;
    const sectionCountValue = candidate.section_count;

    return {
      fullScript: plainScript.trim(),
      estimatedDurationSeconds:
        typeof durationValue === 'number' && Number.isFinite(durationValue) && durationValue > 0
          ? durationValue
          : undefined,
      sectionCount:
        typeof sectionCountValue === 'number' &&
        Number.isFinite(sectionCountValue) &&
        sectionCountValue > 0
          ? sectionCountValue
          : undefined,
      tone: typeof candidate.tone === 'string' ? candidate.tone : undefined,
      pacing: typeof candidate.pacing === 'string' ? candidate.pacing : undefined,
    };
  }

  throw new Error('Draft does not contain a valid video script');
}

function isStringInSet<T extends string>(value: unknown, allowedValues: readonly T[]): value is T {
  return typeof value === 'string' && allowedValues.includes(value as T);
}

function resolveSourceStrategy(settings: Record<string, unknown>): NlmSourceStrategy {
  const strategy = settings.nlm_source_strategy;
  if (isStringInSet(strategy, NLM_SOURCE_STRATEGIES)) {
    return strategy;
  }
  return NLM_DEFAULT_SOURCE_STRATEGY;
}

function resolveVideoFormatPreset(settings: Record<string, unknown>): NotebookLMVideoFormatPreset {
  const preset = settings.nlm_video_format;
  if (isStringInSet(preset, NLM_VIDEO_FORMAT_PRESETS)) {
    return preset;
  }
  return NLM_DEFAULT_VIDEO_FORMAT;
}

function resolveVideoStylePreset(settings: Record<string, unknown>): NotebookLMVideoStylePreset {
  const preset = settings.nlm_video_style;
  if (isStringInSet(preset, NLM_VIDEO_STYLE_PRESETS)) {
    return preset;
  }
  return NLM_DEFAULT_VIDEO_STYLE;
}

function buildObjectivesAndMetadataSource(
  input: EnrichmentHandlerInput
): NotebookLMSourceInput | null {
  const { enrichmentContext } = input;
  const objectives = enrichmentContext.lesson.objectives ?? [];

  const lines: string[] = [
    `Course: ${enrichmentContext.course.title}`,
    `Lesson: ${enrichmentContext.lesson.title}`,
  ];

  if (objectives.length > 0) {
    lines.push('Learning objectives:');
    for (const objective of objectives) {
      lines.push(`- ${objective}`);
    }
  }

  const content = lines.join('\n').trim();
  if (!content) {
    return null;
  }

  return {
    title: 'Lesson Objectives & Metadata',
    content,
  };
}

function buildNotebookLMSources(params: {
  strategy: NlmSourceStrategy;
  fullScript: string;
  rawLessonContent: string | null;
  input: EnrichmentHandlerInput;
}): NotebookLMSourceInput[] {
  const scriptSource: NotebookLMSourceInput = {
    title: 'Video Draft Script',
    content: params.fullScript,
  };

  const rawSource: NotebookLMSourceInput | null =
    params.rawLessonContent && params.rawLessonContent.trim()
      ? {
          title: 'Raw Lesson Content',
          content: params.rawLessonContent.trim(),
        }
      : null;

  const objectivesSource = buildObjectivesAndMetadataSource(params.input);
  const sources: NotebookLMSourceInput[] = [];

  if (params.strategy === 'script_only') {
    sources.push(scriptSource);
  } else if (params.strategy === 'raw_only') {
    if (rawSource) {
      sources.push(rawSource);
    }
    if (objectivesSource) {
      sources.push(objectivesSource);
    }
  } else {
    sources.push(scriptSource);
    if (rawSource) {
      sources.push(rawSource);
    }
    if (objectivesSource) {
      sources.push(objectivesSource);
    }
  }

  if (sources.length === 0) {
    sources.push(scriptSource);
  }

  return sources;
}

async function generateDraft(input: EnrichmentHandlerInput): Promise<DraftResult> {
  if (!videoHandler.generateDraft) {
    throw new Error('Video draft generation is not configured');
  }

  logger.info(
    {
      enrichmentId: input.enrichmentContext.enrichment.id,
      lessonId: input.enrichmentContext.lesson.id,
    },
    'NLM video handler: generating draft (reusing video draft pipeline)'
  );

  return videoHandler.generateDraft(input);
}

async function generateFinal(
  input: EnrichmentHandlerInput,
  draft: DraftResult
): Promise<GenerateResult> {
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
    },
    'NLM video handler: generating final video via NotebookLM bridge'
  );

  const parsedDraft = parseDraft(draft.draftContent);
  let rawLessonContent: string | null = null;

  try {
    rawLessonContent = await getLessonContent(enrichmentContext.lesson.id);
  } catch (error) {
    logger.warn(
      {
        lessonId: enrichmentContext.lesson.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'NLM video handler: failed to load raw lesson content for source bundle'
    );
  }

  const sourceStrategy = resolveSourceStrategy(settings);
  const videoFormatPreset = resolveVideoFormatPreset(settings);
  const videoStylePreset = resolveVideoStylePreset(settings);
  const sources = buildNotebookLMSources({
    strategy: sourceStrategy,
    fullScript: parsedDraft.fullScript,
    rawLessonContent,
    input,
  });

  const bridgeResult = await notebookLmBridgeClient.generateVideoOverview({
    lessonTitle: enrichmentContext.lesson.title,
    script: parsedDraft.fullScript,
    language: enrichmentContext.course.language || 'en',
    sources,
    videoFormat: videoFormatPreset,
    videoStyle: videoStylePreset,
  });

  const content: VideoEnrichmentContent = {
    type: 'video',
    script: parsedDraft.fullScript,
    avatar_id: (settings.avatar_id as string) || undefined,
    estimated_duration_seconds:
      bridgeResult.durationSeconds ?? parsedDraft.estimatedDurationSeconds ?? undefined,
    slides_sync_points: undefined,
  };

  const durationMs = Date.now() - startTime;

  const metadata: EnrichmentMetadata = {
    generated_at: new Date().toISOString(),
    generation_duration_ms: (draft.metadata.durationMs || 0) + durationMs,
    total_tokens: draft.metadata.tokensUsed,
    estimated_cost_usd: 0,
    model_used: draft.metadata.modelUsed || 'notebooklm-bridge',
    quality_score: 1.0,
    retry_attempts: 0,
    additional_info: {
      bridge: 'notebooklm',
      section_count: parsedDraft.sectionCount,
      tone: parsedDraft.tone,
      pacing: parsedDraft.pacing,
      source_strategy_used: sourceStrategy,
      source_count: sources.length,
      video_format_preset: videoFormatPreset,
      video_style_preset: videoStylePreset,
      mime_type: bridgeResult.mimeType,
      format: bridgeResult.extension,
      bridge_response: bridgeResult.responseMetadata,
    },
  };

  return {
    content,
    metadata,
    assetBuffer: bridgeResult.buffer,
    assetMimeType: bridgeResult.mimeType,
    assetExtension: bridgeResult.extension,
  };
}

async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const draft = await generateDraft(input);
  return generateFinal(input, draft);
}

export const nlmVideoHandler: EnrichmentHandler = {
  generationFlow: 'two-stage',
  generateDraft,
  generateFinal,
  generate,
};
