import {
  type CardEnrichmentContent,
  type CareerPlaybookGenerateImageJobData,
  CareerPlaybookQADataSchema,
  CareerPlaybookRoleProfileSpecSchema,
  type EnrichmentMetadata,
} from '@megacampus/shared-types';
import { logger } from '@/shared/logger';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { createPromptService } from '@/shared/prompts/prompt-service';
import {
  base64ToBuffer,
  convertToWebP,
  generateCardImage,
} from '@/stages/stage7-enrichments/services/image-generation-service';
import {
  buildPublicUrl,
  uploadCareerPlaybookCard,
} from '@/stages/stage7-enrichments/services/unified-storage-service';
import {
  DEFAULT_CARD_VISUAL_STYLE,
  retryWithBackoff,
} from '@/stages/stage7-enrichments/services/enrichment-utils';
import {
  mapPlaybookRow,
  toJson,
  type CareerPlaybookRow,
  type CareerPlaybookSupabase,
} from '@/server/routers/career-playbook/service-mappers';

type CareerPlaybookImageGenerationResult = {
  imageUrl: string;
  storagePath: string;
  content: CardEnrichmentContent;
  metadata: EnrichmentMetadata;
};

type PromptVars = {
  roleTitle: string;
  department: string;
  level: string;
  specialization: string;
  businessContextSummary: string;
  roleFocusSummary: string;
  languageContext: string;
  colorScheme: string;
  aesthetic: string;
  visualElements: string;
  mood: string;
};

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getCareerPlaybookSupabase(): CareerPlaybookSupabase {
  return getSupabaseAdmin() as unknown as CareerPlaybookSupabase;
}

function compactList(values: unknown, limit = 4): string {
  if (!Array.isArray(values)) return '';
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, limit)
    .join('; ');
}

