import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { attachCostRecording } from '@/shared/llm/model-cost-callbacks';
import { logger } from '@/shared/logger';
import { STAGE6_TIER_MODELS } from '../nodes/generator/generator-constants';
import { QualityRemediationAction } from './remediation';

export interface PresentationCriticResult {
  invoked: boolean;
  findingCount: number;
  findings: string[];
  upgradedAction: QualityRemediationAction | null;
}

const PRESENTATION_CRITIC_PROMPT = `You are a strict presentation critic for generated lesson markdown.
Read the lesson as a student and report only obvious issues that look strange on screen or feel wrong for the audience.

Focus only on:
- mixed-language headings
- obvious overuse/repetition
- unnecessary technical artifacts for the stated audience
- formatting that looks broken or distracting

Return strict JSON:
{
  "findings": ["..."],
  "upgradedAction": "PARTIAL_REGEN" | "FULL_REGEN" | "REVIEW_REQUIRED" | null
}

Rules:
- max 5 findings
- do not score the content
- do not discuss pedagogy unless it creates obvious audience mismatch
- keep findings short and concrete`;

export async function runPresentationCritic(args: {
  markdown: string;
  lessonSpec: LessonSpecificationV2;
  courseId?: string;
}): Promise<PresentationCriticResult> {
  const model = attachCostRecording(
    createOpenRouterModel(STAGE6_TIER_MODELS.simple, 0.1, 400),
    STAGE6_TIER_MODELS.simple,
    'stage_6_simple',
    args.courseId
  );
  const prompt = `${PRESENTATION_CRITIC_PROMPT}

Audience: ${args.lessonSpec.metadata?.target_audience ?? 'unspecified'}
Archetype: ${args.lessonSpec.metadata?.content_archetype ?? 'concept_explainer'}

Lesson markdown:
${args.markdown.length > 12000 ? args.markdown.slice(0, 12000) + '\n\n[... truncated for review ...]' : args.markdown}`;

  try {
    const response = await model.invoke(prompt);
    const raw =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    const parsed = JSON.parse(raw) as {
      findings?: unknown;
      upgradedAction?: unknown;
    };

    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : [];
    const upgradedAction =
      parsed.upgradedAction === QualityRemediationAction.PARTIAL_REGEN ||
      parsed.upgradedAction === QualityRemediationAction.FULL_REGEN ||
      parsed.upgradedAction === QualityRemediationAction.REVIEW_REQUIRED
        ? parsed.upgradedAction
        : null;

    return {
      invoked: true,
      findingCount: findings.length,
      findings,
      upgradedAction,
    };
  } catch (error) {
    logger.warn(
      {
        lessonId: args.lessonSpec.lesson_id,
        error: error instanceof Error ? error.message : String(error),
      },
      'Stage 6 presentation critic failed; continuing without upgrade'
    );

    return {
      invoked: true,
      findingCount: 0,
      findings: [],
      upgradedAction: null,
    };
  }
}
