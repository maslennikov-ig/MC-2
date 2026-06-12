import { calculateRequiredTokens } from '@megacampus/shared-types';
import type { PhaseName } from '@megacampus/shared-types/model-config';
import type { LanguageCode } from '@/shared/workspace-utils';
import { createModelConfigService } from '@/shared/llm/model-config-service';

export interface Stage6PhaseModelContext {
  courseId?: string;
  language?: string | null;
  tokenCount?: number;
  contentLengthChars?: number;
  lessonDurationMinutes?: number;
}

export function normalizeStage6Language(language?: string | null): LanguageCode {
  const normalized = language?.trim().toLowerCase();
  return (normalized && normalized.length > 0 ? normalized : 'en') as LanguageCode;
}

export function normalizeStage6PhaseModelContext(context: Stage6PhaseModelContext = {}): {
  courseId?: string;
  language: LanguageCode;
  tokenCount: number;
} {
  const language = normalizeStage6Language(context.language);
  const tokenCount =
    context.tokenCount ??
    calculateRequiredTokens({
      lessonDurationMinutes: context.lessonDurationMinutes,
      language,
      contentLengthChars: context.contentLengthChars,
    });

  return {
    courseId: context.courseId,
    language,
    tokenCount,
  };
}

export async function getStage6PhaseConfig(
  phaseName: PhaseName,
  context: Stage6PhaseModelContext = {}
) {
  const modelConfigService = createModelConfigService();
  const normalized = normalizeStage6PhaseModelContext(context);

  return modelConfigService.getModelForPhase(
    phaseName,
    normalized.courseId,
    normalized.tokenCount,
    normalized.language
  );
}
