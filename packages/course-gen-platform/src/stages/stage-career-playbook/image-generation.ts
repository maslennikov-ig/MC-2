import {
  type CardEnrichmentContent,
  type CareerPlaybookGenerateImageJobData,
  type CareerPlaybookNodeCost,
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
  type ImageGenerationResult,
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
import { appendCareerPlaybookNodeCost } from '@/server/routers/career-playbook/cost-breakdown';
import { fetchGenerationFact } from '@/shared/llm/openrouter-generation';

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

/**
 * Charge the cover to the playbook that ordered it.
 *
 * The cover was the one paid call in the whole system that reached no ledger at
 * all. `recordImageCallCost` needs a `courseId` because `generation_trace.course_id`
 * is a foreign key into `courses`, and a playbook is not a course — so the call
 * logged `Image generated without a course context` and the money vanished. On
 * 2026-08-21 that single picture was the entire $0.045080 residual between the
 * report's TOTAL and the OpenRouter invoice (mc2-j9pmq).
 *
 * So it goes where a playbook's spend already lives: `career_playbooks.cost_breakdown`,
 * which `pnpm cost:report --since` already reads. Written from this job rather
 * than from the generation handler because this job finishes *after* the playbook
 * row is written — and appended, never assigned, or it would erase the node costs
 * of the generation that preceded it.
 *
 * The wait for the receipt is deliberate. A generation record takes about ten
 * seconds to become readable, and nothing else will ever come back for this row:
 * unlike a `generation_trace` row there is no deferred settle behind it. Ten
 * seconds at the end of a job that has already spent fifty on the picture is the
 * cheapest honest price available.
 *
 * Never throws. A cover that generated is a cover that generated; failing the
 * job over its accounting would trade a delivered picture for a bookkeeping
 * entry.
 */
async function recordCoverCost(
  playbookId: string,
  imageResult: ImageGenerationResult,
  durationMs: number,
  attempt: number
): Promise<void> {
  try {
    const fact = imageResult.generationId
      ? await fetchGenerationFact(imageResult.generationId)
      : null;

    // `== null` and not falsy: a provider that charged exactly $0 measured that,
    // and it is not the same as having no receipt (mc2-y452l).
    const billed = fact?.usageUsd != null;
    const costUsd = billed ? (fact?.usageUsd as number) : (imageResult.costUsd ?? 0);

    const nodeCost: CareerPlaybookNodeCost = {
      node: 'cardImage',
      model: imageResult.modelUsed,
      input_tokens: imageResult.inputTokens ?? 0,
      output_tokens: imageResult.outputTokens ?? 0,
      cost_usd: costUsd,
      duration_ms: durationMs,
      attempts: attempt,
      outcome: 'succeeded',
      // Unknown only when there is neither a receipt nor an estimate. An
      // estimate is a number we stand behind; a zero we invented is not.
      cost_unknown: !billed && imageResult.costUsd === undefined,
      ...(imageResult.generationId ? { generation_id: imageResult.generationId } : {}),
      ...(fact?.providerName ? { provider_name: fact.providerName } : {}),
      ...(billed ? { billed_by_provider: true } : {}),
    };

    const supabase = getCareerPlaybookSupabase();
    const { data, error: readError } = await supabase
      .from('career_playbooks')
      .select('cost_breakdown')
      .eq('id', playbookId)
      .single();

    if (readError) {
      throw new Error(`Could not read the existing cost breakdown: ${errorMessageFrom(readError)}`);
    }

    const breakdown = appendCareerPlaybookNodeCost(
      (data as { cost_breakdown: unknown } | null)?.cost_breakdown,
      nodeCost
    );

    const { error: writeError } = await supabase
      .from('career_playbooks')
      .update({ cost_breakdown: toJson(breakdown) } as Partial<CareerPlaybookRow>)
      .eq('id', playbookId)
      .select('id')
      .single();

    if (writeError) {
      throw new Error(`Could not write the cost breakdown: ${errorMessageFrom(writeError)}`);
    }

    logger.info(
      {
        playbookId,
        model: nodeCost.model,
        costUsd: nodeCost.cost_usd,
        billedByProvider: billed,
        providerName: fact?.providerName,
        generationId: imageResult.generationId,
        estimatedCostUsd: imageResult.costUsd,
        playbookTotalUsd: breakdown.total_cost_usd,
      },
      'Career Playbook cover cost recorded against the playbook'
    );
  } catch (error) {
    logger.warn(
      { playbookId, error: errorMessageFrom(error) },
      'Could not record the Career Playbook cover cost; the picture is delivered, the ledger is short by it'
    );
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
      input_tokens: imageResult.inputTokens ?? 0,
      output_tokens: imageResult.outputTokens ?? 0,
      total_tokens: (imageResult.inputTokens ?? 0) + (imageResult.outputTokens ?? 0),
      // The estimate, for display. The figure that reconciles lives in
      // `career_playbooks.cost_breakdown`, written by `recordCoverCost` below
      // from the provider's own charge.
      estimated_cost_usd: imageResult.costUsd ?? 0,
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
        estimatedCostUsd: imageResult.costUsd,
        generationId: imageResult.generationId,
      },
      'Career Playbook image generation completed'
    );

    // After the picture is safely stored and the row says `completed`: the
    // accounting waits on the provider's record, and a delivered cover must not
    // depend on that wait finishing.
    await recordCoverCost(row.id, imageResult, durationMs, attempt);

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
