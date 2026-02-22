/**
 * Shared utilities for NotebookLM enrichment handlers (audio & video).
 * @module stages/stage7-enrichments/handlers/nlm-shared
 *
 * Extracted to avoid duplication between nlm-audio-handler and nlm-video-handler.
 */

import type { NotebookLMSourceInput } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandlerInput } from '../types';

export type NlmSourceStrategy = 'script_only' | 'raw_only' | 'hybrid';

export const NLM_SOURCE_STRATEGIES: NlmSourceStrategy[] = ['script_only', 'raw_only', 'hybrid'];
export const NLM_DEFAULT_SOURCE_STRATEGY: NlmSourceStrategy = 'hybrid';

export interface NlmDurationGuidance {
  targetMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

const NLM_MIN_DURATION_MINUTES = 4;
const NLM_MAX_DURATION_MINUTES = 7;
const NLM_DEFAULT_TARGET_DURATION_MINUTES = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function resolveNlmDurationGuidance(lessonDurationMinutes: unknown): NlmDurationGuidance {
  const parsedDuration =
    typeof lessonDurationMinutes === 'number' && Number.isFinite(lessonDurationMinutes)
      ? lessonDurationMinutes
      : NLM_DEFAULT_TARGET_DURATION_MINUTES;

  const targetMinutes = clamp(
    Math.round(parsedDuration),
    NLM_MIN_DURATION_MINUTES,
    NLM_MAX_DURATION_MINUTES
  );

  return {
    targetMinutes,
    minMinutes: NLM_MIN_DURATION_MINUTES,
    maxMinutes: NLM_MAX_DURATION_MINUTES,
  };
}

export function isStringInSet<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): value is T {
  return typeof value === 'string' && allowedValues.includes(value as T);
}

export function resolveSourceStrategy(settings: Record<string, unknown>): NlmSourceStrategy {
  const strategy = settings.nlm_source_strategy;
  if (isStringInSet(strategy, NLM_SOURCE_STRATEGIES)) {
    return strategy;
  }
  return NLM_DEFAULT_SOURCE_STRATEGY;
}

export function buildObjectivesAndMetadataSource(
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

export function buildNotebookLMSources(params: {
  strategy: NlmSourceStrategy;
  scriptContent: string;
  scriptTitle: string;
  rawLessonContent: string | null;
  input: EnrichmentHandlerInput;
}): NotebookLMSourceInput[] {
  const scriptSource: NotebookLMSourceInput = {
    title: params.scriptTitle,
    content: params.scriptContent,
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