function buildBusinessContextSummary(row: CareerPlaybookRow): string {
  const parsedQA = CareerPlaybookQADataSchema.safeParse(row.q_a_data);
  const digest = parsedQA.success ? parsedQA.data.business_context.digest : null;
  if (!digest) return 'Universal role guide without company-specific uploaded context.';

  const parts = [
    ['Product', compactList(digest.product)],
    ['Customers', compactList(digest.customers)],
    ['Processes', compactList(digest.processes)],
    ['Metrics', compactList(digest.metrics)],
    ['Constraints', compactList(digest.constraints)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);

  return parts.length > 0 ? parts.join('\n') : 'Company-specific context was provided.';
}

function buildRoleFocusSummary(row: CareerPlaybookRow): string {
  const parsedSpec = CareerPlaybookRoleProfileSpecSchema.safeParse(row.role_profile_spec);
  if (!parsedSpec.success) return 'Focus on role responsibilities, decisions, tools, and outcomes.';

  const spec = parsedSpec.data;
  const parts = [
    ['KPIs', compactList(spec.focus_areas.primary_kpis)],
    ['Tools', compactList(spec.focus_areas.key_tools)],
    ['Competencies', compactList(spec.focus_areas.critical_competencies)],
    ['Anti-goals', compactList(spec.focus_areas.anti_goals)],
    ['Failure patterns', compactList(spec.focus_areas.failure_patterns)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);

  return parts.length > 0 ? parts.join('\n') : 'Focus on role responsibilities and outcomes.';
}

/**
 * Per-department visual direction for the cover.
 *
 * Every role previously received the same `DEFAULT_CARD_VISUAL_STYLE`, which is
 * why the reviewed cover was a generic blue "business growth" scene that said
 * nothing about B2B sales leadership. The role focus already reaches the prompt;
 * what was missing was any variation in the visual direction itself.
 */
const DEPARTMENT_CARD_VISUAL_STYLES: Record<
  string,
  { colorScheme: string; visualElements: string; mood: string }
> = {
  sales: {
    colorScheme: 'deep teal and warm amber with high contrast',
    visualElements: 'pipeline funnels, upward trajectories, negotiation table silhouettes',
    mood: 'decisive, energetic, relationship-driven',
  },
  engineering: {
    colorScheme: 'indigo and cyan on a dark neutral base',
    visualElements: 'modular blocks, connected nodes, layered architecture planes',
    mood: 'precise, systematic, calm',
  },
  marketing: {
    colorScheme: 'magenta and coral with a light neutral base',
    visualElements: 'audience clusters, signal waves, campaign layers',
    mood: 'expressive, inventive, outward-facing',
  },
  hr: {
    colorScheme: 'warm violet and sand',
    visualElements: 'growth paths, abstract people groupings, development ladders',
    mood: 'supportive, human, steady',
  },
  finance: {
    colorScheme: 'forest green and graphite',
    visualElements: 'balance structures, layered ledgers, measured grids',
    mood: 'rigorous, controlled, trustworthy',
  },
  operations: {
    colorScheme: 'slate blue and safety orange',
    visualElements: 'process flows, checkpoints, throughput lanes',
    mood: 'orderly, reliable, kinetic',
  },
  product: {
    colorScheme: 'royal purple and soft lime',
    visualElements: 'roadmaps, discovery loops, prioritization matrices',
    mood: 'curious, deliberate, forward-looking',
  },
};

/** Visual direction for a department, falling back to the shared default. */
export function resolveCareerPlaybookCardVisualStyle(department: string | null | undefined) {
  const key = (department ?? '').trim().toLowerCase();
  const departmentStyle = DEPARTMENT_CARD_VISUAL_STYLES[key];

  return {
    colorScheme: departmentStyle?.colorScheme ?? DEFAULT_CARD_VISUAL_STYLE.colorScheme,
    aesthetic: DEFAULT_CARD_VISUAL_STYLE.aesthetic,
    visualElements: departmentStyle?.visualElements ?? DEFAULT_CARD_VISUAL_STYLE.visualElements,
    mood: departmentStyle?.mood ?? DEFAULT_CARD_VISUAL_STYLE.mood,
  };
}

function buildPromptVars(row: CareerPlaybookRow): PromptVars {
  const parsedSpec = CareerPlaybookRoleProfileSpecSchema.safeParse(row.role_profile_spec);
  const spec = parsedSpec.success ? parsedSpec.data : null;
  const language = row.language ?? spec?.content_language ?? 'en';
  const languageContext =
    language === 'ru'
      ? 'Russian role guide content'
      : language === 'en'
        ? 'English role guide content'
        : `${language} role guide content`;

  return {
    roleTitle: row.position_title ?? spec?.position.title ?? 'Role Guide',
    department: row.department ?? spec?.position.department ?? 'business function',
    level: row.level ?? spec?.position.level ?? 'professional',
    specialization: row.specialization ?? spec?.position.specialization ?? 'general role scope',
    businessContextSummary: buildBusinessContextSummary(row),
    roleFocusSummary: buildRoleFocusSummary(row),
    languageContext,
    ...resolveCareerPlaybookCardVisualStyle(row.department ?? spec?.position.department),
  };
}

function buildFallbackPrompt(vars: PromptVars): string {
  return `A professional 1:1 square thumbnail for a Career Playbook / Role Guide about "${vars.roleTitle}" in ${vars.department}, ${vars.level} level. Use symbolic business imagery for responsibilities, tools, decisions, collaboration, and measurable outcomes. Modern professional digital art, ${vars.colorScheme}, ${vars.aesthetic}, ${vars.visualElements}, ${vars.mood}. Absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, no logos, no watermarks, text-free image.`;
}

function getRoleGuideAltText(language: string, title: string): string {
  if (language === 'ru') return `Изображение должностной инструкции: ${title}`;
  return `Role Guide image: ${title}`;
}

async function loadCompletedPlaybook(playbookId: string): Promise<CareerPlaybookRow> {
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('*')
    .eq('id', playbookId)
    .single();

  if (error || !data) {
    throw new Error(`Career Playbook not found for image generation: ${errorMessageFrom(error)}`);
  }

  const row = mapPlaybookRow(data);
  if (row.status !== 'completed') {
    throw new Error('Career Playbook must be completed before image generation');
  }

  return row;
}

async function updatePlaybookImage(
  playbookId: string,
  payload: Partial<CareerPlaybookRow>
): Promise<void> {
  const supabase = getCareerPlaybookSupabase();
  const { error } = await supabase
    .from('career_playbooks')
    .update(payload)
    .eq('id', playbookId)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to update Career Playbook image status: ${errorMessageFrom(error)}`);
  }
}

export async function generateCareerPlaybookImage(
  jobData: CareerPlaybookGenerateImageJobData
): Promise<CareerPlaybookImageGenerationResult> {
  const startTime = Date.now();
  const row = await loadCompletedPlaybook(jobData.playbookId);
  const attempt = (row.image_generation_attempt ?? 0) + 1;
  const startedAt = new Date().toISOString();

  await updatePlaybookImage(row.id, {
    image_status: 'generating',
    image_generation_attempt: attempt,
    image_error_message: null,
    image_updated_at: startedAt,
  });

  try {
    const promptVars = buildPromptVars(row);
    const promptService = createPromptService();
    let imagePrompt: string;

    try {
      imagePrompt = await promptService.renderPrompt('career_playbook_card', promptVars);
    } catch (error) {
      logger.warn(
        { playbookId: row.id, error: errorMessageFrom(error) },
        'Failed to render Career Playbook card prompt from prompt service, using fallback'
      );
      imagePrompt = buildFallbackPrompt(promptVars);
    }

    const imageResult = await generateCardImage(imagePrompt);
    const originalBuffer = base64ToBuffer(imageResult.base64Data);
    const webpResult = await convertToWebP(originalBuffer, 85);
    const storagePath = await retryWithBackoff(
      () => uploadCareerPlaybookCard(row.id, webpResult.buffer, 'webp'),
      3,
      1000,
      'Career Playbook card upload'
    );
    const imageUrl = buildPublicUrl(storagePath);
    const durationMs = Date.now() - startTime;
    const title = promptVars.roleTitle;

    const content: CardEnrichmentContent = {
      type: 'card',
      imageUrl,
      altText: getRoleGuideAltText(row.language, title),
      dimensions: {
        width: imageResult.width,
        height: imageResult.height,
      },
      visualStyle: {
        colorScheme: DEFAULT_CARD_VISUAL_STYLE.colorScheme,
        aesthetic: DEFAULT_CARD_VISUAL_STYLE.aesthetic,
      },
      generation_prompt: imagePrompt.slice(0, 500),
      format: 'webp',
      file_size_bytes: webpResult.sizeBytes,
    };

    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: durationMs,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: imageResult.costUsd,
      model_used: imageResult.modelUsed,
      quality_score: 1,
      retry_attempts: attempt,
      additional_info: {
        storage_path: storagePath,
        card_type: 'career_playbook',
      },
    };

    await updatePlaybookImage(row.id, {
      image_status: 'completed',
      image_content: toJson(content),
      image_metadata: toJson(metadata),
      image_error_message: null,
      image_updated_at: new Date().toISOString(),
    });

    logger.info(
      {
        playbookId: row.id,
        imageUrl,
        storagePath,
        durationMs,
        costUsd: imageResult.costUsd,
      },
      'Career Playbook image generation completed'
    );

    return { imageUrl, storagePath, content, metadata };
  } catch (error) {
    const message = errorMessageFrom(error);
    await updatePlaybookImage(row.id, {
      image_status: 'failed',
      image_error_message: message,
      image_updated_at: new Date().toISOString(),
    });

    logger.error(
      {
        playbookId: row.id,
        durationMs: Date.now() - startTime,
        error: message,
      },
      'Career Playbook image generation failed'
    );

    throw error;
  }
}
